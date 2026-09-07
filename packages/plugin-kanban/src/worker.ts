import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as agents from './agents.js'
import type { BlockKind, BoardMeta, Card } from './types.js'

const MARKER = '===KANBAN==='
const LAUNCH_TIMEOUT_MS = 60_000
const INLINE_LIMIT = 8_000
const SETTLE_TRIES = 10
const SETTLE_MS = 400

export interface TerminalBlock {
    outcome: 'completed' | 'blocked'
    blockKind: BlockKind | null
    summary: string
    artifacts: string[]
    followups: { title: string; body: string }[]
}

export interface Progress {
    tool: string | null
    inputTokens: number
    outputTokens: number
    ended: boolean
    lastText: string
    terminal: TerminalBlock | null
    error: string | null
    modifiedAt: number
}

export interface Started {
    shortId: string
    sessionId: string
    transcript: string | null
    headBefore: string | null
    worktree: string | null
    branch: string | null
}

export async function git(workdir: string, args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        execFile('git', args, { cwd: workdir, timeout: 10_000, windowsHide: true }, (error, stdout) =>
            resolve(error ? null : stdout.trim())
        )
    })
}

export async function tracked(workdir: string): Promise<boolean> {
    return (await git(workdir, ['rev-parse', '--is-inside-work-tree'])) === 'true'
}

export async function head(workdir: string): Promise<string | null> {
    return new Promise((resolve) => {
        execFile(
            'git',
            ['rev-parse', 'HEAD'],
            { cwd: workdir, timeout: 10_000, windowsHide: true },
            (error, stdout) => resolve(error ? null : stdout.trim())
        )
    })
}

export function brief(
    board: BoardMeta,
    card: Card,
    parents: Card[],
    workspace: string,
    isolated: boolean
): string {
    const lines: string[] = []

    lines.push(`# ${card.title}`, '')
    if (card.body.trim()) lines.push(card.body.trim(), '')

    if (parents.length) {
        lines.push('## Results carried forward', '')
        for (const parent of parents) {
            const last = [...parent.runs].reverse().find((run) => run.summary)
            lines.push(`### ${parent.title}`, '')
            lines.push(last?.summary ?? 'This card closed without a recorded summary.', '')
        }
        lines.push(
            'That is the only context you have. You cannot see sibling cards, and nothing you',
            'learn here reaches them.',
            ''
        )
    }

    if (card.comments.length) {
        lines.push('## Thread', '')
        for (const entry of card.comments) {
            lines.push(`**${entry.author}**: ${entry.text}`, '')
        }
    }

    lines.push('## Workspace', '')
    lines.push(`Your working directory is \`${workspace}\`.`, '')
    if (isolated) {
        lines.push(
            'It is a git worktree of the project, on its own branch, so your changes are isolated',
            'from the checkout the operator is working in. Do not try to merge it: say what you',
            'changed in the summary and leave the branch for a person to land.',
            ''
        )
    }
    if (card.workspaceKind === 'scratch') {
        lines.push(
            'It is a SCRATCH workspace and it is DELETED when this card completes. Anything worth',
            'keeping must be listed in `artifacts` below, as a path relative to this directory.',
            ''
        )
    } else {
        lines.push('It is a shared directory and it is preserved.', '')
    }

    lines.push('## How to finish', '')
    lines.push(
        'Write everything in English, whatever the machine you are running on prefers.',
        '',
        'End your last message with a block in exactly this shape, on its own lines, and nothing',
        'after it:',
        '',
        '```',
        MARKER,
        '{ "outcome": "completed" | "blocked",',
        '  "blockKind": "needs_input" | "capability" | "transient" | "dependency" | null,',
        '  "summary": "what changed, what is verified, what is left",',
        '  "artifacts": ["relative/path"],',
        '  "followups": [ { "title": "...", "body": "..." } ] }',
        '```',
        '',
        'Use `blocked` when a person has to decide something, when the job needs a capability you',
        'do not have, or when it depends on work that is not done. `followups` is how you file',
        'the problems you found but did not fix: each one becomes a new card that depends on this',
        'one. You cannot change the board any other way, and you should not try.',
        ''
    )

    return lines.join('\n')
}

