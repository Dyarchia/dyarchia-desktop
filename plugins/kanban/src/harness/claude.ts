import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseTerminal } from '../closing.js'
import { Refusal } from '../refusal.js'
import type { Run } from '../types.js'
import * as corpus from './corpus.js'
import { capture, findBinary, invocation } from './process.js'
import type {
    Driver,
    HistoryRow,
    Invocation,
    Launched,
    LaunchSpec,
    Liveness,
    Progress
} from './types.js'

const BINARY = 'claude'
const TIMEOUT_MS = 20_000
const LAUNCH_TIMEOUT_MS = 60_000
const SETTLE_TRIES = 10
const SETTLE_MS = 400
const REVIEW_MODE = 'plan'
const DENIED = ['Bash', 'PowerShell']

const LIVE = new Set(['working', 'blocked'])
const FINISHED = new Set(['done', 'stopped', 'failed'])

export interface SessionRecord {
    shortId: string
    sessionId: string
    cwd: string
    name: string
    state: string
    status: string
    startedAt: number
}

export interface Launch {
    shortId: string
    sessionId: string
    cwd: string
}

async function run(args: string[], cwd?: string): Promise<string> {
    const path = await findBinary(BINARY)
    if (!path) throw new Error('claude is not on PATH')
    return capture(invocation(path, args), { cwd, timeout: TIMEOUT_MS })
}

function record(raw: unknown): SessionRecord | null {
    const row = raw as Record<string, unknown>
    if (row?.kind !== 'background') return null
    if (typeof row.sessionId !== 'string' || typeof row.id !== 'string') return null

    return {
        shortId: row.id,
        sessionId: row.sessionId,
        cwd: typeof row.cwd === 'string' ? row.cwd : '',
        name: typeof row.name === 'string' ? row.name : '',
        state: typeof row.state === 'string' ? row.state : '',
        status: typeof row.status === 'string' ? row.status : '',
        startedAt: typeof row.startedAt === 'number' ? row.startedAt : 0
    }
}

export async function snapshot(): Promise<SessionRecord[] | null> {
    try {
        const parsed = JSON.parse(await run(['agents', '--json', '--all'])) as unknown
        if (!Array.isArray(parsed)) return null
        return parsed.map(record).filter((entry): entry is SessionRecord => entry !== null)
    } catch {
        return null
    }
}

export function find(sessions: SessionRecord[] | null, sessionId: string): SessionRecord | null {
    return sessions?.find((entry) => entry.sessionId === sessionId) ?? null
}

export function liveness(sessions: SessionRecord[] | null, sessionId: string): Liveness {
    if (sessions === null) return 'unknown'
    const session = find(sessions, sessionId)
    if (!session) return 'dead'
    if (FINISHED.has(session.state)) return 'dead'
    if (LIVE.has(session.state)) return 'alive'
    return 'unknown'
}

export function waiting(session: SessionRecord | null): boolean {
    return session?.state === 'blocked'
}

function projectsRoot(): string {
    return join(homedir(), '.claude', 'projects')
}

function mangle(cwd: string): string {
    return cwd.replace(/[:\\/]/g, '-')
}

export async function transcript(cwd: string, sessionId: string): Promise<string | null> {
    const direct = join(projectsRoot(), mangle(cwd), `${sessionId}.jsonl`)
    if (await stat(direct).catch(() => null)) return direct

    const roots = await readdir(projectsRoot()).catch(() => [])
    for (const root of roots) {
        const candidate = join(projectsRoot(), root, `${sessionId}.jsonl`)
        if (await stat(candidate).catch(() => null)) return candidate
    }
    return null
}

export function parseLaunch(stdout: string, sessions: SessionRecord[] | null): Launch | null {
    const match = /backgrounded\s*\S\s*([0-9a-f]{8})\b/i.exec(stdout)
    if (!match) return null

    const shortId = match[1]
    const session = sessions?.find((entry) => entry.shortId === shortId)
    return {
        shortId,
        sessionId: session?.sessionId ?? '',
        cwd: session?.cwd ?? ''
    }
}

