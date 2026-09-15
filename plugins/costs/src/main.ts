import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

/*
 * Claude Code writes every session to ~/.claude/projects/<folder>/<session>.jsonl, one JSON
 * line per event. Three kinds of line are all this plugin needs: a user prompt opens a turn,
 * every assistant line carries the usage of the request it belongs to, and a background or
 * print-mode session closes with a cost-state line holding the exact figure the CLI computed.
 * Interactive sessions carry no such line, so their cost is estimated from tokens and a price
 * table, and the panel says so.
 *
 * Files are read incrementally: the offset reached is kept per file and only what was appended
 * since is parsed, which is what lets a session a hundred megabytes long be followed line by
 * line while it runs.
 */

const PROJECTS = join(homedir(), '.claude', 'projects')
const RECENT_DAYS = 14
const LIVE_MS = 30_000
const DEBOUNCE_MS = 500
const PROMPT_CHARS = 160

/*
 * USD per million tokens for input, output, cache write and cache read, per model name, the
 * most specific name first. Fitted on 2026-09-15 to the cost-state lines of every session on
 * this machine, fifty-one of them: a non-negative least squares over the four token kinds where
 * a model had four samples or more, and one scalar under the usual multipliers (output five
 * times input, cache write 1.25, cache read a tenth) where it had fewer. Worst error on the
 * samples: 13% for haiku, 10% for opus, 8% for sonnet; the two fable rows rest on one session
 * each. The opus row is the 1M-context tier the CLI billed fifteen of eighteen opus sessions
 * under; an assistant line names the model without the tier, so the tier cannot be told apart
 * and the common one is used. A session that carries its own cost-state line after its last
 * request never uses this table, and a model not named here gets the opus row.
 */
const PRICES: Array<[string, [number, number, number, number]]> = [
    ['opus-5', [0.0, 22.8, 8.91, 0.511]],
    ['fable-5-1', [6.1, 30.49, 7.62, 0.61]],
    ['fable-5', [10.61, 53.05, 13.26, 1.061]],
    ['sonnet-5', [0.0, 12.13, 4.13, 0.106]],
    ['haiku-4-5', [1.0, 6.88, 1.72, 0.082]]
]
const FALLBACK: [number, number, number, number] = [5.0, 25.0, 6.25, 0.5]

interface Usage {
    input: number
    output: number
    cacheWrite: number
    cacheRead: number
}

export interface Prompt extends Usage {
    text: string
    at: number
    endedAt: number | null
    requests: number
    cost: number
}

export interface Session {
    id: string
    file: string
    title: string
    cwd: string
    model: string
    startedAt: number
    updatedAt: number
    prompts: Prompt[]
    exactCost: number | null
    exactStale: boolean
    kind: 'interactive' | 'background' | 'print'
}

interface Tracked {
    offset: number
    rest: string
    session: Session
    requests: Set<string>
}

const tracked = new Map<string, Tracked>()

function priceOf(model: string): [number, number, number, number] {
    for (const [needle, price] of PRICES) {
        if (model.includes(needle)) return price
    }
    return FALLBACK
}

function costOf(model: string, usage: Usage): number {
    const [input, output, cacheWrite, cacheRead] = priceOf(model)
    return (usage.input * input + usage.output * output + usage.cacheWrite * cacheWrite + usage.cacheRead * cacheRead) / 1_000_000
}

function textOf(content: unknown): string | null {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return null
    const blocks = content as Array<{ type?: string; text?: string }>
    if (blocks.some((block) => block.type === 'tool_result')) return null
    const text = blocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join(' ')
    return text.trim() ? text : null
}

function stamp(value: unknown): number {
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN
    return Number.isNaN(parsed) ? Date.now() : parsed
}

function consume(held: Tracked, line: string): void {
    let event: Record<string, unknown>
    try {
        event = JSON.parse(line) as Record<string, unknown>
    } catch {
        return
    }
    const session = held.session
    const type = event['type']
    const message = (event['message'] ?? {}) as Record<string, unknown>

    if (type === 'user') {
        if (event['isSidechain'] === true) return
        const text = textOf(message['content'])
        if (text === null) return
        const at = stamp(event['timestamp'])
        session.prompts.push({
            text: text.replace(/\s+/g, ' ').slice(0, PROMPT_CHARS),
            at,
            endedAt: null,
            requests: 0,
            input: 0,
            output: 0,
            cacheWrite: 0,
            cacheRead: 0,
            cost: 0
        })
        if (!session.startedAt) session.startedAt = at
        session.updatedAt = at
        if (session.cwd === '' && typeof event['cwd'] === 'string') session.cwd = event['cwd']
        return
    }

    if (type === 'assistant') {
        if (event['isSidechain'] === true) return
        const usage = (message['usage'] ?? null) as Record<string, number> | null
        const model = typeof message['model'] === 'string' ? message['model'] : session.model
        if (model) session.model = model
        const request = typeof event['requestId'] === 'string' ? event['requestId'] : null
        const at = stamp(event['timestamp'])
        session.updatedAt = at
        const current = session.prompts[session.prompts.length - 1]
        if (!current) return
        if (message['stop_reason'] === 'end_turn') current.endedAt = at
        if (!usage || (request && held.requests.has(request))) return
        if (request) held.requests.add(request)
        const spent: Usage = {
            input: usage['input_tokens'] ?? 0,
            output: usage['output_tokens'] ?? 0,
            cacheWrite: usage['cache_creation_input_tokens'] ?? 0,
            cacheRead: usage['cache_read_input_tokens'] ?? 0
        }
        current.requests += 1
        current.input += spent.input
        current.output += spent.output
        current.cacheWrite += spent.cacheWrite
        current.cacheRead += spent.cacheRead
        current.cost += costOf(model, spent)
        session.exactStale = true
        return
    }

    if (type === 'cost-state') {
        const total = event['totalCostUSD']
        if (typeof total === 'number') {
            session.exactCost = total
            session.exactStale = false
        }
        return
    }

    if (type === 'custom-title' && typeof event['customTitle'] === 'string') {
        session.title = event['customTitle']
        return
    }

    if (type === 'summary' && typeof event['summary'] === 'string' && !session.title) {
        session.title = event['summary']
    }
}

