import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { reclaim } from './artifacts.js'
import * as events from './events.js'
import { DEFAULT_HARNESS, isHarness } from './harness/index.js'
import { attachmentsRoot, boardPath, boardRoot, workspacesRoot, writeAtomic } from './boards.js'
import { allows, isClosed, rules } from './rules.js'
import type {
    Attachment,
    BoardFile,
    Card,
    CardDraft,
    CardPatch,
    Comment,
    Status
} from './types.js'
import { Refusal } from './refusal.js'

const ORDER = rules().order
const VERSION = 1
const BACKUPS = 3

const cache = new Map<string, BoardFile>()

function empty(): BoardFile {
    return { version: VERSION, cards: [] }
}

function restore(card: Card): Card {
    for (const run of card.runs ?? []) {
        if (run.kind !== 'review') run.kind = 'implement'
        if (!isHarness(run.harness)) run.harness = DEFAULT_HARNESS
    }
    return card
}

export async function load(slug: string): Promise<BoardFile> {
    const held = cache.get(slug)
    if (held) return held

    let file = empty()
    try {
        const parsed = JSON.parse(await readFile(boardPath(slug), 'utf-8')) as BoardFile
        if (Array.isArray(parsed?.cards)) {
            file = { version: VERSION, cards: parsed.cards.map(restore) }
        }
    } catch {
        file = empty()
    }

    cache.set(slug, file)
    return file
}

async function rotate(slug: string): Promise<void> {
    for (let index = BACKUPS - 1; index >= 0; index -= 1) {
        const from =
            index === 0 ? boardPath(slug) : join(boardRoot(slug), `board.bak.${index - 1}.json`)
        const to = join(boardRoot(slug), `board.bak.${index}.json`)
        await rename(from, to).catch(() => undefined)
    }
}

export async function save(slug: string, file: BoardFile): Promise<void> {
    await mkdir(boardRoot(slug), { recursive: true })
    await rotate(slug)
    await writeAtomic(boardPath(slug), JSON.stringify(file, null, 4))
    cache.set(slug, file)
}

export function forget(slug: string): void {
    cache.delete(slug)
}

export async function cards(slug: string): Promise<Card[]> {
    return (await load(slug)).cards
}

export function find(file: BoardFile, id: string): Card {
    const card = file.cards.find((entry) => entry.id === id)
    if (!card) throw new Refusal(`no card '${id}'`)
    return card
}

function touch(card: Card): Card {
    card.rev += 1
    card.updatedAt = Date.now()
    return card
}

function assertNoCycle(file: BoardFile, id: string, parents: string[]): void {
    const byId = new Map(file.cards.map((card) => [card.id, card]))
    const seen = new Set<string>()
    const stack = [...parents]

    while (stack.length) {
        const next = stack.pop() as string
        if (next === id) throw new Refusal('that dependency would close a cycle')
        if (seen.has(next)) continue
        seen.add(next)
        const parent = byId.get(next)
        if (!parent) throw new Refusal(`no card '${next}' on this board`)
        stack.push(...parent.parents)
    }
}

function normalizeParents(file: BoardFile, id: string, parents: string[] | undefined): string[] {
    if (!parents) return []
    const unique = [...new Set(parents.filter((parent) => parent !== id))]
    assertNoCycle(file, id, unique)
    return unique
}

function assertWorkdir(workdir: string | null | undefined): string | null {
    if (workdir === undefined || workdir === null || workdir === '') return null
    if (!isAbsolute(workdir)) throw new Refusal(`'${workdir}' is not an absolute path`)
    return workdir
}

export function tally(cards: Card[]): Record<Status, number> {
    const counts = Object.fromEntries(ORDER.map((status) => [status, 0])) as Record<Status, number>
    for (const card of cards) {
        if (counts[card.status] === undefined) continue
        counts[card.status] += 1
    }
    return counts
}

export function blockedBy(file: BoardFile, card: Card): Card[] {
    const byId = new Map(file.cards.map((entry) => [entry.id, entry]))
    return card.parents
        .map((parent) => byId.get(parent))
        .filter((parent): parent is Card => Boolean(parent) && !isClosed((parent as Card).status))
}

