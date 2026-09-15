import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { parseTerminal } from '../closing.js'
import { Refusal } from '../refusal.js'
import type { Run } from '../types.js'
import * as hosted from './hosted.js'
import { capture, findBinary, invocation } from './process.js'
import type { Driver, HistoryRow, Launched, LaunchSpec, Progress } from './types.js'

const BINARY = 'grok'
const EFFORTS = ['low', 'medium', 'high']
const MODELS_TIMEOUT_MS = 20_000
const MAX_ROWS = 400
const MAX_BODY = 4_000
const SHELL_TOOLS = ['run_terminal_command', 'search_replace', 'write']

let listed: string[] | null = null

function worktreePath(workspace: string, isolate: string): string {
    return join(workspace, '.claude', 'worktrees', isolate)
}

/*
 * `grok models` prints the default and the available models as an indented list, one
 * per line with a marker in front of the name. Measured on 2026-09-15 against grok 1.0.30.
 */
export function parseModels(text: string): string[] {
    const found: string[] = []
    for (const line of text.split('\n')) {
        const match = /^\s*[*-]\s+(\S+)/.exec(line)
        if (match) found.push(match[1])
    }
    return found
}

async function models(): Promise<string[]> {
    if (listed) return listed
    const path = await findBinary(BINARY)
    if (!path) return []
    try {
        listed = parseModels(await capture(invocation(path, ['models']), { timeout: MODELS_TIMEOUT_MS }))
    } catch {
        listed = []
    }
    return listed
}

export function launchArgv(spec: LaunchSpec, cwd: string, sessionId: string): string[] {
    const reviewing = spec.kind === 'review'
    const args = [
        '-p',
        spec.prompt,
        '--output-format',
        'streaming-json',
        '--cwd',
        cwd,
        '--session-id',
        sessionId,
        '--no-auto-update',
        '--permission-mode',
        reviewing ? 'plan' : spec.permissionMode
    ]
    if (reviewing) args.push('--disallowed-tools', SHELL_TOOLS.join(','))
    if (spec.model) args.push('-m', spec.model)
    if (spec.effort) args.push('--reasoning-effort', spec.effort)
    return args
}

async function launch(spec: LaunchSpec): Promise<Launched> {
    const path = await findBinary(BINARY)
    if (!path) throw new Error('grok is not on PATH')

    const worktree = spec.isolate ? worktreePath(spec.workspace, spec.isolate) : null
    const cwd = worktree ?? spec.workspace
    const sessionId = randomUUID()
    await hosted.launch(spec.runId, invocation(path, launchArgv(spec, cwd, sessionId)), cwd)

    return { shortId: sessionId.slice(0, 8), sessionId, worktree }
}

interface Reading {
    tool: string | null
    inputTokens: number
    outputTokens: number
    text: string
    ended: boolean
    error: string | null
    rows: HistoryRow[]
}

function summarise(event: Record<string, unknown>): string {
    for (const key of ['name', 'tool', 'command', 'path', 'data', 'message']) {
        const value = event[key]
        if (typeof value === 'string' && value.trim()) return value.replace(/\s+/g, ' ').slice(0, 200)
    }
    const rendered = JSON.stringify(event) ?? ''
    return rendered.length > 200 ? `${rendered.slice(0, 200)}...` : rendered
}

/*
 * grok -p --output-format streaming-json is one event per line: thought and text carry
 * deltas in `data`, usage carries the running usage, end carries the stop reason, the
 * session id and the final usage, and available_commands is chatter. Tool events are
 * whatever else arrives with a name on it. Measured on 2026-09-15 against grok 1.0.30.
 */
