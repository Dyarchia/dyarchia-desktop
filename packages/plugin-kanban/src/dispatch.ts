import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import * as agents from './agents.js'
import { harvest, reclaim, strays } from './artifacts.js'
import type { SessionRecord } from './agents.js'
import * as board from './board.js'
import * as boards from './boards.js'
import * as events from './events.js'
import * as lease from './lease.js'
import { isClosed } from './rules.js'
import * as worker from './worker.js'
import * as worktrees from './worktrees.js'
import type {
    BlockKind,
    BoardFile,
    BoardMeta,
    Card,
    Overview,
    Run,
    RunKind,
    Status,
    WatchRun
} from './types.js'

const BUSY_MS = 5_000
const IDLE_MS = 30_000
const RETRIES = 2
const VIOLATIONS = 3
const RECURRENCES = 2
const ADOPTED = 10
const GUARD_MS = 60_000
const SILENT_MS = 60 * 60_000
const MIN_AGE_MS = 4 * 60 * 60_000
const STRANDED_MS = 30 * 60_000
const PRUNE_MS = 10 * 60_000

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
    notify(notice: { title: string; body: string; action: { slug: string; cardId: string } }): void
}

const waiting = new Set<string>()

function tell(
    sink: Sink,
    meta: BoardMeta,
    card: Card,
    title: string,
    body: string
): void {
    sink.notify({
        title,
        body: `${meta.name} · ${body}`.slice(0, 400),
        action: { slug: meta.slug, cardId: card.id }
    })
}

function ended(sink: Sink, meta: BoardMeta, card: Card, run: Run): void {
    waiting.delete(card.id)

    const said = run.summary ?? run.error ?? ''
    if (run.kind === 'review' && run.outcome === 'completed') {
        const approved = card.status === 'done'
        tell(
            sink,
            meta,
            card,
            `${card.title} ${approved ? 'passed review' : 'needs changes'}`,
            said || (approved ? 'the reviewer approved it' : 'the reviewer sent it back')
        )
        return
    }
    if (run.outcome === 'completed') {
        tell(sink, meta, card, `${card.title} is ready for review`, said || 'the worker finished')
        return
    }
    if (run.outcome === 'blocked') {
        tell(sink, meta, card, `${card.title} is blocked`, said || (card.blockKind ?? 'it needs you'))
        return
    }
    if (run.outcome === 'violation') {
        tell(sink, meta, card, `${card.title} broke the protocol`, said || 'no terminal block')
        return
    }
    tell(sink, meta, card, `${card.title} stopped without finishing`, said || 'the worker is gone')
}

const BOOTED = Date.now()
const OWNER = randomUUID()

let timer: NodeJS.Timeout | null = null
let ticking = false
let cursor = 0
let survived = false
let prunedAt = 0
let holding = true
let housekeeping: Diagnostic[] = []

function current(card: Card): Run | null {
    return card.runs.length ? card.runs[card.runs.length - 1] : null
}

function reviewed(card: Card): Run | null {
    return (
        [...card.runs]
            .reverse()
            .find((run) => run.kind === 'implement' && run.outcome === 'completed') ?? null
    )
}

function blank(runId: string, kind: RunKind): Run {
    return {
        runId,
        kind,
        sessionId: null,
        shortId: null,
        worktree: null,
        branch: null,
        startedAt: Date.now(),
        endedAt: null,
        outcome: null,
        summary: null,
        artifacts: [],
        kept: [],
        inputTokens: 0,
        outputTokens: 0,
        error: null,
        headBefore: null
    }
}

function workspace(meta: BoardMeta, card: Card): string {
    if (card.workspaceKind === 'scratch') {
        return join(boards.workspacesRoot(meta.slug), card.id)
    }
    return card.workdir ?? meta.workdir
}