export async function createCard(slug: string, draft: CardDraft): Promise<Card> {
    const file = await load(slug)
    const title = String(draft.title ?? '').trim()
    if (!title) throw new Refusal('the card needs a title')

    const id = randomUUID()
    const now = Date.now()
    const parents = normalizeParents(file, id, draft.parents)
    const requested = draft.status ?? 'triage'
    const status: Status = requested === 'ready' && parents.length ? 'todo' : requested

    const card: Card = {
        id,
        rev: 1,
        title,
        body: String(draft.body ?? ''),
        status,
        priority: Number.isFinite(draft.priority) ? Number(draft.priority) : 0,
        assignee: 'claude',
        workdir: assertWorkdir(draft.workdir),
        workspaceKind: draft.workspaceKind ?? 'dir',
        model: draft.model ?? null,
        effort: draft.effort ?? null,
        maxRuntimeSeconds: draft.maxRuntimeSeconds ?? null,
        maxRetries: draft.maxRetries ?? null,
        permissionMode: draft.permissionMode ?? 'acceptEdits',
        scheduledFor: draft.scheduledFor ?? null,
        parents,
        attachments: [],
        runs: [],
        comments: [],
        consecutiveFailures: 0,
        protocolViolations: 0,
        blockRecurrences: 0,
        blockKind: null,
        lastBlockKind: null,
        sourcePhase: null,
        locked: false,
        createdAt: now,
        updatedAt: now
    }

    file.cards.push(card)
    await save(slug, file)
    await events.record(slug, card.id, 'created', `${card.title} in ${card.status}`)
    return card
}

const PATCHABLE = new Set([
    'title',
    'body',
    'priority',
    'workdir',
    'workspaceKind',
    'model',
    'effort',
    'maxRuntimeSeconds',
    'maxRetries',
    'permissionMode',
    'scheduledFor',
    'parents'
])

export async function updateCard(slug: string, id: string, patch: CardPatch): Promise<Card> {
    const file = await load(slug)
    const card = find(file, id)
    if (card.locked) throw new Refusal('that card has a live worker')

    const stray = Object.keys(patch).filter((key) => !PATCHABLE.has(key))
    if (stray.length) throw new Refusal(`a card has no editable ${stray.join(', ')}`)

    if (patch.title !== undefined) {
        const title = String(patch.title).trim()
        if (!title) throw new Refusal('the card needs a title')
        card.title = title
    }
    if (patch.body !== undefined) card.body = String(patch.body)
    if (patch.priority !== undefined) card.priority = Number(patch.priority) || 0
    if (patch.workdir !== undefined) card.workdir = assertWorkdir(patch.workdir)
    if (patch.workspaceKind !== undefined) card.workspaceKind = patch.workspaceKind
    if (patch.model !== undefined) card.model = patch.model
    if (patch.effort !== undefined) card.effort = patch.effort
    if (patch.maxRuntimeSeconds !== undefined) card.maxRuntimeSeconds = patch.maxRuntimeSeconds
    if (patch.maxRetries !== undefined) card.maxRetries = patch.maxRetries
    if (patch.permissionMode !== undefined) card.permissionMode = String(patch.permissionMode)
    if (patch.scheduledFor !== undefined) card.scheduledFor = patch.scheduledFor
    if (patch.parents !== undefined) card.parents = normalizeParents(file, id, patch.parents)

    touch(card)
    await save(slug, file)
    await events.record(slug, card.id, 'edited', Object.keys(patch).join(', '))
    return card
}

function applyMove(file: BoardFile, id: string, rev: number, to: Status): Status | null {
    const card = find(file, id)

    if (card.rev !== rev) throw new Refusal('that card changed while you were moving it')
    if (card.locked) throw new Refusal('that card has a live worker')
    if (card.status === to) return null
    if (!allows(card.status, to)) throw new Refusal(`a card cannot go from ${card.status} to ${to}`)

    if (to === 'ready' && blockedBy(file, card).length) {
        throw new Refusal('that card still has open dependencies')
    }

    if (card.status === 'blocked') {
        card.blockKind = null
        card.sourcePhase = null
    }
    if (to === 'triage') {
        card.sourcePhase = null
        card.lastBlockKind = null
        card.blockRecurrences = 0
    }

    const from = card.status
    card.status = to
    touch(card)
    return from
}

export async function moveCard(slug: string, id: string, rev: number, to: Status): Promise<Card> {
    const file = await load(slug)
    const from = applyMove(file, id, rev, to)
    const card = find(file, id)
    if (from === null) return card

    await save(slug, file)
    await events.record(slug, card.id, 'moved', `${from} to ${to}, by hand`)
    return card
}

export interface Bulk {
    done: string[]
    refused: { id: string; why: string }[]
}