async function follow(file: string, id: string, folder: string): Promise<Tracked | null> {
    const info = await stat(file).catch(() => null)
    if (!info) return null
    let held = tracked.get(file)
    if (!held) {
        held = {
            offset: 0,
            rest: '',
            requests: new Set(),
            session: {
                id,
                file,
                title: '',
                cwd: folder,
                model: '',
                startedAt: 0,
                updatedAt: info.mtimeMs,
                prompts: [],
                exactCost: null,
                exactStale: false,
                kind: 'interactive'
            }
        }
        tracked.set(file, held)
    }
    if (info.size < held.offset) {
        held.offset = 0
        held.rest = ''
        held.requests.clear()
        held.session.prompts = []
        held.session.exactCost = null
        held.session.exactStale = false
    }
    if (info.size === held.offset) return held

    const handle = await open(file, 'r')
    try {
        const length = info.size - held.offset
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, held.offset)
        held.offset = info.size
        const chunk = held.rest + buffer.toString('utf-8')
        const lines = chunk.split('\n')
        held.rest = lines.pop() ?? ''
        for (const line of lines) if (line.trim()) consume(held, line)
    } finally {
        await handle.close()
    }
    held.session.updatedAt = Math.max(held.session.updatedAt, info.mtimeMs)
    if (held.session.exactCost !== null) {
        held.session.kind = held.session.prompts.length <= 1 ? 'print' : 'background'
    }
    return held
}

async function scan(): Promise<Session[]> {
    const since = Date.now() - RECENT_DAYS * 24 * 3_600_000
    const folders = await readdir(PROJECTS, { withFileTypes: true }).catch(() => [])
    const found: Session[] = []
    for (const folder of folders) {
        if (!folder.isDirectory()) continue
        const place = join(PROJECTS, folder.name)
        const files = await readdir(place).catch(() => [])
        for (const name of files) {
            if (!name.endsWith('.jsonl')) continue
            const file = join(place, name)
            const info = await stat(file).catch(() => null)
            if (!info || info.mtimeMs < since) continue
            const held = await follow(file, name.slice(0, -6), folder.name)
            if (held && held.session.prompts.length) found.push(held.session)
        }
    }
    found.sort((a, b) => b.updatedAt - a.updatedAt)
    return found
}

function summarise(session: Session, now: number): Record<string, unknown> {
    const last = session.prompts[session.prompts.length - 1]
    const totals = session.prompts.reduce(
        (sum, prompt) => ({
            requests: sum.requests + prompt.requests,
            input: sum.input + prompt.input,
            output: sum.output + prompt.output,
            cacheWrite: sum.cacheWrite + prompt.cacheWrite,
            cacheRead: sum.cacheRead + prompt.cacheRead,
            cost: sum.cost + prompt.cost
        }),
        { requests: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 }
    )
    return {
        id: session.id,
        title: session.title || session.prompts[0]?.text || session.id,
        cwd: session.cwd,
        model: session.model,
        kind: session.kind,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        live: now - session.updatedAt < LIVE_MS && last !== undefined && last.endedAt === null,
        prompts: session.prompts,
        totals,
        exactCost: session.exactStale ? null : session.exactCost
    }
}

export function activate(ctx: PluginMainContext): void {
    let watcher: FSWatcher | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    ctx.handle('sessions', async () => {
        const now = Date.now()
        return (await scan()).map((session) => summarise(session, now))
    })

    ctx.handle('session', async (id) => {
        const now = Date.now()
        const held = [...tracked.values()].find((entry) => entry.session.id === String(id))
        if (!held) return null
        await follow(held.session.file, held.session.id, held.session.cwd)
        return summarise(held.session, now)
    })

    try {
        watcher = watch(PROJECTS, { recursive: true }, () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => ctx.broadcast('changed'), DEBOUNCE_MS)
        })
        watcher.on('error', () => undefined)
    } catch {
        watcher = null
    }
}