function place(meta: BoardMeta, card: Card, run: Run): string {
    if (run.kind === 'review') return card.workdir ?? meta.workdir
    return run.worktree ?? workspace(meta, card)
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

function block(slug: string, card: Card, kind: BlockKind, from: 'ready' | 'review'): void {
    card.blockRecurrences = card.lastBlockKind === kind ? card.blockRecurrences + 1 : 1
    card.lastBlockKind = kind

    if (card.blockRecurrences >= RECURRENCES) {
        card.blockKind = null
        card.sourcePhase = null
        card.lastBlockKind = null
        card.blockRecurrences = 0
        land(card, 'triage')
        void events.record(slug, card.id, 'block_loop', `blocked on ${kind} twice, sent to triage`)
        return
    }

    card.blockKind = kind
    card.sourcePhase = from
    land(card, 'blocked')
    void events.record(slug, card.id, 'blocked', kind)
}

export async function adopt(
    file: BoardFile,
    meta: BoardMeta,
    card: Card,
    followups: { title: string; body: string }[]
): Promise<void> {
    const named = followups.filter((entry) => entry.title.trim())

    for (const entry of named.slice(0, ADOPTED)) {
        const child = await board.createCard(meta.slug, {
            title: entry.title.trim(),
            body: entry.body,
            status: 'todo',
            parents: [card.id]
        })
        if (!file.cards.some((existing) => existing.id === child.id)) file.cards.push(child)
    }

    const dropped = named.slice(ADOPTED).map((entry) => entry.title.trim())
    if (!dropped.length) return

    card.comments.push({
        at: Date.now(),
        author: 'agent',
        text: `The last run proposed ${named.length} followups and a run may only open ${ADOPTED}. These did not become cards: ${dropped.join('; ')}`
    })
}

async function resolveReview(
    file: BoardFile,
    meta: BoardMeta,
    card: Card,
    run: Run,
    sink: Sink,
    progress: worker.Progress | null
): Promise<void> {
    if (progress) {
        run.inputTokens = progress.inputTokens
        run.outputTokens = progress.outputTokens
    }

    const say = (outcome: string): void => {
        ended(sink, meta, card, run)
        sink.runEnded(meta.slug, card.id, outcome)
    }

    const declared = progress?.terminal ?? null

    if (declared) {
        close(run, declared.outcome === 'completed' ? 'completed' : 'blocked', declared.summary, null)
        if (declared.followups.length) await adopt(file, meta, card, declared.followups)

        if (declared.outcome === 'blocked') {
            block(meta.slug, card, declared.blockKind ?? 'needs_input', 'review')
            say('blocked')
            return
        }

        if (declared.verdict === null) {
            card.protocolViolations += 1
            close(run, 'violation', declared.summary, 'a review that declared no verdict')
            if (card.protocolViolations >= VIOLATIONS) block(meta.slug, card, 'capability', 'review')
            else land(card, 'review')
            void events.record(meta.slug, card.id, 'violation', 'the review declared no verdict', run.runId)
            say('violation')
            return
        }

        card.protocolViolations = 0

        if (declared.verdict === 'approved') {
            card.consecutiveFailures = 0
            land(card, 'done')
        } else {
            card.comments.push({
                at: Date.now(),
                author: 'agent',
                text:
                    declared.summary.trim() ||
                    'The reviewer asked for changes and said nothing about what they are.'
            })
            land(card, 'ready')
        }

        void events.record(
            meta.slug,
            card.id,
            'reviewed',
            `${declared.verdict}: ${declared.summary.slice(0, 140)}`,
            run.runId
        )
        say('completed')
        return
    }

    if (progress?.ended) {
        card.protocolViolations += 1
        close(run, 'violation', progress.lastText.slice(0, 400) || null, 'no terminal block')
        if (card.protocolViolations >= VIOLATIONS) block(meta.slug, card, 'capability', 'review')
        else land(card, 'review')
        void events.record(
            meta.slug,
            card.id,
            'violation',
            'the review ended with no terminal block',
            run.runId
        )
        say('violation')
        return
    }

    card.consecutiveFailures += 1
    close(run, 'crashed', null, 'the reviewer is gone, and it judged nothing')
    const spent = card.consecutiveFailures >= (card.maxRetries ?? RETRIES)
    if (spent) block(meta.slug, card, 'transient', 'review')
    else land(card, 'review')
    void events.record(
        meta.slug,
        card.id,
        spent ? 'gave_up' : 'crashed',
        run.error ?? 'the reviewer is gone',
        run.runId
    )
    say('crashed')
}

async function resolve(
    file: BoardFile,
    meta: BoardMeta,
    card: Card,
    run: Run,
    sink: Sink,
    progress: worker.Progress | null
): Promise<void> {
    if (run.kind === 'review') return resolveReview(file, meta, card, run, sink, progress)

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

        const picked = await harvest(
            meta.slug,
            card.id,
            place(meta, card, run),
            declared.artifacts
        )
        run.kept = picked.kept

        if (declared.outcome === 'completed' && picked.missing.length) {
            const names = picked.missing.join(', ')
            close(run, 'violation', declared.summary, `declared but missing: ${names}`)
            card.comments.push({
                at: Date.now(),
                author: 'agent',
                text: `The last run declared artifacts that were not there: ${names}. Write them, or declare the paths they actually have.`
            })
            card.consecutiveFailures += 1
            if (card.consecutiveFailures >= (card.maxRetries ?? RETRIES)) {
                block(meta.slug, card, 'capability', 'ready')
            } else {
                land(card, 'ready')
            }
            void events.record(meta.slug, card.id, 'violation', `declared but missing: ${names}`, run.runId)
            ended(sink, meta, card, run)
            sink.runEnded(meta.slug, card.id, 'violation')
            return
        }

        if (declared.followups.length) await adopt(file, meta, card, declared.followups)

        if (declared.outcome === 'completed') {
            card.consecutiveFailures = 0
            card.protocolViolations = 0
            card.blockRecurrences = 0
            card.lastBlockKind = null
            card.blockKind = null
            if (card.workspaceKind === 'scratch') {
                if (run.shortId) await agents.stop(run.shortId)
                const gone = await reclaim(workspace(meta, card), boards.workspacesRoot(meta.slug))
                if (!gone) run.error = 'the scratch workspace could not be removed'
            }
            land(card, run.worktree ? 'review' : 'done')
            void events.record(
                meta.slug,
                card.id,
                'completed',
                declared.summary.slice(0, 160),
                run.runId
            )
        } else if (declared.blockKind === 'dependency') {
            card.blockKind = null
            card.sourcePhase = 'ready'
            land(card, 'todo')
        } else {
            block(meta.slug, card, declared.blockKind ?? 'needs_input', 'ready')
        }
        ended(sink, meta, card, run)
        sink.runEnded(meta.slug, card.id, run.outcome ?? 'completed')
        return
    }

    if (progress?.ended) {
        card.protocolViolations += 1
        close(run, 'violation', progress.lastText.slice(0, 400) || null, 'no terminal block')
        run.inputTokens = progress.inputTokens
        run.outputTokens = progress.outputTokens
        if (card.protocolViolations >= VIOLATIONS) block(meta.slug, card, 'capability', 'ready')
        else land(card, 'ready')
        void events.record(meta.slug, card.id, 'violation', 'the turn ended with no terminal block', run.runId)
        ended(sink, meta, card, run)
        sink.runEnded(meta.slug, card.id, 'violation')
        return
    }

    const where = place(meta, card, run)
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
    const spent = card.consecutiveFailures >= limit
    if (spent) block(meta.slug, card, 'transient', 'ready')
    else land(card, 'ready')
    void events.record(
        meta.slug,
        card.id,
        spent ? 'gave_up' : 'crashed',
        run.error ?? 'the worker is gone',
        run.runId
    )
    ended(sink, meta, card, run)
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
            ? await agents.transcript(place(meta, card, run), run.sessionId)
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
            block(meta.slug, card, 'transient', 'ready')
            void events.record(meta.slug, card.id, 'stopped', run.error ?? '', run.runId)
            ended(sink, meta, card, run)
            sink.runEnded(meta.slug, card.id, 'stopped')
            changed = true
            continue
        }

        const asking = agents.waiting(session)
        if (asking && !waiting.has(card.id)) {
            waiting.add(card.id)
            tell(sink, meta, card, `${card.title} is waiting on you`, 'the worker is asking for permission')
        }
        if (!asking) waiting.delete(card.id)

        sink.cardProgress({
            slug: meta.slug,
            cardId: card.id,
            runId: run.runId,
            state: session?.state ?? 'working',
            tool: progress?.tool ?? null,
            inputTokens: progress?.inputTokens ?? 0,
            outputTokens: progress?.outputTokens ?? 0,
            startedAt: run.startedAt,
            waiting: asking
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

async function launch(
    file: BoardFile,
    meta: BoardMeta,
    card: Card,
    run: Run,
    sink: Sink,
    where: string,
    reviewing: Run | null
): Promise<void> {
    const home = run.kind === 'review' ? 'review' : 'ready'
    try {
        if (!reviewing && card.workspaceKind === 'scratch') await mkdir(where, { recursive: true })
        const parents = card.parents
            .map((id) => file.cards.find((entry) => entry.id === id))
            .filter((entry): entry is Card => Boolean(entry))

        const held = card.attachments.map((entry) => ({
            name: entry.name,
            path: join(boards.attachmentsRoot(meta.slug, card.id), entry.name)
        }))

        const started = await worker.start(card, parents, run.runId, where, held, reviewing)
        run.sessionId = started.sessionId
        run.shortId = started.shortId
        run.headBefore = started.headBefore
        run.worktree = started.worktree
        run.branch = started.branch
    } catch (error) {
        close(run, 'crashed', null, error instanceof Error ? error.message : String(error))
        card.consecutiveFailures += 1
        if (card.consecutiveFailures >= (card.maxRetries ?? RETRIES)) {
            block(meta.slug, card, 'capability', home)
        } else {
            land(card, home)
        }
        void events.record(meta.slug, card.id, 'crashed', run.error ?? 'the launch failed', run.runId)
        ended(sink, meta, card, run)
        sink.runEnded(meta.slug, card.id, 'crashed')
    }
}

function take(card: Card, kind: RunKind): Run {
    const run = blank(randomUUID(), kind)
    card.runs.push(run)
    card.status = 'running'
    card.locked = true
    card.rev += 1
    card.updatedAt = Date.now()
    return run
}

async function claim(meta: BoardMeta, sink: Sink): Promise<boolean> {
    const file = await board.load(meta.slug)
    const running = file.cards.filter((card) => card.status === 'running').length
    if (running >= (meta.maxRunning ?? boards.PER_BOARD)) return false

    const card = claimable(file, Date.now())[0]
    if (!card) return false

    const run = take(card, 'implement')
    await board.save(meta.slug, file)
    await events.record(meta.slug, card.id, 'claimed', `attempt ${card.runs.length}`, run.runId)
    sink.boardChanged(meta.slug)

    await launch(file, meta, card, run, sink, workspace(meta, card), null)
    await board.save(meta.slug, file)
    return true
}

export async function review(meta: BoardMeta, cardId: string, sink: Sink): Promise<void> {
    const file = await board.load(meta.slug)
    const card = board.find(file, cardId)
    if (card.status !== 'review') throw new Error('that card is not waiting for a review')

    const judged = reviewed(card)
    if (!judged) throw new Error('that card has no finished run for a reviewer to read')

    const run = take(card, 'review')
    await board.save(meta.slug, file)
    await events.record(
        meta.slug,
        card.id,
        'claimed',
        `review of ${judged.branch ?? 'the working directory'}`,
        run.runId
    )
    sink.boardChanged(meta.slug)

    await launch(file, meta, card, run, sink, card.workdir ?? meta.workdir, judged)
    await board.save(meta.slug, file)
}

export interface Diagnostic {
    slug: string
    cardId: string | null
    problem: string
}

export function held(cards: Card[]): string[] {
    const paths: string[] = []
    for (const card of cards) {
        if (card.status !== 'running') continue
        const run = current(card)
        if (!run) continue
        const using = run.kind === 'review' ? reviewed(card) : run
        if (using?.worktree) paths.push(using.worktree)
    }
    return paths
}

export async function inventory(meta: BoardMeta): Promise<worktrees.Worktree[]> {
    const live = held(await board.cards(meta.slug))
    return (await worktrees.list(meta.workdir)).map((tree) => ({
        ...tree,
        live: live.some((path) => worktrees.same(path, tree.path))
    }))
}

async function prune(): Promise<void> {
    const now = Date.now()
    if (now - prunedAt < PRUNE_MS) return
    prunedAt = now

    const all = await boards.list()

    for (const meta of all) {
        const keep = new Set(
            (await board.cards(meta.slug)).filter((card) => !isClosed(card.status)).map((card) => card.id)
        )
        const root = boards.workspacesRoot(meta.slug)
        for (const name of await strays(root, keep)) await reclaim(join(root, name), root)
    }

    const parent = boards.workspacesParent()
    const known = new Set(all.map((meta) => meta.slug))
    for (const name of await strays(parent, known)) await reclaim(join(parent, name), parent)

    const notes: Diagnostic[] = []
    for (const meta of all.filter((entry) => !entry.archived)) {
        const ignoring = await worktrees.state(meta.workdir)
        if (ignoring.tracked && !ignoring.ignored) {
            notes.push({
                slug: meta.slug,
                cardId: null,
                problem: 'this project does not ignore .claude/worktrees, so a run shows up in its git status'
            })
        }

        const landed = (await inventory(meta)).filter((tree) => tree.landed && !tree.live)
        if (landed.length) {
            notes.push({
                slug: meta.slug,
                cardId: null,
                problem: `${landed.length} landed worktree${landed.length === 1 ? '' : 's'} can be removed`
            })
        }
    }

    housekeeping = notes
}

export async function diagnose(known?: SessionRecord[] | null): Promise<Diagnostic[]> {
    const found: Diagnostic[] = [...housekeeping]
    const now = Date.now()
    const sessions = known === undefined ? await agents.snapshot() : known
    const open = (await boards.list()).filter((entry) => !entry.archived)
    const across = (await boards.settings()).maxRunning

    if (across === 0 && open.length) {
        found.push({
            slug: '',
            cardId: null,
            problem: 'every board is paused: the cap across all of them is 0, so nothing is claimed'
        })
    }

    for (const meta of open) {
        const file = await board.load(meta.slug)
        const cap = meta.maxRunning ?? boards.PER_BOARD
        const paused = cap === 0 || across === 0

        if (cap === 0) {
            found.push({
                slug: meta.slug,
                cardId: null,
                problem: 'this board is paused: its cap is 0, so nothing new is claimed'
            })
        }

        for (const card of file.cards) {
            if (
                !paused &&
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

    if (!holding) {
        found.push({
            slug: '',
            cardId: null,
            problem: 'another dyarchia holds the dispatcher, so this one is watching, not claiming'
        })
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

const DECISIONS = 24

export async function overview(): Promise<Overview> {
    const sessions = await agents.snapshot()
    const open = (await boards.list()).filter((entry) => !entry.archived)
    const across = (await boards.settings()).maxRunning

    const shape: Overview = {
        at: Date.now(),
        holding,
        across,
        running: 0,
        boards: [],
        runs: [],
        decisions: [],
        problems: await diagnose(sessions)
    }

    for (const meta of open) {
        const cards = await board.cards(meta.slug)
        const counts = board.tally(cards)
        shape.boards.push({
            slug: meta.slug,
            name: meta.name,
            cap: meta.maxRunning ?? boards.PER_BOARD,
            running: counts.running,
            counts
        })
        shape.running += counts.running

        for (const card of cards) {
            if (card.status !== 'running') continue
            const run = current(card)
            if (!run) continue
            const session = run.sessionId ? agents.find(sessions, run.sessionId) : null
            const live: WatchRun = {
                slug: meta.slug,
                board: meta.name,
                cardId: card.id,
                title: card.title,
                runId: run.runId,
                kind: run.kind,
                startedAt: run.startedAt,
                state: session?.state ?? 'working',
                tool: null,
                inputTokens: run.inputTokens,
                outputTokens: run.outputTokens,
                waiting: agents.waiting(session)
            }
            shape.runs.push(live)
        }

        const titles = new Map(cards.map((card) => [card.id, card.title]))
        for (const row of await events.read(meta.slug, undefined, DECISIONS)) {
            shape.decisions.push({
                slug: meta.slug,
                board: meta.name,
                at: row.at,
                cardId: row.cardId,
                title: titles.get(row.cardId) ?? row.cardId,
                kind: row.kind,
                detail: row.detail
            })
        }
    }

    shape.runs.sort((a, b) => a.startedAt - b.startedAt)
    shape.decisions.sort((a, b) => b.at - a.at)
    shape.decisions = shape.decisions.slice(0, DECISIONS)
    return shape
}

export async function sweep(sink: Sink): Promise<void> {
    if (ticking) return
    ticking = true
    try {
        holding = await lease.hold(OWNER, Date.now()).catch(() => true)
        if (!holding) return

        await prune().catch(() => undefined)
        const sessions = await agents.snapshot()
        const open = (await boards.list()).filter((entry) => !entry.archived)
        if (!open.length) return
        const across = (await boards.settings()).maxRunning

        let running = 0
        for (const meta of open) {
            if (await reconcile(meta, sessions, sink)) sink.boardChanged(meta.slug)
            if (await board.promote(meta.slug, Date.now())) sink.boardChanged(meta.slug)
            running += (await board.cards(meta.slug)).filter((card) => card.status === 'running').length
        }

        for (let step = 0; step < open.length && running < across; step += 1) {
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
        void lease.drop(OWNER).catch(() => undefined)
    }
}

export function force(sink: Sink): Promise<void> {
    return sweep(sink)
}