export async function start(
    board: BoardMeta,
    card: Card,
    parents: Card[],
    runId: string,
    workspace: string
): Promise<Started> {
    const path = await agents.binary()
    if (!path) throw new Error('claude is not on PATH')

    const info = await stat(workspace).catch(() => null)
    if (!info?.isDirectory()) throw new Error(`'${workspace}' is not an existing directory`)

    const folder = join(workspace, '.dyakanban', runId)
    await mkdir(folder, { recursive: true })
    await writeFile(join(workspace, '.dyakanban', '.gitignore'), '*\n', 'utf-8')
    const briefPath = join(folder, 'brief.md')

    const isolate = (await tracked(workspace)) ? `kanban-${runId.slice(0, 8)}` : null
    const predicted = isolate ? join(workspace, '.claude', 'worktrees', isolate) : workspace

    const text = brief(board, card, parents, predicted, isolate !== null)
    await writeFile(briefPath, text, 'utf-8')
    const prompt =
        text.length <= INLINE_LIMIT
            ? text
            : `Read ${briefPath} and do what it says. It is your whole brief.`

    const argv = agents.launchArgv({
        name: card.title.slice(0, 60),
        permissionMode: card.permissionMode,
        addDir: workspace,
        model: card.model,
        effort: card.effort,
        worktree: isolate,
        prompt
    })

    const call = agents.invocation(path, argv)
    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
            call.file,
            call.args,
            { cwd: workspace, env: agents.childEnv(), timeout: LAUNCH_TIMEOUT_MS, windowsHide: true },
            (error, out) => (error ? reject(error) : resolve(out))
        )
    })

    const launched = agents.parseLaunch(stdout, await agents.snapshot())
    if (!launched?.sessionId) throw new Error('the launcher printed no session id')

    const isolated = isolate ? await settle(join(workspace, '.claude', 'worktrees', isolate)) : null
    const place = isolated ?? workspace

    return {
        shortId: launched.shortId,
        sessionId: launched.sessionId,
        transcript: await agents.transcript(place, launched.sessionId),
        headBefore: await head(place),
        worktree: isolated,
        branch: isolated ? await git(isolated, ['rev-parse', '--abbrev-ref', 'HEAD']) : null
    }
}

async function settle(path: string): Promise<string | null> {
    for (let attempt = 0; attempt < SETTLE_TRIES; attempt += 1) {
        if ((await stat(path).catch(() => null))?.isDirectory()) return path
        await new Promise((resume) => setTimeout(resume, SETTLE_MS))
    }
    return null
}

export function parseTerminal(text: string): TerminalBlock | null {
    const at = text.lastIndexOf(MARKER)
    if (at < 0) return null

    const rest = text.slice(at + MARKER.length)
    const open = rest.indexOf('{')
    if (open < 0) return null

    let depth = 0
    let end = -1
    for (let index = open; index < rest.length; index += 1) {
        if (rest[index] === '{') depth += 1
        else if (rest[index] === '}') {
            depth -= 1
            if (depth === 0) {
                end = index + 1
                break
            }
        }
    }
    if (end < 0) return null

    try {
        const raw = JSON.parse(rest.slice(open, end)) as Record<string, unknown>
        const outcome = raw.outcome === 'blocked' ? 'blocked' : 'completed'
        const followups = Array.isArray(raw.followups) ? raw.followups : []
        return {
            outcome,
            blockKind: (raw.blockKind as BlockKind) ?? null,
            summary: typeof raw.summary === 'string' ? raw.summary : '',
            artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.map(String) : [],
            followups: followups
                .map((entry) => entry as Record<string, unknown>)
                .filter((entry) => typeof entry?.title === 'string')
                .map((entry) => ({ title: String(entry.title), body: String(entry.body ?? '') }))
        }
    } catch {
        return null
    }
}

export async function progress(path: string): Promise<Progress | null> {
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
