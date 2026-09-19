import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseTerminal } from '../closing.js'
import { Refusal } from '../refusal.js'
import type { Run } from '../types.js'
import * as hosted from './hosted.js'
import { findBinary, invocation } from './process.js'
import type { Driver, HistoryRow, Launched, LaunchSpec, Progress } from './types.js'

const BINARY = 'codex'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const MAX_ROWS = 400
const MAX_BODY = 4_000

function worktreePath(workspace: string, isolate: string): string {
    return join(workspace, '.claude', 'worktrees', isolate)
}

/*
 * Codex keeps the models its account may use in a cache it refreshes itself, with a
 * visibility on each; the ones it would list are the ones offered here. A cache that is
 * missing or unreadable offers nothing, and the drawer still takes a typed name.
 */
async function models(): Promise<string[]> {
    try {
        const raw = JSON.parse(await readFile(join(homedir(), '.codex', 'models_cache.json'), 'utf-8')) as {
            models?: { slug?: unknown; visibility?: unknown; priority?: unknown }[]
        }
        return (raw.models ?? [])
            .filter((entry) => entry.visibility === 'list' && typeof entry.slug === 'string')
            .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))
            .map((entry) => entry.slug as string)
    } catch {
        return []
    }
}

export function launchArgv(spec: LaunchSpec, cwd: string, finalPath: string): string[] {
    const reviewing = spec.kind === 'review'
    const args = ['exec', '--json', '--skip-git-repo-check', '-C', cwd, '-o', finalPath]
    if (reviewing) args.push('-s', 'read-only')
    else if (spec.permissionMode === 'bypassPermissions') args.push('--dangerously-bypass-approvals-and-sandbox')
    else args.push('-s', 'workspace-write')
    for (const dir of spec.addDirs) if (dir !== cwd) args.push('--add-dir', dir)
    if (spec.model) args.push('-m', spec.model)
    if (spec.effort) args.push('-c', `model_reasoning_effort="${spec.effort}"`)
    args.push(spec.prompt)
    return args
}

async function launch(spec: LaunchSpec): Promise<Launched> {
    const path = await findBinary(BINARY)
    if (!path) throw new Error('codex is not on PATH')

    const worktree = spec.isolate ? worktreePath(spec.workspace, spec.isolate) : null
    const cwd = worktree ?? spec.workspace
    const sessionId = randomUUID()
    const stub = { runId: spec.runId } as Run
    await hosted.launch(spec.runId, invocation(path, launchArgv(spec, cwd, hosted.finalPath(stub))), cwd)

    return { shortId: sessionId.slice(0, 8), sessionId, worktree }
}

interface Reading {
    tool: string | null
    inputTokens: number
    outputTokens: number
    texts: string[]
    ended: boolean
    error: string | null
    rows: HistoryRow[]
}

function summarise(item: Record<string, unknown>): string {
    for (const key of ['text', 'command', 'path', 'query', 'message']) {
        const value = item[key]
        if (typeof value === 'string' && value.trim()) return value.replace(/\s+/g, ' ').slice(0, 200)
    }
    const rendered = JSON.stringify(item) ?? ''
    return rendered.length > 200 ? `${rendered.slice(0, 200)}...` : rendered
}

function errorText(value: unknown): string {
    if (typeof value === 'string') return value
    const record = (value ?? {}) as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    return JSON.stringify(value) ?? 'unknown error'
}

/*
 * codex exec --json is one event per line: thread.started, turn.started, item.completed
 * with the item inside, turn.completed with the usage, and turn.failed or error when it
 * did not get there. Measured on 2026-09-15 against codex-cli 0.154.0.
 */