export function launchArgv(options: {
    name: string
    permissionMode: string
    addDirs: string[]
    model: string | null
    effort: string | null
    worktree: string | null
    deny?: string[]
    mcpConfig?: string | null
    prompt: string
}): string[] {
    const args = ['--bg', '--permission-mode', options.permissionMode]
    for (const dir of options.addDirs) args.push('--add-dir', dir)
    if (options.worktree) args.push('--worktree', options.worktree)
    if (options.model) args.push('--model', options.model)
    if (options.effort) args.push('--effort', options.effort)
    if (options.deny?.length) args.push('--disallowedTools', ...options.deny)
    if (options.mcpConfig) args.push('--mcp-config', options.mcpConfig, '--allowedTools', corpus.TOOL)
    args.push('-n', options.name, options.prompt)
    return args
}

export function worktreePath(workspace: string, isolate: string): string {
    return join(workspace, '.claude', 'worktrees', isolate)
}

async function settle(path: string): Promise<string | null> {
    for (let attempt = 0; attempt < SETTLE_TRIES; attempt += 1) {
        if ((await stat(path).catch(() => null))?.isDirectory()) return path
        await new Promise((resume) => setTimeout(resume, SETTLE_MS))
    }
    return null
}

async function launch(spec: LaunchSpec): Promise<Launched> {
    const path = await findBinary(BINARY)
    if (!path) throw new Error('claude is not on PATH')

    const reviewing = spec.kind === 'review'
    const argv = launchArgv({
        name: spec.name,
        permissionMode: reviewing ? REVIEW_MODE : spec.permissionMode,
        addDirs: spec.addDirs,
        model: spec.model,
        effort: spec.effort,
        worktree: spec.isolate,
        deny: reviewing ? DENIED : [],
        mcpConfig: await corpus.configure(),
        prompt: spec.prompt
    })

    const stdout = await capture(invocation(path, argv), {
        cwd: spec.workspace,
        timeout: LAUNCH_TIMEOUT_MS
    })
    const launched = parseLaunch(stdout, await snapshot())
    if (!launched?.sessionId) throw new Error('the launcher printed no session id')

    return {
        shortId: launched.shortId,
        sessionId: launched.sessionId,
        worktree: spec.isolate ? await settle(worktreePath(spec.workspace, spec.isolate)) : null
    }
}

async function progress(place: string, run: Run): Promise<Progress | null> {
    if (!run.sessionId) return null
    const path = await transcript(place, run.sessionId)
    if (!path) return null

    const info = await stat(path).catch(() => null)
    if (!info) return null

    let raw = ''
    try {
        raw = await readFile(path, 'utf-8')
    } catch {
        return null
    }

    const counted = new Set<string>()
    const result: Progress = {
        tool: null,
        inputTokens: 0,
        outputTokens: 0,
        ended: false,
        lastText: '',
        terminal: null,
        error: null,
        modifiedAt: info.mtimeMs
    }

    const texts: string[] = []

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        let entry: Record<string, unknown>
        try {
            entry = JSON.parse(line) as Record<string, unknown>
        } catch {
            continue
        }

        if (entry.type === 'system') {
            if (entry.subtype === 'turn_duration') result.ended = true
            continue
        }

        if (entry.type !== 'assistant') continue
        result.ended = false

        const message = entry.message as Record<string, unknown> | undefined
        if (!message) continue

        const id = typeof message.id === 'string' ? message.id : ''
        const usage = message.usage as Record<string, number> | undefined
        if (usage && id && !counted.has(id)) {
            counted.add(id)
            result.inputTokens +=
                (usage.input_tokens ?? 0) +
                (usage.cache_creation_input_tokens ?? 0) +
                (usage.cache_read_input_tokens ?? 0)
            result.outputTokens += usage.output_tokens ?? 0
        }

        for (const block of (message.content as Record<string, unknown>[] | undefined) ?? []) {
            if (block.type === 'tool_use' && typeof block.name === 'string') result.tool = block.name
            if (block.type === 'text' && typeof block.text === 'string') {
                texts.push(block.text)
                result.lastText = block.text
            }
        }
    }

    result.terminal = parseTerminal(texts.join('\n'))
    return result
}

const TELLING = ['file_path', 'command', 'pattern', 'path', 'url', 'query', 'prompt']
const MAX_ROWS = 400
const MAX_BODY = 4_000

