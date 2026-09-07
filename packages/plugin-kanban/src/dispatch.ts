import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import * as agents from './agents.js'
import type { SessionRecord } from './agents.js'
import * as board from './board.js'
import * as boards from './boards.js'
import * as worker from './worker.js'
import type { BoardFile, BoardMeta, Card, Run, Status } from './types.js'

const BUSY_MS = 5_000
const IDLE_MS = 30_000
const PER_BOARD = 1
const GLOBAL = 2
const RETRIES = 2
const VIOLATIONS = 3
const GUARD_MS = 60_000

export interface CardProgress {
    slug: string
    cardId: string
    runId: string
    state: string
    tool: string | null
    inputTokens: number
    outputTokens: number
    startedAt: number
    waiting: boolean
}

export interface Sink {
    boardChanged(slug: string): void
    cardProgress(progress: CardProgress): void
    runEnded(slug: string, cardId: string, outcome: string): void
}

let timer: NodeJS.Timeout | null = null
let ticking = false
let cursor = 0

function current(card: Card): Run | null {
    return card.runs.length ? card.runs[card.runs.length - 1] : null
}

function workspace(meta: BoardMeta, card: Card): string {
    if (card.workspaceKind === 'scratch') {
        return join(boards.boardRoot(meta.slug), 'workspaces', card.id)
    }
    return card.workdir ?? meta.workdir
}

function close(run: Run, outcome: Run['outcome'], summary: string | null, error: string | null): void {
    run.endedAt = Date.now()
    run.outcome = outcome
    run.summary = summary
    run.error = error
}

function land(file: BoardFile, card: Card, status: Status): void {
    card.status = status
    card.locked = false
    card.rev += 1
    card.updatedAt = Date.now()
}

async function adopt(
    file: BoardFile,
    meta: BoardMeta,
    card: Card,
    followups: { title: string; body: string }[]
): Promise<void> {
    for (const entry of followups.slice(0, 10)) {
        const title = entry.title.trim()
        if (!title) continue
        const child = await board.createCard(meta.slug, {
            title,
            body: entry.body,
            status: 'todo',
            parents: [card.id]
        })
        if (!file.cards.some((existing) => existing.id === child.id)) file.cards.push(child)
    }
}

async function resolve(
    file: BoardFile,
    meta: BoardMeta,
    card: Card,
    run: Run,
    sink: Sink
): Promise<void> {
    const path = run.sessionId
        ? await agents.transcript(run.worktree ?? workspace(meta, card), run.sessionId)
        : null
    const progress = path ? await worker.progress(path) : null

    if (progress?.terminal) {
        const block = progress.terminal
        close(run, block.outcome === 'completed' ? 'completed' : 'blocked', block.summary, null)
        run.artifacts = block.artifacts
        run.inputTokens = progress.inputTokens
        run.outputTokens = progress.outputTokens

        if (block.followups.length) await adopt(file, meta, card, block.followups)

        if (block.outcome === 'completed') {
            card.consecutiveFailures = 0
            card.protocolViolations = 0
            card.blockRecurrences = 0
            card.blockKind = null
            land(file, card, run.worktree ? 'review' : 'done')
        } else if (block.blockKind === 'dependency') {
            card.blockKind = null
            card.sourcePhase = 'ready'
            land(file, card, 'todo')
        } else {
            card.blockKind = block.blockKind ?? 'needs_input'
            card.sourcePhase = 'ready'
            land(file, card, 'blocked')
        }
        sink.runEnded(meta.slug, card.id, run.outcome ?? 'completed')
        return
    }

    if (progress?.ended) {
        card.protocolViolations += 1
        close(run, 'violation', progress.lastText.slice(0, 400) || null, 'no terminal block')
        run.inputTokens = progress.inputTokens
        run.outputTokens = progress.outputTokens
        if (card.protocolViolations >= VIOLATIONS) {
            card.blockKind = 'capability'
            card.sourcePhase = 'ready'
            land(file, card, 'blocked')
        } else {
            land(file, card, 'ready')
        }
        sink.runEnded(meta.slug, card.id, 'violation')
        return
    }

    const where = run.worktree ?? workspace(meta, card)
    const moved = run.headBefore ? (await worker.head(where)) !== run.headBefore : false
    card.consecutiveFailures += 1
    close(
        run,
        'crashed',
        moved ? 'the worker is gone, but the repository head moved' : null,
        moved ? 'crashed after changing the repository' : 'crashed with no evidence of work'
    )
    if (progress) {
        run.inputTokens = progress.inputTokens
        run.outputTokens = progress.outputTokens
    }

    const limit = card.maxRetries ?? RETRIES
    if (card.consecutiveFailures >= limit) {
        card.blockKind = 'transient'
        card.sourcePhase = 'ready'
        land(file, card, 'blocked')
    } else {
        land(file, card, 'ready')
    }
    sink.runEnded(meta.slug, card.id, 'crashed')
}