function why(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export async function moveCards(
    slug: string,
    wanted: { id: string; rev: number }[],
    to: Status
): Promise<Bulk> {
    const file = await load(slug)
    const result: Bulk = { done: [], refused: [] }
    const moved: [string, string][] = []

    for (const entry of wanted) {
        try {
            const from = applyMove(file, entry.id, entry.rev, to)
            result.done.push(entry.id)
            if (from !== null) moved.push([entry.id, `${from} to ${to}, by hand`])
        } catch (error) {
            result.refused.push({ id: entry.id, why: why(error) })
        }
    }

    if (moved.length) {
        await save(slug, file)
        for (const [id, detail] of moved) await events.record(slug, id, 'moved', detail)
    }
    return result
}

export async function unblock(slug: string, id: string, rev: number): Promise<Card> {
    const file = await load(slug)
    const card = find(file, id)

    if (card.rev !== rev) throw new Refusal('that card changed while you were unblocking it')
    if (card.status !== 'blocked') throw new Refusal('that card is not blocked')

    const open = blockedBy(file, card).length > 0
    card.status = open ? 'todo' : (card.sourcePhase ?? 'ready')
    card.blockKind = null
    card.sourcePhase = null
    touch(card)
    await save(slug, file)
    await events.record(slug, card.id, 'unblocked', `returned to ${card.status}`)
    return card
}

function applyDelete(file: BoardFile, id: string, going: Set<string>): Card {
    const card = find(file, id)
    if (card.locked) throw new Refusal('that card has a live worker')

    const child = file.cards.find((entry) => entry.parents.includes(id) && !going.has(entry.id))
    if (child) throw new Refusal(`'${child.title}' depends on that card`)

    file.cards = file.cards.filter((entry) => entry.id !== id)
    return card
}

async function forgetCard(slug: string, card: Card): Promise<void> {
    await reclaim(attachmentsRoot(slug, card.id), boardRoot(slug))
    await reclaim(join(workspacesRoot(slug), card.id), workspacesRoot(slug))
    await events.record(slug, card.id, 'deleted', card.title)
}

export async function deleteCard(slug: string, id: string): Promise<boolean> {
    const file = await load(slug)
    const card = applyDelete(file, id, new Set())
    await save(slug, file)
    await forgetCard(slug, card)
    return true
}

export async function deleteCards(slug: string, ids: string[]): Promise<Bulk> {
    const file = await load(slug)
    const result: Bulk = { done: [], refused: [] }
    const going = new Set<string>()

    for (const id of ids) {
        try {
            if (find(file, id).locked) throw new Refusal('that card has a live worker')
            going.add(id)
        } catch (error) {
            result.refused.push({ id, why: why(error) })
        }
    }

    for (let settled = false; !settled; ) {
        settled = true
        for (const id of [...going]) {
            const child = file.cards.find(
                (entry) => entry.parents.includes(id) && !going.has(entry.id)
            )
            if (!child) continue
            going.delete(id)
            result.refused.push({ id, why: `'${child.title}' depends on that card` })
            settled = false
        }
    }

    const gone = file.cards.filter((card) => going.has(card.id))
    if (!gone.length) return result

    file.cards = file.cards.filter((card) => !going.has(card.id))
    await save(slug, file)
    for (const card of gone) await forgetCard(slug, card)
    result.done = ids.filter((id) => going.has(id))
    return result
}

export async function attach(slug: string, id: string, added: Attachment[]): Promise<Card> {
    const file = await load(slug)
    const card = find(file, id)
    const held = new Set(card.attachments.map((entry) => entry.name))

    for (const entry of added) {
        if (held.has(entry.name)) continue
        card.attachments.push(entry)
        held.add(entry.name)
    }

    touch(card)
    await save(slug, file)
    await events.record(slug, id, 'attached', added.map((entry) => entry.name).join(', '))
    return card
}

export async function detach(slug: string, id: string, name: string): Promise<Card> {
    const file = await load(slug)
    const card = find(file, id)
    card.attachments = card.attachments.filter((entry) => entry.name !== name)
    touch(card)
    await save(slug, file)
    await events.record(slug, id, 'detached', name)
    return card
}

export async function comment(
    slug: string,
    id: string,
    text: string,
    author: Comment['author']
): Promise<Card> {
    const body = String(text ?? '').trim()
    if (!body) throw new Refusal('the comment is empty')

    const file = await load(slug)
    const card = find(file, id)
    card.comments.push({ at: Date.now(), author, text: body })
    touch(card)
    await save(slug, file)
    await events.record(slug, id, 'commented', `${author}: ${body.slice(0, 120)}`)
    return card
}

export async function promote(slug: string, now: number): Promise<boolean> {
    const file = await load(slug)
    let changed = false

    for (const card of file.cards) {
        if (card.status === 'todo' && card.parents.length && !blockedBy(file, card).length) {
            card.status = 'ready'
            touch(card)
            await events.record(slug, card.id, 'promoted', 'every parent closed')
            changed = true
            continue
        }
        if (card.status === 'scheduled' && card.scheduledFor !== null && card.scheduledFor <= now) {
            card.status = 'ready'
            card.scheduledFor = null
            touch(card)
            await events.record(slug, card.id, 'promoted', 'its time arrived')
            changed = true
        }
    }

    if (changed) await save(slug, file)
    return changed
}
