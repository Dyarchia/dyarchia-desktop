import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { boardRoot } from './boards.js'

const LIMIT_BYTES = 2 * 1024 * 1024
const KEEP = 200

export type EventKind =
    | 'created'
    | 'edited'
    | 'moved'
    | 'promoted'
    | 'claimed'
    | 'completed'
    | 'blocked'
    | 'unblocked'
    | 'violation'
    | 'crashed'
    | 'stopped'
    | 'gave_up'
    | 'block_loop'
    | 'guarded'
    | 'commented'
    | 'attached'
    | 'detached'
    | 'deleted'

export interface BoardEvent {
    at: number
    cardId: string
    runId: string | null
    kind: EventKind
    detail: string
}

function path(slug: string): string {
    return join(boardRoot(slug), 'events.jsonl')
}

export function parse(text: string): BoardEvent[] {
    const found: BoardEvent[] = []
    for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
            const row = JSON.parse(line) as BoardEvent
            if (typeof row?.cardId === 'string' && typeof row?.kind === 'string') found.push(row)
        } catch {
            continue
        }
    }
    return found
}

async function rotate(slug: string): Promise<void> {
    const info = await stat(path(slug)).catch(() => null)
    if (!info || info.size < LIMIT_BYTES) return
    await rename(path(slug), join(boardRoot(slug), 'events.1.jsonl')).catch(() => undefined)
}

export async function record(
    slug: string,
    cardId: string,
    kind: EventKind,
    detail = '',
    runId: string | null = null
): Promise<void> {
    const row: BoardEvent = { at: Date.now(), cardId, runId, kind, detail }
    try {
        await mkdir(boardRoot(slug), { recursive: true })
        await rotate(slug)
        await appendFile(path(slug), `${JSON.stringify(row)}\n`, 'utf-8')
    } catch {
        /* an event that cannot be written must not take the transition down with it */
    }
}

export async function read(slug: string, cardId?: string, keep = KEEP): Promise<BoardEvent[]> {
    const text = await readFile(path(slug), 'utf-8').catch(() => '')
    const rows = parse(text).filter((row) => (cardId ? row.cardId === cardId : true))
    return rows.slice(-keep)
}