async function reconcile(
    meta: BoardMeta,
    sessions: SessionRecord[] | null,
    sink: Sink
): Promise<boolean> {
    const file = await board.load(meta.slug)
    let changed = false

    for (const card of file.cards) {
        if (card.status !== 'running') continue
        const run = current(card)
        if (!run || run.endedAt !== null) {
            land(file, card, 'ready')
            changed = true
            continue
        }

        const state = run.sessionId ? agents.liveness(sessions, run.sessionId) : 'dead'
        if (state === 'unknown') continue

        if (state === 'dead') {
            await resolve(file, meta, card, run, sink)
            changed = true
            continue
        }

        const session = run.sessionId ? agents.find(sessions, run.sessionId) : null
        const path = run.sessionId
            ? await agents.transcript(run.worktree ?? workspace(meta, card), run.sessionId)
            : null
        const progress = path ? await worker.progress(path) : null

        if (progress) {
            run.inputTokens = progress.inputTokens
            run.outputTokens = progress.outputTokens
        }

        const cap = card.maxRuntimeSeconds
        if (cap && Date.now() - run.startedAt > cap * 1000 && run.shortId) {
            await agents.stop(run.shortId)
            close(run, 'stopped', null, `past its ${cap}s runtime cap`)
            card.blockKind = 'transient'
            card.sourcePhase = 'ready'
            land(file, card, 'blocked')
            sink.runEnded(meta.slug, card.id, 'stopped')
            changed = true
            continue
        }

        sink.cardProgress({
            slug: meta.slug,
            cardId: card.id,
            runId: run.runId,
            state: session?.state ?? 'working',
            tool: progress?.tool ?? null,
            inputTokens: progress?.inputTokens ?? 0,
            outputTokens: progress?.outputTokens ?? 0,
            startedAt: run.startedAt,
            waiting: agents.waiting(session)
        })
    }

    if (changed) await board.save(meta.slug, file)
    return changed
}

function guarded(card: Card, now: number): boolean {
    const run = current(card)
    if (!run?.endedAt) return false
    if (run.outcome === 'completed' && now - run.endedAt < GUARD_MS) return true
    return /401|429|quota|credit|not logged in/i.test(run.error ?? '')
}

function claimable(file: BoardFile, now: number): Card[] {
    return file.cards
        .filter((card) => card.status === 'ready' && !card.locked && !guarded(card, now))
        .filter((card) => !board.blockedBy(file, card).length)
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
}

async function claim(meta: BoardMeta, sink: Sink): Promise<boolean> {
    const file = await board.load(meta.slug)
    const running = file.cards.filter((card) => card.status === 'running').length
    if (running >= PER_BOARD) return false

    const card = claimable(file, Date.now())[0]
    if (!card) return false

    const runId = randomUUID()
    const run: Run = {
        runId,
        sessionId: null,
        shortId: null,
        worktree: null,
        branch: null,
        startedAt: Date.now(),
        endedAt: null,
        outcome: null,
        summary: null,
        artifacts: [],
        inputTokens: 0,
        outputTokens: 0,
        error: null,
        headBefore: null
    }

    card.runs.push(run)
    card.status = 'running'
    card.locked = true
    card.rev += 1
    card.updatedAt = Date.now()
    await board.save(meta.slug, file)
    sink.boardChanged(meta.slug)

    const place = workspace(meta, card)
    try {
        if (card.workspaceKind === 'scratch') await mkdir(place, { recursive: true })
        const parents = card.parents
            .map((id) => file.cards.find((entry) => entry.id === id))
            .filter((entry): entry is Card => Boolean(entry))

        const started = await worker.start(meta, card, parents, runId, place)
        run.sessionId = started.sessionId
        run.shortId = started.shortId
        run.headBefore = started.headBefore
        run.worktree = started.worktree
        run.branch = started.branch
    } catch (error) {
        close(run, 'crashed', null, error instanceof Error ? error.message : String(error))
        card.consecutiveFailures += 1
        const spent = card.consecutiveFailures >= (card.maxRetries ?? RETRIES)
        if (spent) {
            card.blockKind = 'capability'
            card.sourcePhase = 'ready'
        }
        land(file, card, spent ? 'blocked' : 'ready')
        sink.runEnded(meta.slug, card.id, 'crashed')
    }

    await board.save(meta.slug, file)
    return true
}

export async function sweep(sink: Sink): Promise<void> {
    if (ticking) return
    ticking = true
    try {
        const sessions = await agents.snapshot()
        const open = (await boards.list()).filter((entry) => !entry.archived)
        if (!open.length) return

        let running = 0
        for (const meta of open) {
            if (await reconcile(meta, sessions, sink)) sink.boardChanged(meta.slug)
            if (await board.promote(meta.slug, Date.now())) sink.boardChanged(meta.slug)
            running += (await board.cards(meta.slug)).filter((card) => card.status === 'running').length
        }

        for (let step = 0; step < open.length && running < GLOBAL; step += 1) {
            const meta = open[(cursor + step) % open.length]
            if (await claim(meta, sink)) {
                running += 1
                sink.boardChanged(meta.slug)
            }
        }
        cursor = (cursor + 1) % open.length
    } finally {
        ticking = false
    }
}

export function begin(sink: Sink): () => void {
    let period = IDLE_MS

    const schedule = (next: number): void => {
        if (timer) clearInterval(timer)
        period = next
        timer = setInterval(() => void run(), period)
        timer.unref?.()
    }

    const run = async (): Promise<void> => {
        await sweep(sink).catch(() => undefined)
        const open = (await boards.list()).filter((entry) => !entry.archived)
        let busy = false
        for (const meta of open) {
            if ((await board.cards(meta.slug)).some((card) => card.status === 'running')) busy = true
        }
        const wanted = busy ? BUSY_MS : IDLE_MS
        if (wanted !== period) schedule(wanted)
    }

    schedule(IDLE_MS)
    void run()

    return () => {
        if (timer) clearInterval(timer)
        timer = null
    }
}

export function force(sink: Sink): Promise<void> {
    return sweep(sink)
}