function summarise(input: unknown): string {
    const record = (input ?? {}) as Record<string, unknown>
    for (const key of TELLING) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value.replace(/\s+/g, ' ').slice(0, 200)
    }
    const rendered = JSON.stringify(record) ?? ''
    return rendered.length > 200 ? `${rendered.slice(0, 200)}...` : rendered
}

function stamp(entry: Record<string, unknown>): number {
    const raw = entry.timestamp
    const at = typeof raw === 'string' ? Date.parse(raw) : 0
    return Number.isNaN(at) ? 0 : at
}

async function history(place: string, run: Run): Promise<HistoryRow[]> {
    if (!run.sessionId) return []
    const path = await transcript(place, run.sessionId)
    if (!path) return []

    let raw = ''
    try {
        raw = await readFile(path, 'utf-8')
    } catch {
        return []
    }

    const rows: HistoryRow[] = []

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        let entry: Record<string, unknown>
        try {
            entry = JSON.parse(line) as Record<string, unknown>
        } catch {
            continue
        }

        const at = stamp(entry)

        if (entry.type === 'system' && entry.subtype === 'turn_duration') {
            const ms = typeof entry.durationMs === 'number' ? entry.durationMs : 0
            const count = typeof entry.messageCount === 'number' ? entry.messageCount : 0
            rows.push({
                at,
                kind: 'end',
                label: 'turn',
                body: `${(ms / 1000).toFixed(1)}s over ${count} messages`,
                error: false
            })
            continue
        }

        if (entry.type === 'user' && entry.toolUseResult !== undefined) {
            const value = entry.toolUseResult
            const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
            rows.push({
                at,
                kind: 'result',
                label: '',
                body: text.slice(0, MAX_BODY),
                error: /^error\b|"is_error":\s*true/i.test(text)
            })
            continue
        }

        if (entry.type !== 'assistant') continue
        const message = entry.message as Record<string, unknown> | undefined
        for (const block of (message?.content as Record<string, unknown>[] | undefined) ?? []) {
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                rows.push({ at, kind: 'text', label: '', body: block.text.slice(0, MAX_BODY), error: false })
            }
            if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim()) {
                rows.push({
                    at,
                    kind: 'thinking',
                    label: '',
                    body: block.thinking.slice(0, MAX_BODY),
                    error: false
                })
            }
            if (block.type === 'tool_use' && typeof block.name === 'string') {
                rows.push({ at, kind: 'tool', label: block.name, body: summarise(block.input), error: false })
            }
        }
    }

    return rows.slice(-MAX_ROWS)
}

function sessions(snapshot: unknown): SessionRecord[] | null {
    return Array.isArray(snapshot) ? (snapshot as SessionRecord[]) : null
}

async function attach(run: Run): Promise<Invocation> {
    if (!run.shortId) throw new Refusal('that card has no session to attach to')
    const path = await findBinary(BINARY)
    if (!path) throw new Refusal('claude is not on PATH')
    return invocation(path, ['attach', run.shortId])
}

export const driver: Driver = {
    id: 'claude',
    label: 'Claude Code',
    isolates: true,
    commits: true,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    binary: () => findBinary(BINARY),
    models: async () => ['fable', 'opus', 'sonnet', 'haiku'],
    restraint: () => [
        'You are in PLAN MODE and you have NO SHELL: Bash and PowerShell are denied to you, on',
        'purpose. You are not being trusted less than the implementer was. It is that a review',
        'which reaches for a shell stops dead waiting for a permission nobody is there to give,',
        'and a stopped review is worth less than no review. Do not try to leave plan mode, and do',
        'not end by proposing a plan. The judgement below IS your output.'
    ],
    launch,
    worktreePath,
    poll: snapshot,
    liveness: (held, run) => (run.sessionId ? liveness(sessions(held), run.sessionId) : 'dead'),
    state: (held, run) => (run.sessionId ? (find(sessions(held), run.sessionId)?.state ?? null) : null),
    waiting: (held, run) => (run.sessionId ? waiting(find(sessions(held), run.sessionId)) : false),
    orphaned: () => false,
    stop: async (run) => {
        if (run.shortId) await stopSession(run.shortId)
    },
    progress,
    history,
    attach
}

async function stopSession(shortId: string): Promise<void> {
    await run(['stop', shortId]).catch(() => undefined)
}
