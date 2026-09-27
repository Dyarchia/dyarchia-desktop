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

const BINARY = 'kimi'
const MAX_ROWS = 400
const MAX_BODY = 4_000

function worktreePath(workspace: string, isolate: string): string {
    return join(workspace, '.claude', 'worktrees', isolate)
}

/*
 * Kimi keeps its models in its own config.toml, one `[models."<alias>"]` table each, with the
 * name its maker shows for it in `display_name`. The alias is what -m takes and the display
 * name is what a person recognises, so the list is the aliases and the display names are what
 * they resolve to.
 */
export function parseConfig(text: string): { models: string[]; names: Record<string, string> } {
    const models: string[] = []
    const names: Record<string, string> = {}
    let current: string | null = null
    for (const line of text.split('\n')) {
        const table = /^\s*\[models\."([^"]+)"\]\s*$/.exec(line)
        if (table) {
            current = table[1]
            models.push(current)
            continue
        }
        if (/^\s*\[/.test(line)) {
            current = null
            continue
        }
        const name = /^\s*display_name\s*=\s*"([^"]*)"/.exec(line)
        if (current && name) names[current] = name[1]
    }
    return { models, names }
}

async function config(): Promise<{ models: string[]; names: Record<string, string> }> {
    const text = await readFile(join(homedir(), '.kimi-code', 'config.toml'), 'utf-8').catch(() => '')
    return parseConfig(text)
}

/*
 * -p runs one prompt and exits under Kimi's auto policy, and Kimi refuses to start when -p is
 * given with --yolo, --auto or --plan, since the mode is already decided. So the card's
 * permission mode has nothing to pass through, and a reviewer is kept from writing by its brief
 * alone. The working directory is the process's own, since Kimi has no flag for it. From the
 * Kimi Code docs, 2026-09, kimi 2.1.1.
 */
export function launchArgv(spec: LaunchSpec): string[] {
    const args = ['-p', spec.prompt, '--output-format', 'stream-json']
    if (spec.model) args.push('-m', spec.model)
    return args
}

async function launch(spec: LaunchSpec): Promise<Launched> {
    const path = await findBinary(BINARY)
    if (!path) throw new Error('kimi is not on PATH')

    const worktree = spec.isolate ? worktreePath(spec.workspace, spec.isolate) : null
    const cwd = worktree ?? spec.workspace
    const sessionId = randomUUID()
    await hosted.launch(spec.runId, invocation(path, launchArgv(spec)), cwd)

    return { shortId: sessionId.slice(0, 8), sessionId, worktree }
}

interface Reading {
    tool: string | null
    text: string
    rows: HistoryRow[]
}

function brief(value: unknown): string {
    const rendered = typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
    const flat = rendered.replace(/\s+/g, ' ').trim()
    return flat.length > 200 ? `${flat.slice(0, 200)}...` : flat
}

/*
 * kimi -p --output-format stream-json is one message per line: an assistant message carries its
 * reply in `content` or the calls it makes in `tool_calls`, and a tool message carries a call's
 * `tool_name` and `result`. Thinking is not written, and there is no usage and no closing event:
 * the run ends when the process exits.
 */
export function read(lines: string[]): Reading {
    const reading: Reading = { tool: null, text: '', rows: [] }
    for (const line of lines) {
        const event = hosted.parseLine(line)
        if (!event) continue
        if (event.type === 'assistant') {
            const calls = Array.isArray(event.tool_calls) ? (event.tool_calls as Record<string, unknown>[]) : []
            for (const call of calls) {
                const name = typeof call.name === 'string' ? call.name : 'tool'
                reading.tool = name
                reading.rows.push({ at: 0, kind: 'tool', label: name, body: brief(call.args ?? ''), error: false })
            }
            if (typeof event.content === 'string' && event.content.trim()) {
                reading.text += (reading.text ? '\n' : '') + event.content
                reading.rows.push({ at: 0, kind: 'text', label: '', body: event.content.slice(0, MAX_BODY), error: false })
            }
            continue
        }
        if (event.type === 'tool') {
            const name = typeof event.tool_name === 'string' ? event.tool_name : 'tool'
            reading.rows.push({ at: 0, kind: 'result', label: name, body: brief(event.result ?? ''), error: false })
        }
    }
    return reading
}

async function progress(_place: string, run: Run): Promise<Progress | null> {
    const held = await hosted.events(run)
    if (!held) return null
    const reading = read(held.lines)
    const code = hosted.exitCode(run)

    let error: string | null = null
    if (code !== null && code !== 0) {
        const said = (await hosted.stderr(run)).trim().split('\n').filter(Boolean).pop()
        error = said ? `kimi exited with code ${code}: ${said}` : `kimi exited with code ${code}`
    }

    return {
        tool: reading.tool,
        inputTokens: 0,
        outputTokens: 0,
        ended: code !== null,
        lastText: reading.text.trim(),
        terminal: parseTerminal(reading.text),
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
    id: 'kimi',
    label: 'Kimi Code',
    isolates: false,
    commits: true,
    efforts: null,
    binary: () => findBinary(BINARY),
    models: async () => (await config()).models,
    resolved: async () => (await config()).names,
    restraint: () => [
        'You still have every tool the implementer had, because this harness cannot take any',
        'away from you when it runs unattended. You are not being trusted less for that. It is',
        'that a review which changes things is not a review. Read and run only what reads: do',
        'not edit, create or delete files, and do not commit. The judgement below IS your output.'
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