export function read(lines: string[]): Reading {
    const reading: Reading = {
        tool: null,
        inputTokens: 0,
        outputTokens: 0,
        texts: [],
        ended: false,
        error: null,
        rows: []
    }

    for (const line of lines) {
        const event = hosted.parseLine(line)
        if (!event) continue
        const type = event.type

        if (type === 'turn.completed') {
            const usage = (event.usage ?? {}) as Record<string, number>
            reading.inputTokens += (usage.input_tokens ?? 0) + (usage.cached_input_tokens ?? 0)
            reading.outputTokens += usage.output_tokens ?? 0
            reading.ended = true
            reading.rows.push({ at: 0, kind: 'end', label: 'turn', body: 'completed', error: false })
            continue
        }
        if (type === 'turn.failed' || type === 'error') {
            reading.error = errorText(event.error ?? event.message)
            reading.ended = true
            reading.rows.push({ at: 0, kind: 'end', label: 'turn', body: reading.error, error: true })
            continue
        }
        if (type !== 'item.completed' && type !== 'item.started') continue

        const item = (event.item ?? {}) as Record<string, unknown>
        const kind = typeof item.type === 'string' ? item.type : 'item'
        if (kind === 'agent_message' && typeof item.text === 'string') {
            if (type === 'item.completed') {
                reading.texts.push(item.text)
                reading.rows.push({ at: 0, kind: 'text', label: '', body: item.text.slice(0, MAX_BODY), error: false })
            }
            continue
        }
        if (kind === 'reasoning') {
            if (type === 'item.completed' && typeof item.text === 'string' && item.text.trim()) {
                reading.rows.push({ at: 0, kind: 'thinking', label: '', body: item.text.slice(0, MAX_BODY), error: false })
            }
            continue
        }
        if (kind === 'error') {
            reading.rows.push({ at: 0, kind: 'result', label: 'error', body: summarise(item), error: true })
            continue
        }
        if (type === 'item.started') {
            reading.tool = kind
            reading.rows.push({ at: 0, kind: 'tool', label: kind, body: summarise(item), error: false })
            continue
        }
        reading.tool = kind
        const output = item.aggregated_output ?? item.output
        if (typeof output === 'string' && output.trim()) {
            reading.rows.push({
                at: 0,
                kind: 'result',
                label: kind,
                body: output.slice(0, MAX_BODY),
                error: typeof item.exit_code === 'number' && item.exit_code !== 0
            })
        } else {
            reading.rows.push({ at: 0, kind: 'tool', label: kind, body: summarise(item), error: false })
        }
    }

    return reading
}

async function progress(_place: string, run: Run): Promise<Progress | null> {
    const held = await hosted.events(run)
    if (!held) return null
    const reading = read(held.lines)
    const final = await hosted.final(run)
    const code = hosted.exitCode(run)
    const ended = reading.ended || code !== null

    let error = reading.error
    if (!error && code !== null && code !== 0) {
        const said = (await hosted.stderr(run)).trim().split('\n').filter(Boolean).pop()
        error = said ? `codex exited with code ${code}: ${said}` : `codex exited with code ${code}`
    }

    const text = final ?? reading.texts.join('\n')
    return {
        tool: reading.tool,
        inputTokens: reading.inputTokens,
        outputTokens: reading.outputTokens,
        ended,
        lastText: (final ?? reading.texts[reading.texts.length - 1] ?? '').trim(),
        terminal: parseTerminal(text),
        error,
        modifiedAt: held.modifiedAt,
        permissionMode: null
    }
}

async function history(_place: string, run: Run): Promise<HistoryRow[]> {
    const held = await hosted.events(run)
    if (!held) return []
    return read(held.lines).rows.slice(-MAX_ROWS)
}

export const driver: Driver = {
    id: 'codex',
    label: 'Codex CLI',
    isolates: false,
    commits: false,
    efforts: EFFORTS,
    binary: () => findBinary(BINARY),
    models,
    restraint: () => [
        'You are in a READ-ONLY sandbox: the harness itself refuses every write and every',
        'command that would change the checkout, on purpose. You are not being trusted less',
        'than the implementer was. It is that a review which changes things is not a review.',
        'Read what you need, judge, and say what you decided. The judgement below IS your',
        'output.'
    ],
    launch,
    worktreePath,
    poll: async () => null,
    liveness: (_held, run) => hosted.liveness(run),
    state: (_held, run) => (hosted.liveness(run) === 'alive' ? 'working' : null),
    waiting: () => false,
    orphaned: (run) => hosted.orphaned(run),
    stop: (run) => hosted.stop(run),
    release: (run) => hosted.stop(run),
    progress,
    history,
    attach: async (run) => {
        if (!run.runId) throw new Refusal('that card has no run to attach to')
        return hosted.tail(run)
    }
}