export function read(lines: string[]): Reading {
    const reading: Reading = { tool: null, inputTokens: 0, outputTokens: 0, text: '', ended: false, error: null, rows: [] }
    let thought = ''
    let text = ''

    const flush = (): void => {
        if (thought.trim()) reading.rows.push({ at: 0, kind: 'thinking', label: '', body: thought.slice(0, MAX_BODY), error: false })
        if (text.trim()) reading.rows.push({ at: 0, kind: 'text', label: '', body: text.slice(0, MAX_BODY), error: false })
        if (text.trim()) reading.text += (reading.text ? '\n' : '') + text
        thought = ''
        text = ''
    }

    for (const line of lines) {
        const event = hosted.parseLine(line)
        if (!event) continue
        const type = event.type

        if (type === 'available_commands' || type === 'usage') continue
        if (type === 'thought') {
            thought += typeof event.data === 'string' ? event.data : ''
            continue
        }
        if (type === 'text') {
            text += typeof event.data === 'string' ? event.data : ''
            continue
        }
        if (type === 'end') {
            flush()
            const usage = (event.usage ?? {}) as Record<string, number>
            reading.inputTokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
            reading.outputTokens = usage.output_tokens ?? 0
            reading.ended = true
            const reason = typeof event.stopReason === 'string' ? event.stopReason : 'end'
            if (reason !== 'end_turn') reading.error = `grok stopped: ${reason}`
            reading.rows.push({ at: 0, kind: 'end', label: 'turn', body: reason, error: reason !== 'end_turn' })
            continue
        }
        if (type === 'error') {
            flush()
            reading.error = summarise(event)
            reading.ended = true
            reading.rows.push({ at: 0, kind: 'end', label: 'error', body: reading.error, error: true })
            continue
        }

        flush()
        const label = typeof type === 'string' ? type : 'event'
        reading.tool = typeof event.name === 'string' ? event.name : label
        reading.rows.push({ at: 0, kind: 'tool', label: reading.tool, body: summarise(event), error: false })
    }

    flush()
    return reading
}

async function progress(_place: string, run: Run): Promise<Progress | null> {
    const held = await hosted.events(run)
    if (!held) return null
    const reading = read(held.lines)
    const code = hosted.exitCode(run)
    const ended = reading.ended || code !== null

    let error = reading.error
    if (!error && code !== null && code !== 0) {
        const said = (await hosted.stderr(run)).trim().split('\n').filter(Boolean).pop()
        error = said ? `grok exited with code ${code}: ${said}` : `grok exited with code ${code}`
    }

    return {
        tool: reading.tool,
        inputTokens: reading.inputTokens,
        outputTokens: reading.outputTokens,
        ended,
        lastText: reading.text.trim(),
        terminal: parseTerminal(reading.text),
        error,
        modifiedAt: held.modifiedAt
    }
}

async function history(_place: string, run: Run): Promise<HistoryRow[]> {
    const held = await hosted.events(run)
    if (!held) return []
    return read(held.lines).rows.slice(-MAX_ROWS)
}

export const driver: Driver = {
    id: 'grok',
    label: 'Grok CLI',
    isolates: false,
    commits: true,
    efforts: EFFORTS,
    binary: () => findBinary(BINARY),
    models,
    restraint: () => [
        'You are in PLAN MODE and the tools that write or run commands are removed, on',
        'purpose. You are not being trusted less than the implementer was. It is that a review',
        'which reaches for a shell stops dead waiting for a permission nobody is there to give,',
        'and a stopped review is worth less than no review. Do not try to leave plan mode, and',
        'do not end by proposing a plan. The judgement below IS your output.'
    ],
    launch,
    worktreePath,
    poll: async () => null,
    liveness: (_held, run) => hosted.liveness(run),
    state: (_held, run) => (hosted.liveness(run) === 'alive' ? 'working' : null),
    waiting: () => false,
    orphaned: (run) => hosted.orphaned(run),
    stop: (run) => hosted.stop(run),
    progress,
    history,
    attach: async (run) => {
        if (!run.runId) throw new Refusal('that card has no run to attach to')
        return hosted.tail(run)
    }
}
