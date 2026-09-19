import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseTerminal } from '../closing.js'
import { Refusal } from '../refusal.js'
import type { Run } from '../types.js'
import * as hosted from './hosted.js'
import { capture, findBinary, invocation } from './process.js'
import type { Driver, HistoryRow, Launched, LaunchSpec, Progress } from './types.js'

const BINARY = 'opencode'
const PROVIDER = 'openrouter'
const MODELS_TIMEOUT_MS = 30_000
const MAX_ROWS = 400
const MAX_BODY = 4_000
const REVIEW_AGENT = 'plan'

let listed: string[] | null = null

function worktreePath(workspace: string, isolate: string): string {
    return join(workspace, '.claude', 'worktrees', isolate)
}

/*
 * `opencode models openrouter` prints one model id per line, provider prefix included,
 * in the form the -m flag takes. Three hundred and more on 2026-09-15 against 1.18.30;
 * the ones with a tilde are OpenRouter's rolling aliases and sort first, which is what
 * a chooser wants at the top.
 */
export function parseModels(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith(`${PROVIDER}/`))
}

async function models(): Promise<string[]> {
    if (listed) return listed
    const path = await findBinary(BINARY)
    if (!path) return []
    try {
        listed = parseModels(await capture(invocation(path, ['models', PROVIDER]), { timeout: MODELS_TIMEOUT_MS }))
    } catch {
        listed = []
    }
    return listed
}

/*
 * Two things measured on 2026-09-15 shape the launch. The working directory goes on the
 * command line as well as on the process, because a run spawned with only a cwd searched
 * and wrote in the directory the Electron process had started in, three attempts in a row.
 * And the binary is the .exe the npm shim points at, never the shim: the shim runs through
 * cmd.exe, and cmd.exe ends a command at the first newline, so the model saw one line of
 * the brief and never the closing block. An attached file did not help either: the model
 * never opened it.
 */
async function binary(): Promise<string | null> {
    const found = await findBinary(BINARY)
    if (!found || !/\.(cmd|bat)$/i.test(found)) return found
    const exe = join(dirname(found), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
    return (await stat(exe).catch(() => null))?.isFile() ? exe : found
}

export function launchArgv(spec: LaunchSpec, cwd: string, sessionTitle: string): string[] {
    const reviewing = spec.kind === 'review'
    const args = ['run', '--format', 'json', '--dir', cwd, '--title', sessionTitle]
    if (reviewing) args.push('--agent', REVIEW_AGENT)
    else if (spec.permissionMode !== 'manual' && spec.permissionMode !== 'plan') args.push('--auto')
    if (spec.model) args.push('-m', spec.model)
    if (spec.effort) args.push('--variant', spec.effort)
    args.push(spec.prompt)
    return args
}

async function launch(spec: LaunchSpec): Promise<Launched> {
    const path = await binary()
    if (!path) throw new Error('opencode is not on PATH')

    const worktree = spec.isolate ? worktreePath(spec.workspace, spec.isolate) : null
    const cwd = worktree ?? spec.workspace
    const sessionId = randomUUID()
    await hosted.launch(spec.runId, invocation(path, launchArgv(spec, cwd, spec.name)), cwd)

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

function summarise(part: Record<string, unknown>): string {
    const state = (part.state ?? {}) as Record<string, unknown>
    const input = (state.input ?? {}) as Record<string, unknown>
    for (const value of [state.title, input.command, input.filePath, input.pattern, input.url, part.text]) {
        if (typeof value === 'string' && value.trim()) return value.replace(/\s+/g, ' ').slice(0, 200)
    }
    const rendered = JSON.stringify(part) ?? ''
    return rendered.length > 200 ? `${rendered.slice(0, 200)}...` : rendered
}

/*
 * opencode run --format json is one event per line, each wrapping a `part`: step_start,
 * text with the part's text, tool with the tool name and its state, step_finish with the
 * tokens and the stop reason, and error. Measured on 2026-09-15 against opencode 1.18.30
 * over OpenRouter.
 */
export function read(lines: string[]): Reading {
    const reading: Reading = { tool: null, inputTokens: 0, outputTokens: 0, texts: [], ended: false, error: null, rows: [] }

    for (const line of lines) {
        const event = hosted.parseLine(line)
        if (!event) continue
        const type = event.type
        const part = (event.part ?? {}) as Record<string, unknown>

        if (type === 'text') {
            if (typeof part.text === 'string' && part.text.trim()) {
                reading.texts.push(part.text)
                reading.rows.push({ at: 0, kind: 'text', label: '', body: part.text.slice(0, MAX_BODY), error: false })
            }
            continue
        }
        if (type === 'reasoning') {
            if (typeof part.text === 'string' && part.text.trim()) {
                reading.rows.push({ at: 0, kind: 'thinking', label: '', body: part.text.slice(0, MAX_BODY), error: false })
            }
            continue
        }
        if (type === 'tool') {
            const name = typeof part.tool === 'string' ? part.tool : 'tool'
            const state = (part.state ?? {}) as Record<string, unknown>
            reading.tool = name
            if (state.status === 'completed' || state.status === 'error') {
                const output = typeof state.output === 'string' ? state.output : (typeof state.error === 'string' ? state.error : '')
                reading.rows.push({ at: 0, kind: 'result', label: name, body: (output || summarise(part)).slice(0, MAX_BODY), error: state.status === 'error' })
            } else {
                reading.rows.push({ at: 0, kind: 'tool', label: name, body: summarise(part), error: false })
            }
            continue
        }
        if (type === 'step_finish') {
            const tokens = (part.tokens ?? {}) as Record<string, unknown>
            const cache = (tokens.cache ?? {}) as Record<string, number>
            reading.inputTokens += Number(tokens.input ?? 0) + Number(cache.read ?? 0)
            reading.outputTokens += Number(tokens.output ?? 0)
            const reason = typeof part.reason === 'string' ? part.reason : 'stop'
            if (reason === 'stop' || reason === 'end_turn') reading.ended = true
            continue
        }
        if (type === 'error') {
            const held = (event.error ?? part.error ?? event.message) as unknown
            reading.error = typeof held === 'string' ? held : summarise((held ?? {}) as Record<string, unknown>)
            reading.ended = true
            reading.rows.push({ at: 0, kind: 'end', label: 'error', body: reading.error, error: true })
        }
    }

    if (reading.ended && !reading.error) reading.rows.push({ at: 0, kind: 'end', label: 'turn', body: 'completed', error: false })
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
        error = said ? `opencode exited with code ${code}: ${said}` : `opencode exited with code ${code}`
    }

    const text = reading.texts.join('\n')
    return {
        tool: reading.tool,
        inputTokens: reading.inputTokens,
        outputTokens: reading.outputTokens,
        ended,
        lastText: (reading.texts[reading.texts.length - 1] ?? '').trim(),
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
    id: 'opencode',
    label: 'OpenCode',
    isolates: false,
    commits: true,
    efforts: null,
    binary,
    models,
    restraint: () => [
        'You are running as the PLAN agent, which may read and may not edit or run commands,',
        'on purpose. You are not being trusted less than the implementer was. It is that a',
        'review which changes things is not a review, and one that stops to ask for a',
        'permission nobody is there to give is worth less than no review. Do not end by',
        'proposing a plan. The judgement below IS your output.'
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
