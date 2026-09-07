import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import * as agents from './agents.js'
import type { SessionRecord } from './agents.js'
import * as board from './board.js'
import * as boards from './boards.js'
import * as worker from './worker.js'
import type { BlockKind, BoardFile, BoardMeta, Card, Run, Status } from './types.js'

const BUSY_MS = 5_000
const IDLE_MS = 30_000
const PER_BOARD = 1
const GLOBAL = 2
const RETRIES = 2
const VIOLATIONS = 3
const RECURRENCES = 2
const GUARD_MS = 60_000
const SILENT_MS = 60 * 60_000
const MIN_AGE_MS = 4 * 60 * 60_000
const STRANDED_MS = 30 * 60_000

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

const BOOTED = Date.now()

let timer: NodeJS.Timeout | null = null
let ticking = false
let cursor = 0
let survived = false

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

function land(card: Card, status: Status): void {
    card.status = status
    card.locked = false
    card.rev += 1
    card.updatedAt = Date.now()
}

function block(card: Card, kind: BlockKind, from: 'ready' | 'review'): void {
    card.blockRecurrences = card.lastBlockKind === kind ? card.blockRecurrences + 1 : 1
    card.lastBlockKind = kind

    if (card.blockRecurrences >= RECURRENCES) {
        card.blockKind = null
        card.sourcePhase = null
        card.lastBlockKind = null
        card.blockRecurrences = 0
        land(card, 'triage')
        return
    }

    card.blockKind = kind
    card.sourcePhase = from
    land(card, 'blocked')
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
    sink: Sink,
    progress: worker.Progress | null
): Promise<void> {
    if (progress?.terminal) {
        const declared = progress.terminal
        close(
            run,
            declared.outcome === 'completed' ? 'completed' : 'blocked',
            declared.summary,
            null
        )
        run.artifacts = declared.artifacts
        run.inputTokens = progress.inputTokens
        run.outputTokens = progress.outputTokens

        if (declared.followups.length) await adopt(file, meta, card, declared.followups)

        if (declared.outcome === 'completed') {
            card.consecutiveFailures = 0
            card.protocolViolations = 0
            card.blockRecurrences = 0
            card.lastBlockKind = null
            card.blockKind = null
            land(card, run.worktree ? 'review' : 'done')
        } else if (declared.blockKind === 'dependency') {
            card.blockKind = null
            card.sourcePhase = 'ready'
            land(card, 'todo')
        } else {
            block(card, declared.blockKind ?? 'needs_input', 'ready')
        }
        sink.runEnded(meta.slug, card.id, run.outcome ?? 'completed')
        return
    }

    if (progress?.ended) {
        card.protocolViolations += 1
        close(run, 'violation', progress.lastText.slice(0, 400) || null, 'no terminal block')
        run.inputTokens = progress.inputTokens
        run.outputTokens = progress.outputTokens
        if (card.protocolViolations >= VIOLATIONS) block(card, 'capability', 'ready')
        else land(card, 'ready')
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
    if (card.consecutiveFailures >= limit) block(card, 'transient', 'ready')
    else land(card, 'ready')
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
            land(card, 'ready')
            changed = true
            continue
        }

        const state = run.sessionId ? agents.liveness(sessions, run.sessionId) : 'dead'
        const session = run.sessionId ? agents.find(sessions, run.sessionId) : null
        const path = run.sessionId
            ? await agents.transcript(run.worktree ?? workspace(meta, card), run.sessionId)
            : null
        const progress = path ? await worker.progress(path) : null

        if (progress) {
            run.inputTokens = progress.inputTokens
            run.outputTokens = progress.outputTokens
        }

        const declared = progress?.terminal != null && progress.ended

        if (state === 'unknown' && !declared) continue

        if (declared || state === 'dead') {
            if (declared && state !== 'dead' && run.shortId) await agents.stop(run.shortId)
            await resolve(file, meta, card, run, sink, progress)
            changed = true
            continue
        }

        if (run.startedAt < BOOTED) survived = true

        const now = Date.now()
        const cap = card.maxRuntimeSeconds
        const overrun = cap !== null && now - run.startedAt > cap * 1000
        const silent =
            session?.state === 'working' &&
            progress !== null &&
            now - progress.modifiedAt > SILENT_MS &&
            now - run.startedAt > MIN_AGE_MS

        if ((overrun || silent) && run.shortId) {
            await agents.stop(run.shortId)
            close(
                run,
                'stopped',
                null,
                overrun ? `past its ${cap}s runtime cap` : 'alive but silent for an hour'
            )
            block(card, 'transient', 'ready')
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

        const started = await worker.start(card, parents, runId, place)
        run.sessionId = started.sessionId
        run.shortId = started.shortId
        run.headBefore = started.headBefore
        run.worktree = started.worktree
        run.branch = started.branch
    } catch (error) {
        close(run, 'crashed', null, error instanceof Error ? error.message : String(error))
        card.consecutiveFailures += 1
        if (card.consecutiveFailures >= (card.maxRetries ?? RETRIES)) {
            block(card, 'capability', 'ready')
        } else {
            land(card, 'ready')
        }
        sink.runEnded(meta.slug, card.id, 'crashed')
    }

    await board.save(meta.slug, file)
    return true
}

export interface Diagnostic {
    slug: string
    cardId: string | null
    problem: string
}

export async function diagnose(): Promise<Diagnostic[]> {
    const found: Diagnostic[] = []
    const now = Date.now()
    const sessions = await agents.snapshot()
    const open = (await boards.list()).filter((entry) => !entry.archived)

    for (const meta of open) {
        const file = await board.load(meta.slug)
        for (const card of file.cards) {
            if (
                card.status === 'ready' &&
                !board.blockedBy(file, card).length &&
                now - card.updatedAt > STRANDED_MS
            ) {
                found.push({
                    slug: meta.slug,
                    cardId: card.id,
                    problem: 'claimable for half an hour and never claimed'
                })
            }

            if (card.status !== 'running') continue
            const run = current(card)
            if (!run?.sessionId) continue

            if (sessions === null) {
                found.push({
                    slug: meta.slug,
                    cardId: card.id,
                    problem: 'liveness unknown, the claim is being extended'
                })
                continue
            }

            const session = agents.find(sessions, run.sessionId)
            if (agents.waiting(session)) {
                found.push({ slug: meta.slug, cardId: card.id, problem: 'waiting on you' })
            }
        }
    }

    if (survived) {
        found.push({
            slug: '',
            cardId: null,
            problem: 'a worker outlived a previous run of this app, so sessions survive it here'
        })
    }

    return found
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
