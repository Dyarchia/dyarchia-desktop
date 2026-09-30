import xtermCss from '@xterm/xterm/css/xterm.css'
import { brandIcon, glyph, highlight, injectStyles, tips, when } from '@dyarchia/sdk'
import type { GlyphName, PanelHandle, PluginContext } from '@dyarchia/sdk'
import { MARKER, parseTerminal } from './closing.js'
import { installDrag } from './drag.js'
import type { DragColumn } from './drag.js'
import { openMenu, openSurface } from './menu.js'
import type { MenuRow } from './menu.js'
import { resolve as resolveRunner } from './runners.js'
import { HARNESS_IDS } from './harness/ids.js'
import { STYLES } from './styles.js'
import { openTerminal } from './terminal.js'
import type { Attached } from './terminal.js'
import type {
    BoardMeta,
    BoardPayload,
    Card,
    HarnessInfo,
    KanbanEvent,
    Overview,
    Rules,
    Run,
    Runner,
    Runners,
    RunnersPatch,
    Settings,
    Status,
    WatchBoard,
    WatchRun
} from './types.js'

interface HistoryRow {
    at: number
    kind: 'text' | 'thinking' | 'tool' | 'result' | 'end'
    label: string
    body: string
    error: boolean
    detail?: string
    output?: string
}

/*
 * The verb a step is told with. A tool's own name is the harness's vocabulary and reads as a
 * wall of capitalised identifiers; the verb is what a person would say it did.
 */
const VERBS: Record<string, string> = {
    Bash: 'ran',
    PowerShell: 'ran',
    Read: 'read',
    Write: 'wrote',
    Edit: 'edited',
    MultiEdit: 'edited',
    NotebookEdit: 'edited',
    Grep: 'searched',
    Glob: 'listed',
    WebFetch: 'fetched',
    WebSearch: 'searched the web',
    Agent: 'started agent',
    Task: 'started agent',
    Skill: 'used skill',
    ToolSearch: 'loaded tool',
    ScheduleWakeup: 'set a wake-up',
    TodoWrite: 'updated plan',
    ListAgents: 'listed agents',
    SendMessage: 'messaged agent',
    Monitor: 'watched',
    run_terminal_command: 'ran',
    command_execution: 'ran',
    search_replace: 'edited',
    write: 'wrote',
    read: 'read',
    bash: 'ran'
}

function verbOf(tool: string): string {
    if (VERBS[tool]) return VERBS[tool]
    if (tool.includes('search_corpus')) return 'searched corpus'
    return tool.replace(/^mcp__[^_]+__/, '').replace(/[_-]+/g, ' ').toLowerCase()
}

function clock24(at: number): string {
    return at ? new Date(at).toTimeString().slice(0, 8) : ''
}

/*
 * What the board did to a card, said as a sentence rather than as its event name. Every kind the
 * board records has one; a kind added later without one still reads, as its own name.
 */
const FIELDS: Record<string, string> = {
    title: 'title',
    body: 'brief',
    priority: 'priority',
    workdir: 'directory',
    workspaceKind: 'workspace',
    runners: 'runners',
    maxRuntimeSeconds: 'time limit',
    maxRetries: 'retries',
    permissionMode: 'permission',
    scheduledFor: 'park time',
    parents: 'dependencies'
}

const fieldWords = (detail: string): string =>
    detail
        .split(', ')
        .filter(Boolean)
        .map((name) => FIELDS[name] ?? name)
        .join(', ')

const BLOCKS: Record<string, string> = {
    dependency: 'dependency',
    needs_input: 'needs input',
    capability: 'out of reach',
    transient: 'temporary'
}

const blockWord = (kind: string): string => BLOCKS[kind] ?? kind.replace(/_/g, ' ')

const LOGGED: Record<string, [string, (detail: string) => string, string?]> = {
    created: ['created', () => ''],
    edited: ['edited', (detail) => fieldWords(detail)],
    moved: ['moved', (detail) => detail],
    promoted: ['promoted', (detail) => detail],
    claimed: ['started', (detail) => detail],
    completed: ['finished', (detail) => detail],
    reviewed: ['reviewed', (detail) => detail],
    blocked: ['blocked', (detail) => blockWord(detail), 'warning'],
    unblocked: ['unblocked', (detail) => detail],
    violation: ['no report', (detail) => (detail.includes('terminal block') ? '' : detail), 'error'],
    crashed: ['crashed', (detail) => detail, 'error'],
    stopped: ['stopped', (detail) => detail],
    gave_up: ['gave up', (detail) => detail, 'error'],
    block_loop: ['blocked again', (detail) => detail, 'warning'],
    guarded: ['waiting', (detail) => detail],
    commented: ['noted', (detail) => detail],
    uncommented: ['note removed', (detail) => detail],
    attached: ['file added', (detail) => detail],
    detached: ['file removed', (detail) => detail],
    deleted: ['deleted', (detail) => detail],
    landed: ['committed', (detail) => (detail.startsWith('the board committed') ? '' : detail)]
}

const kindWord = (kind: string): string => LOGGED[kind]?.[0] ?? kind.replace(/_/g, ' ')

function cost(usd: number | null | undefined): string | null {
    if (usd === null || usd === undefined) return null
    return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}

interface Worktree {
    path: string
    branch: string | null
    head: string | null
    landed: boolean
    dirty: boolean
    ahead: number
    live: boolean
}

interface IgnoreState {
    tracked: boolean
    ignored: boolean
}

interface BoardEvent {
    at: number
    cardId: string
    runId: string | null
    kind: string
    detail: string
}

interface Diagnostic {
    slug: string
    cardId: string | null
    problem: string
}

interface CardProgress {
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

/*
 * The panel's mark, one of a set in black and white and nothing else, each a thing of Sparta:
 * a phalanx, two ranks of shields with their spears carried forward.
 * Solid shapes rather than hairlines, so it reads as a key at 18px.
 */
const ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.6 12 6.800000000000001 3.4" stroke="#eceef2" stroke-width="1.2" stroke-linecap="round"/><path d="M6.300000000000001 1.6 8 3.6 6.4 4.6z" fill="#eceef2"/><path d="M8.8 12 12 3.4" stroke="#eceef2" stroke-width="1.2" stroke-linecap="round"/><path d="M11.5 1.6 13.2 3.6 11.600000000000001 4.6z" fill="#eceef2"/><path d="M14 12 17.2 3.4" stroke="#eceef2" stroke-width="1.2" stroke-linecap="round"/><path d="M16.7 1.6 18.4 3.6 16.8 4.6z" fill="#eceef2"/><path d="M19.2 12 22.400000000000002 3.4" stroke="#eceef2" stroke-width="1.2" stroke-linecap="round"/><path d="M21.900000000000002 1.6 23.6 3.6 22 4.6z" fill="#eceef2"/><circle cx="4.2" cy="14.2" r="2.9" fill="#9499a3" stroke="#0a0a0b" stroke-width=".9"/><circle cx="9.4" cy="14.2" r="2.9" fill="#9499a3" stroke="#0a0a0b" stroke-width=".9"/><circle cx="14.6" cy="14.2" r="2.9" fill="#9499a3" stroke="#0a0a0b" stroke-width=".9"/><circle cx="19.8" cy="14.2" r="2.9" fill="#9499a3" stroke="#0a0a0b" stroke-width=".9"/><circle cx="4.2" cy="19.2" r="2.9" fill="#eceef2" stroke="#0a0a0b" stroke-width=".9"/><circle cx="4.2" cy="19.2" r="1.7" fill="none" stroke="#0a0a0b" stroke-width=".6"/><circle cx="9.4" cy="19.2" r="2.9" fill="#eceef2" stroke="#0a0a0b" stroke-width=".9"/><circle cx="9.4" cy="19.2" r="1.7" fill="none" stroke="#0a0a0b" stroke-width=".6"/><circle cx="14.6" cy="19.2" r="2.9" fill="#eceef2" stroke="#0a0a0b" stroke-width=".9"/><circle cx="14.6" cy="19.2" r="1.7" fill="none" stroke="#0a0a0b" stroke-width=".6"/><circle cx="19.8" cy="19.2" r="2.9" fill="#eceef2" stroke="#0a0a0b" stroke-width=".9"/><circle cx="19.8" cy="19.2" r="1.7" fill="none" stroke="#0a0a0b" stroke-width=".6"/></svg>'

const STROKE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'

const ICONS = {
    prompt: `${STROKE}<polyline points="5 7 10 12 5 17"/><line x1="12" y1="18" x2="19" y2="18"/></svg>`,
    expand: `${STROKE}<polyline points="15 4 20 4 20 9"/><polyline points="9 20 4 20 4 15"/><line x1="20" y1="4" x2="14" y2="10"/><line x1="4" y1="20" x2="10" y2="14"/></svg>`,
    contract: `${STROKE}<polyline points="4 10 9 10 9 5"/><polyline points="20 14 15 14 15 19"/><line x1="9" y1="10" x2="3" y2="4"/><line x1="15" y1="14" x2="21" y2="20"/></svg>`
}

const PROVIDERS: Record<string, string> = {
    opencode: 'OpenCode Zen',
    'opencode-go': 'OpenCode Go',
    openrouter: 'OpenRouter',
    'kimi-code': 'Kimi Code'
}

const PERMISSIONS = ['acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan']
const PERMISSION_LABELS: Record<string, string> = {
    acceptEdits: 'Accept edits',
    auto: 'Auto',
    bypassPermissions: 'Bypass permissions',
    manual: 'Manual',
    dontAsk: "Don't ask",
    plan: 'Plan'
}
const PERMISSION_TONES: Record<string, string> = {
    bypassPermissions: 'dya-text--danger'
}
const OTHER = '\u2026'
const WORKSPACES: [string, string][] = [
    ['dir', 'Project folder'],
    ['scratch', 'Temporary folder']
]

const PIN = 'kanban:board:'

interface CardNode {
    root: HTMLElement
    title: HTMLElement
    who: HTMLElement
    marks: HTMLElement
    foot: HTMLElement
    dot: HTMLElement
    note: HTMLElement
}

interface Column extends DragColumn {
    count: HTMLElement
    empty: HTMLElement
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

function read(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        /* a full quota is not worth failing the panel over */
    }
}

function ago(from: number, now: number): string {
    const seconds = Math.max(0, Math.round((now - from) / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.round(minutes / 60)
    return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

/*
 * How long ago, when that is worth saying. A card touched a moment ago reported `0s`, on every
 * card on a board nobody had run yet: nine identical zeroes down a screen, each one the answer to
 * a question the reader had not asked. Under a minute the age is noise and the line goes without
 * it.
 */
function since(from: number, now: number): string | null {
    return now - from < 60_000 ? null : ago(from, now)
}

/* The states a card is on its way to an agent in. Everywhere else, naming one would be a guess. */
const DISPATCHING = new Set<Status>(['scheduled', 'ready', 'running', 'review'])

function size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function tokens(count: number): string {
    if (count < 1000) return String(count)
    if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`
    return `${(count / 1_000_000).toFixed(2)}M`
}

function local(at: number): string {
    const shifted = new Date(at - new Date(at).getTimezoneOffset() * 60_000)
    return shifted.toISOString().slice(0, 16)
}

function order(cards: Card[]): Card[] {
    return cards.slice().sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
}

/*
 * Every stage folds. Two of them arrive folded, which is a default rather than a capability: a
 * board is read left to right and its tail is history, but a stage somebody does not use is a
 * stage they should be able to put away, and until now six of the eight refused.
 */
const FOLDED_BY_DEFAULT: Status[] = ['done', 'archived']

/*
 * What a decision wears. Colour is status and nothing else, so a decision is lit only when it is
 * an outcome: green for work that finished, amber for work that stopped short, red for work that
 * failed or was destroyed. Routine and motion are plain pills, and their word says which.
 */
const DECISION_PILL: Record<string, string> = {
    completed: 'dya-badge dya-badge--success',
    reviewed: 'dya-badge dya-badge--success',
    unblocked: 'dya-badge dya-badge--success',
    landed: 'dya-badge dya-badge--success',
    blocked: 'dya-badge dya-badge--warning',
    guarded: 'dya-badge dya-badge--warning',
    violation: 'dya-badge dya-badge--warning',
    block_loop: 'dya-badge dya-badge--warning',
    stopped: 'dya-badge dya-badge--warning',
    crashed: 'dya-badge dya-badge--danger',
    gave_up: 'dya-badge dya-badge--danger',
    deleted: 'dya-badge dya-badge--danger'
}

function light(tone: string): string {
    return tone === 'idle' ? 'dya-light' : `dya-light dya-light--${tone}`
}

function runTone(run: Run): string {
    if (run.outcome === 'completed') return 'success'
    if (run.outcome === 'blocked' || run.outcome === 'stopped') return 'warning'
    if (run.outcome === 'violation' || run.outcome === 'crashed') return 'danger'
    return run.outcome === null && !run.endedAt ? 'busy' : 'idle'
}

function runEnd(run: Run): string {
    if (run.outcome === null) return run.endedAt ? 'ended' : 'running'
    if (run.outcome === 'completed') return run.kind === 'review' ? 'reviewed' : 'finished'
    if (run.outcome === 'blocked') return 'blocked'
    if (run.outcome === 'stopped') return 'stopped'
    if (run.outcome === 'crashed') return 'crashed'
    if (run.error?.startsWith('declared but missing')) return 'files missing'
    if (run.error === 'a review that declared no verdict') return 'no verdict'
    return 'no report'
}

interface Commands {
    newCard(): void
    newBoard(): void
    switchBoard(): void
    allBoards(): void
    settings(): void
    worktrees(): void
    health(): void
}

const mounted = new Map<string, Commands>()
const waiting: { id: string | undefined; resolve: (found: Commands | undefined) => void }[] = []

function arrived(id: string, commands: Commands): void {
    mounted.set(id, commands)
    for (const entry of waiting.splice(0)) {
        if (entry.id === undefined || entry.id === id) entry.resolve(commands)
        else waiting.push(entry)
    }
}

async function instance(ctx: PluginContext): Promise<Commands | undefined> {
    const id = await ctx.shell.show('kanban')
    const found = id ? mounted.get(id) : [...mounted.values()].at(-1)
    if (found) return found
    return new Promise((resolve) => {
        const entry = { id, resolve }
        waiting.push(entry)
        window.setTimeout(() => {
            const at = waiting.indexOf(entry)
            if (at < 0) return
            waiting.splice(at, 1)
            resolve(undefined)
        }, 3000)
    })
}

function mount(ctx: PluginContext, container: HTMLElement, handle: PanelHandle): () => void {
    const pinKey = `${PIN}${handle.instanceId}`
    const foldKey = (status: Status): string => `${pinKey}:fold:${status}`
    const folded = (status: Status): boolean => {
        const stored = read(foldKey(status))
        return stored === null ? FOLDED_BY_DEFAULT.includes(status) : stored === 'true'
    }

    let registry: BoardMeta[] = []
    let meta: BoardMeta | null = null
    let cards: Card[] = []
    let rules: Rules | null = null
    let clock = Date.now()
    let selected: string | null = null
    let focused: string | null = null
    let gesturing = false
    let deferred = false
    let disposed = false

    const nodes = new Map<string, CardNode>()
    const columns = new Map<Status, Column>()
    const pending = new Set<string>()
    const optimistic = new Map<string, Status>()
    const progress = new Map<string, CardProgress>()

    let terminal: Attached | null = null
    let terminalFor = ''
    let session = false
    let runShown: string | null = null
    let drawnId: string | null = null
    let drawerPaint = 0
    let indexPaint = 0
    let drawnRev = -1
    const marked = new Set<string>()
    let lastMark: string | null = null
    let watching = false
    let overview: Overview | null = null
    let watchTimer = 0

    const root = el('div', 'kanban')

    const tipHolder = el('div')
    const withTip = tips(tipHolder)
    const key = (icon: keyof typeof ICONS | GlyphName, label: string, hint = label): HTMLButtonElement => {
        const button = el('button', 'dya-key')
        button.type = 'button'
        button.innerHTML = icon in ICONS ? ICONS[icon as keyof typeof ICONS] : glyph(icon as GlyphName)
        button.setAttribute('aria-label', label)
        withTip(button, hint)
        return button
    }

    /*
     * The dock's tab row holds what is used all day and nothing else: which board, and a new card,
     * one strip. Settings, worktrees and all boards are palette commands; the board's health is
     * said on the cards and at the foot of the board, where it applies.
     */
    const bar = el('div', 'dya-join')
    const boardSwitch = el('span', 'dya-select kanban-switch')
    const boardButton = el('button', 'dya-field')
    boardButton.type = 'button'
    boardButton.setAttribute('aria-haspopup', 'menu')
    boardButton.setAttribute('aria-label', 'Board')
    const boardLabel = el('span', 'dya-field__label', 'Boards')
    boardButton.append(boardLabel)
    boardSwitch.append(boardButton)
    const newCardKey = key('add', 'New card')
    let openDraft: (() => void) | null = null
    bar.append(boardSwitch)

    const main = el('div', 'kanban-main')
    const board = el('div', 'dya-lanes kanban-board')
    board.setAttribute('role', 'application')
    board.setAttribute('aria-label', 'Board')

    /*
     * Which agent a card goes to is the one thing on a card that tells two cards in the same
     * column apart before their titles are read, and it was the quietest ink on the card. Each
     * harness keeps one hue for as long as the list of harnesses does not change.
     */
    const harnessHues = ctx.hues(HARNESS_IDS)

    const drawer = el('aside', 'dya-sheet dya-sheet--side dya-pane kanban-drawer')
    drawer.hidden = true

    const scrim = el('div', 'dya-scrim')
    scrim.hidden = true

    const stage = el('div', 'dya-well kanban-stage')
    const stageView = el('div', 'kanban-stage-body')

    /*
     * The inspector takes half the panel by default and the whole of it on request; the
     * choice is remembered per panel. Full hides the board rather than squeezing it: a card
     * that needs the room gets all of it, and the board is one key away.
     */
    const sizeStore = `${pinKey}:inspector`
    let inspector: 'half' | 'full' = read(sizeStore) === 'full' ? 'full' : 'half'
    const applySize = (): void => {
        drawer.dataset.size = inspector
        /*
         * Half is a detail beside the board, and the board stays live because picking the next
         * card out of it is the whole point of the arrangement. Full covers it, and a board that
         * is covered but still takes a click and still holds its place in the tab order is a
         * region the reader cannot see and can still reach. Covered means out of play.
         */
        const covering = !drawer.hidden && inspector === 'full'
        scrim.hidden = !covering
        board.inert = covering
    }

    const marks = el('div', 'dya-bar kanban-marks')
    marks.hidden = true

    const setup = el('div', 'kanban-setup')
    setup.hidden = true

    const watch = el('div', 'kanban-watch')
    watch.hidden = true

    const foot = el('div', 'kanban-foot')
    foot.hidden = true
    const notice = el('span', 'dya-meta')
    notice.setAttribute('aria-live', 'polite')
    const error = el('span', 'dya-problem')
    foot.append(notice, error)

    const sheetScrim = el('div', 'dya-scrim')
    sheetScrim.hidden = true
    let sheet: HTMLElement | null = null

    main.append(board, scrim, drawer)
    handle.toolbar.append(bar)
    root.append(marks, main, setup, watch, foot, sheetScrim, tipHolder)
    container.appendChild(root)

    /*
     * What a person asked for and could not have, said at the foot of the board for a few seconds.
     * What succeeded says nothing: the card moved, the note is in the thread, and a sentence
     * repeating it is noise.
     */
    let noticeTimer = 0
    let passing: string | null = null
    const say = (text: string): void => {
        passing = text
        paintProblems()
        window.clearTimeout(noticeTimer)
        noticeTimer = window.setTimeout(() => {
            passing = null
            paintProblems()
        }, 6000)
    }

    /*
     * Which of the three regions is on screen, decided in one place.
     *
     * It was five places setting three `hidden` flags between them, and they disagreed. Opening
     * the new-board form or the board settings from the dispatcher left the dispatcher mounted
     * underneath, so the window showed a form stacked on a live list of every board. The same gap
     * left the bar advertising a board `meta` no longer pointed at, with the worktree key still
     * live and still asking about `meta?.slug` — which is where `no board 'undefined'` came from.
     *
     * Everything that depends on the view is decided here: what is mounted, what the bar says it
     * is looking at, and which keys make sense to press.
     */
    type View = 'board' | 'watch' | 'form'

    const stopWatching = (): void => {
        watching = false
        overview = null
        watch.replaceChildren()
        if (watchTimer) {
            window.clearTimeout(watchTimer)
            watchTimer = 0
        }
    }

    let returnFocus: HTMLElement | null = null

    const closeSheet = (refocus = true): void => {
        if (!sheet) return
        sheet.remove()
        sheet = null
        sheetScrim.hidden = true
        main.inert = false
        marks.inert = false
        if (refocus) (returnFocus?.isConnected ? returnFocus : boardButton).focus()
        returnFocus = null
    }

    const openSheet = (content: HTMLElement): void => {
        closeSheet(false)
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        sheet = content
        sheetScrim.hidden = false
        main.inert = true
        marks.inert = true
        root.append(content)
        ;(content.querySelector<HTMLElement>('input') ?? content.querySelector<HTMLElement>('button'))?.focus()
    }

    const show = (next: View): void => {
        if (next !== 'watch' && watching) stopWatching()
        main.hidden = next !== 'board'
        watch.hidden = next !== 'watch'
        setup.hidden = next !== 'form'
        marks.hidden = next !== 'board' || marked.size === 0

        const onBoard = meta !== null && next === 'board'
        if (!onBoard) closeSheet(false)
        if (onBoard) bar.append(newCardKey)
        else newCardKey.remove()
        boardLabel.textContent = onBoard && meta ? meta.name : next === 'watch' ? 'All boards' : 'Boards'
    }

    const problems = new Map<string, string>()
    const diagnosed = new Set<string>()
    let diagnostics: Diagnostic[] = []
    let boardProblem: string | null = null

    const reason = (thrown: unknown): string =>
        thrown instanceof Error ? thrown.message : String(thrown)

    /*
     * One line at the foot of the board: what was just refused, in the muted ink, and what failed,
     * in red. A failure that belongs to one card is also on that card and at the head of its
     * drawer.
     */
    const paintProblems = (): void => {
        let failed = boardProblem ?? ''
        if (!failed && problems.size === 1) {
            const [id, problem] = [...problems][0]
            failed = `${cardById(id)?.title ?? 'A card'}: ${problem}`
        } else if (!failed && problems.size) {
            failed = `${problems.size} cards have a problem`
        }
        notice.textContent = passing ?? ''
        notice.hidden = !passing
        error.textContent = failed
        error.hidden = !failed
        foot.hidden = !passing && !failed
    }

    const fail = (thrown: unknown): void => {
        boardProblem = reason(thrown)
        paintProblems()
    }

    const failOn = (id: string | undefined, thrown: unknown): void => {
        if (!id) {
            fail(thrown)
            return
        }
        const problem = reason(thrown)
        problems.set(id, problem)
        const card = cardById(id)
        if (card) paintCard(card)
        if (selected === id) {
            drawnRev = -1
            paintDrawer()
        }
        paintProblems()
    }

    const solved = (id: string): void => {
        if (!problems.delete(id)) return
        const card = cardById(id)
        if (card) paintCard(card)
        paintProblems()
    }

    const clearError = (): void => {
        boardProblem = null
        paintProblems()
    }

    const cardById = (id: string): Card | undefined => cards.find((card) => card.id === id)

    const shown = (card: Card): Status => optimistic.get(card.id) ?? card.status

    const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> =>
        (await ctx.invoke(channel, ...args)) as T

    const buildColumn = (status: Status, label: string): Column => {
        const shell = el('section', 'dya-lane kanban-column')
        shell.dataset.status = status
        shell.setAttribute('role', 'group')
        shell.setAttribute('aria-label', label)

        const head = el('div', 'kanban-column-head')
        const title = el('span', 'dya-eyebrow kanban-column-title', label)
        const count = el('span', 'dya-meta kanban-count')
        head.append(title, count)

        const scroller = el('div', 'kanban-scroll')
        const list = el('div', 'kanban-list')
        list.setAttribute('role', 'list')
        const indicator = el('div', 'dya-drop-line kanban-indicator')
        indicator.hidden = true
        /*
         * An empty column says nothing. It used to say "nothing here", and a board at rest has six
         * or seven empty columns, so the sentence appeared seven times across the widest part of
         * the screen and was the loudest thing on a board whose actual content was one card. The
         * count in the header already says the column is empty. What is left is a drop target,
         * which needs a box and no words.
         */
        const empty = el('div', 'dya-drop-box kanban-drop')

        const keys = el('div', 'dya-toolbar kanban-column-keys')

        /*
         * A card is made where it lands: the triage lane carries its own add key, and the key in
         * the tab row and the palette command both open the same draft at the head of this lane,
         * scrolled into view, so the action and its effect are never a board apart.
         */
        if (status === 'triage') {
            const draft = el('div', 'dya-join kanban-new')
            draft.hidden = true
            const field = el('input', 'dya-field dya-field--prose')
            field.type = 'text'
            field.placeholder = 'Title'
            field.setAttribute('aria-label', 'New card')
            const confirm = key('check', 'Add')
            confirm.addEventListener('mousedown', (event) => event.preventDefault())
            draft.append(field, confirm)
            let kept = ''
            const dismiss = (): void => {
                field.value = ''
                draft.hidden = true
            }
            const park = (): void => {
                kept = field.value
                draft.hidden = true
            }
            const open = (value?: string): void => {
                draft.hidden = false
                field.value = value ?? kept
                kept = ''
                field.focus()
            }
            /*
             * Enter, the add key and leaving the field all mean the same thing: a title that was
             * typed is a card. The draft is emptied before the card is asked for, so the blur that
             * follows Enter or a press of the key finds nothing left to add, and a refusal puts
             * the title back rather than losing it.
             */
            const commit = (): void => {
                if (draft.hidden) return
                const title = field.value.trim()
                dismiss()
                if (!title) return
                void add(title).then((added) => {
                    if (!added) open(title)
                })
            }
            openDraft = () => {
                if (shell.dataset.collapsed === 'true') fold.click()
                open()
                scroller.scrollTop = 0
                shell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }
            field.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') park()
                if (event.key === 'Enter') commit()
            })
            field.addEventListener('blur', commit)
            confirm.addEventListener('click', commit)
            scroller.appendChild(draft)
            const addKey = key('add', 'New card')
            addKey.addEventListener('click', () => openDraft?.())
            keys.appendChild(addKey)
        }

        const fold = el('button', 'dya-key kanban-fold')
        fold.type = 'button'
        const apply = (closed: boolean): void => {
            shell.dataset.collapsed = String(closed)
            fold.innerHTML = glyph(closed ? 'unfold' : 'fold')
            fold.setAttribute('aria-label', closed ? `show ${label}` : `fold ${label}`)
            withTip(fold, closed ? 'Show' : 'Fold')
            fold.setAttribute('aria-expanded', String(!closed))
        }
        apply(folded(status))
        fold.addEventListener('click', () => {
            const next = shell.dataset.collapsed !== 'true'
            write(foldKey(status), String(next))
            apply(next)
        })
        keys.prepend(fold)
        head.appendChild(keys)

        scroller.append(list, empty, indicator)
        shell.append(head, scroller)
        board.appendChild(shell)

        return { status, root: shell, scroller, list, indicator, count, empty }
    }

    const buildCard = (card: Card): CardNode => {
        const shell = el('article', 'dya-card dya-card--lift dya-stack kanban-card')
        shell.dataset.card = card.id
        shell.setAttribute('role', 'listitem')
        shell.tabIndex = -1

        const title = el('div', 'dya-name')
        const who = el('div', 'dya-meta dya-meta--sm dya-meta--wrap kanban-card-who')
        const marks = el('div', 'dya-pills')
        const foot = el('div', 'kanban-card-foot')
        const dot = el('span', 'dya-light')
        const note = el('span', 'dya-meta dya-meta--sm kanban-card-note')
        foot.append(dot, note)
        shell.append(title, who, marks, foot)

        shell.addEventListener('focus', () => {
            focused = card.id
        })
        shell.addEventListener('click', (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault()
                toggleMark(card.id)
                return
            }
            if (event.shiftKey) {
                event.preventDefault()
                markThrough(card.id)
                return
            }
            if (marked.size) clearMarks()
            select(card.id)
        })
        shell.addEventListener('dblclick', () => select(card.id))

        return { root: shell, title, who, marks, foot, dot, note }
    }

    const paintCard = (card: Card): CardNode => {
        let node = nodes.get(card.id)
        if (!node) {
            node = buildCard(card)
            nodes.set(card.id, node)
        }

        const status = shown(card)
        const tone = rules?.tone[status] ?? 'idle'
        const blocked =
            status === 'ready' &&
            card.parents.some((id) => {
                const parent = cards.find((entry) => entry.id === id)
                return parent !== undefined && parent.status !== 'done' && parent.status !== 'archived'
            })
        const live = status === 'running' ? progress.get(card.id) : undefined

        /*
         * What is unusual about this card, each thing its own badge.
         *
         * These were one grey string joined by a middle dot: `p2 · 1 note · 42m`. Three problems
         * in eight words — `p2` was a code nobody outside this file could read, the middle dot at
         * ten pixels of grey is a glyph a reader cannot identify, and with the dot gone the words
         * run together, because `priority 2 1 note` is four numbers and two nouns in a row. A
         * badge has an edge, so nothing needs a character to say where one fact stops.
         *
         * The row exists when something is in it. A card with nothing unusual carries a title,
         * who will run it, and how long it has waited.
         */
        const marks: string[] = []
        const bits: string[] = []

        if (live) {
            marks.push(live.waiting ? 'waiting on you' : (live.tool ?? live.state))
            if (live.outputTokens) marks.push(`${tokens(live.inputTokens + live.outputTokens)} tok`)
            bits.push(ago(live.startedAt, clock))
        } else {
            if (card.priority) marks.push(`priority ${card.priority}`)
            if (status === 'blocked' && card.blockKind) marks.push(blockWord(card.blockKind))
            if (blocked) {
                const open = card.parents.length
                marks.push(`${open} ${open === 1 ? 'dependency' : 'dependencies'}`)
            }
            if (card.comments.length) {
                marks.push(`${card.comments.length} ${card.comments.length === 1 ? 'note' : 'notes'}`)
            }
            if (status === 'scheduled' && card.scheduledFor) bits.push(when(card.scheduledFor))
            const waited = since(card.updatedAt, clock)
            if (waited) bits.push(`${waited} ago`)
        }

        /*
         * Who this card goes to. It is the money question and the board answered none of it: a
         * card bound for an agent showed a title and a grey note, and which harness and which
         * model were two panels away, behind the board's settings and the card's own override.
         * They resolve exactly as the dispatcher resolves them, card over board over default.
         */
        const dispatching = meta !== null && DISPATCHING.has(status)
        node.who.hidden = !dispatching
        if (dispatching && meta) {
            const runner = resolveRunner(meta.runners, card.runners, status === 'review' ? 'review' : 'implement')
            const harness = el('span', 'dya-legend')
            const hue = `dya-hue--${harnessHues[runner.harness]}`
            const mark = brandIcon(runner.harness)
            const glyph = el('span', mark ? 'dya-glyph dya-glyph--mark' : `dya-dot ${hue}`)
            if (mark) glyph.innerHTML = mark
            const model = runner.model ? apiName(runner.harness, runner.model) : null
            harness.append(glyph, el('span', model ? 'dya-meta--lift' : '', model ?? runner.harness))
            node.who.replaceChildren(harness)
        }

        node.title.textContent = card.title
        node.dot.className = light(tone)
        /*
         * The dot is the state's colour and it has nothing to colour on its own. A card with
         * nothing to report was rendering it alone on an empty line, which reads as a card that
         * failed to draw rather than a card with nothing to say. The line exists when there is a
         * line.
         */
        node.foot.hidden = bits.length === 0
        node.marks.hidden = marks.length === 0
        node.marks.replaceChildren(
            ...marks.map((mark) => el('span', 'dya-tag', mark))
        )
        node.note.replaceChildren(...bits.map((bit) => el('span', undefined, bit)))
        node.root.dataset.status = status
        node.root.dataset.locked = String(card.locked)
        node.root.classList.toggle('dya-card--selected', selected === card.id)
        node.root.classList.toggle('dya-card--marked', marked.has(card.id))
        node.root.classList.toggle('dya-card--danger', problems.has(card.id))
        node.root.classList.toggle('dya-card--warning', live?.waiting === true || (diagnosed.has(card.id) && !problems.has(card.id)))
        node.root.dataset.rev = String(card.rev)
        node.root.setAttribute('aria-label', `${card.title}, ${status}`)
        return node
    }

    const reconcile = (): void => {
        if (!rules) return

        const wanted = new Set(cards.map((card) => card.id))
        for (const [id, node] of nodes) {
            if (wanted.has(id)) continue
            node.root.remove()
            nodes.delete(id)
            if (selected === id) selected = null
            if (focused === id) focused = null
        }

        for (const status of rules.order) {
            const column = columns.get(status)
            if (!column) continue

            const wantedHere = order(cards.filter((card) => shown(card) === status))
            let cursor = column.list.firstElementChild

            for (const card of wantedHere) {
                const node = paintCard(card)
                if (cursor === node.root) {
                    cursor = cursor.nextElementSibling
                    continue
                }
                column.list.insertBefore(node.root, cursor)
            }

            while (cursor) {
                const next = cursor.nextElementSibling
                if (!wantedHere.some((card) => nodes.get(card.id)?.root === cursor)) cursor.remove()
                cursor = next
            }

            column.count.textContent = wantedHere.length > 0 ? String(wantedHere.length) : ''
            column.empty.hidden = wantedHere.length > 0
            column.root.dataset.empty = String(wantedHere.length === 0)
        }

        for (const [id, node] of nodes) {
            node.root.tabIndex = id === focused ? 0 : -1
        }
        if (focused === null) {
            const first = nodes.values().next().value as CardNode | undefined
            if (first) first.root.tabIndex = 0
        }

        paintMarks()
        paintDrawer()
    }

    const refresh = async (): Promise<void> => {
        if (disposed) return
        const slug = read(pinKey)
        registry = await invoke<BoardMeta[]>('boards')

        if (!slug || !registry.some((entry) => entry.slug === slug && !entry.archived)) {
            meta = null
            cards = []
            nodes.clear()
            board.replaceChildren()
            columns.clear()
            renderAbsence(slug)
            return
        }

        const payload = await invoke<BoardPayload>('board', slug)
        meta = payload.board
        cards = payload.cards
        rules = payload.rules
        clock = payload.now

        if (!columns.size) {
            board.replaceChildren()
            for (const status of rules.order) {
                columns.set(status, buildColumn(status, rules.labels[status]))
            }
            /*
             * A folded stage turns its name on its side, so the name's length becomes the header's
             * height and every folded column put its count and its fold key at a different height.
             * One measure for all of them: the longest name on this board, in characters, which
             * the mono face and the label tracking turn into an exact height in CSS.
             */
            const names = rules.labels
            const longest = Math.max(...rules.order.map((status) => names[status].length))
            board.style.setProperty('--kanban-stage-chars', String(longest))
        }

        for (const id of [...problems.keys()]) {
            if (!cards.some((card) => card.id === id)) problems.delete(id)
        }
        for (const id of [...marked]) {
            if (!cards.some((card) => card.id === id)) marked.delete(id)
        }
        clearError()

        bar.hidden = false
        show(watching ? 'watch' : 'board')
        reconcile()
        void health().catch(() => undefined)
    }

    const renderAbsence = (missing: string | null): void => {
        if (marked.size) clearMarks()
        meta = null
        bar.hidden = registry.length === 0
        setup.dataset.mode = 'welcome'
        show('form')
        setup.replaceChildren()

        const open = registry.filter((entry) => !entry.archived)
        if (missing && !open.some((entry) => entry.slug === missing)) {
            const gone = el('div', 'dya-empty')
            gone.append(
                el('span', 'dya-title', `${missing} is gone`)
            )
            const actions = el('div', 'dya-empty__actions')
            const pick = el('button', 'dya-button dya-button--primary', 'Choose another')
            pick.type = 'button'
            pick.addEventListener('click', () => openBoardMenu(pick))
            actions.append(pick)
            gone.appendChild(actions)
            setup.appendChild(gone)
            return
        }

        /*
         * A machine that already holds boards is not asked to make another one. It was: with three
         * boards on disk and none of them pinned, the first screen offered an empty create form
         * and the way back to real work was a control in the bar. The boards are the answer to
         * "what now", so they are what the screen shows.
         */
        if (open.length > 0) setup.dataset.mode = 'gallery'
        setup.appendChild(open.length > 0 ? buildBoardChooser(open) : buildBoardForm())
    }

    /*
     * One labelled row of a form. The explanation, when there is one, is a tip on the label: it is
     * needed once, by somebody who has not met the field before, and a sentence that is always on
     * screen to serve that reader buries the field from everybody else.
     */
    const field = (form: HTMLElement, label: string, control: HTMLElement): void => {
        form.append(el('span', 'dya-label', label), control)
    }

    const buildBoardForm = (): HTMLElement => {
        const shell = el('div', 'dya-card dya-pane kanban-setup-shell kanban-welcome')
        const heading = el('div', 'dya-title', 'New board')

        const form = el('div', 'dya-form')

        const name = el('input', 'dya-field')
        name.type = 'text'

        const dirRow = el('div', 'dya-join')
        const dir = el('input', 'dya-field')
        dir.type = 'text'
        dir.setAttribute('aria-label', 'Folder')
        const browse = key('folder', 'Browse')
        dirRow.append(dir, browse)

        const create = el('button', 'dya-button dya-button--primary', 'Create')
        create.type = 'button'

        browse.addEventListener('click', () => {
            void invoke<string | null>('pickWorkdir')
                .then((picked) => {
                    if (picked) dir.value = picked
                })
                .catch(fail)
        })

        create.addEventListener('click', () => {
            void invoke<BoardMeta>('createBoard', { name: name.value, slug: '', workdir: dir.value })
                .then(async (created) => {
                    write(pinKey, created.slug)
                    await offerIgnore(created)
                    return refresh()
                })
                .catch(fail)
        })

        field(form, 'Name', name)
        field(form, 'Folder', dirRow)
        const actions = el('div', 'dya-form__actions')
        actions.append(create)
        form.append(actions)

        shell.append(heading, form)
        return shell
    }

    const showBoardSettings = (): void => {
        if (!meta) return
        const current = meta
        void invoke<Settings>('settings')
            .then((across) => {
                if (meta?.slug !== current.slug || main.hidden) return
                openSheet(buildBoardSettings(current, across))
            })
            .catch(fail)
    }

    let catalogue: HarnessInfo[] = []
    void invoke<HarnessInfo[]>('harnesses')
        .then((list) => {
            catalogue = list
            if (meta) void refresh()
        })
        .catch(fail)

    /*
     * A model is named by the id its API takes, never by an alias or a marketing name: `sonnet` is
     * whatever claude maps it to today, and `claude-sonnet-5` is what actually runs.
     */
    const apiName = (harness: string, model: string): string =>
        catalogue.find((entry) => entry.id === harness)?.resolved[model] ?? model

    const choose = (
        what: string,
        current: string,
        values: string[],
        labels: Record<string, string | [string, string]>,
        disabled: boolean,
        apply: (value: string) => void,
        tones: Record<string, string> = {}
    ): HTMLElement => {
        const wrap = el('span', 'dya-select kanban-select')
        const select = el('select', 'dya-field')
        select.disabled = disabled
        select.setAttribute('aria-label', what)
        const shown = el('button')
        shown.type = 'button'
        shown.appendChild(document.createElement('selectedcontent'))
        select.appendChild(shown)
        for (const value of values) {
            const entry = labels[value] ?? value
            const [text, note] = typeof entry === 'string' ? [entry, ''] : entry
            const option = el('option')
            option.append(tones[value] ? el('span', tones[value], text) : document.createTextNode(text))
            if (note) option.appendChild(el('span', 'dya-select__note', note))
            option.value = value
            option.selected = value === current
            select.appendChild(option)
            if (value === '' && note) select.appendChild(el('hr'))
        }
        select.addEventListener('change', () => apply(select.value))
        wrap.appendChild(select)
        return wrap
    }

    /*
     * A choice from a list long enough to want searching: a key drawn as a select that opens the
     * menu with its filter field, where every word typed must appear in the entry. A value with a
     * provider in front of it is grouped under that provider and shown without it.
     */
    const pick = (
        what: string,
        current: string,
        values: string[],
        labels: Record<string, string | [string, string]>,
        disabled: boolean,
        apply: (value: string) => void
    ): HTMLElement => {
        const wrap = el('span', 'dya-select kanban-select')
        const key = el('button', 'dya-field')
        key.type = 'button'
        key.disabled = disabled
        key.setAttribute('aria-label', what)
        key.setAttribute('aria-haspopup', 'menu')
        const text = (value: string): [string, string] => {
            const entry = labels[value] ?? value
            return typeof entry === 'string' ? [entry, ''] : entry
        }
        const shown = (value: string): string => {
            const slash = value.indexOf('/')
            const label = text(value)[0]
            return slash > 0 && label === value ? value.slice(slash + 1) : label
        }
        key.append(el('span', 'dya-field__label', shown(current)))
        key.addEventListener('click', () => {
            const rows: MenuRow[] = values.map((value) => {
                const slash = value.indexOf('/')
                const provider = slash > 0 ? value.slice(0, slash) : ''
                const note = text(value)[1]
                return {
                    key: value,
                    label: shown(value),
                    note: note || undefined,
                    group: provider ? (PROVIDERS[provider] ?? provider) : '',
                    direct: true,
                    selected: value === current,
                    leaves: [{ label: shown(value), value }]
                }
            })
            openMenu({
                anchor: key,
                rows,
                search: true,
                onPick: (row) => apply(row.key)
            })
        })
        wrap.appendChild(key)
        return wrap
    }

    /*
     * One row per phase: harness, model, effort. A card inherits from its board what it leaves
     * blank, so a blank is labelled with what it inherits, since what the control says is what
     * will run. The model list is the chosen harness's own, and a model is named by its API id.
     * A name the list does not carry is typed into the field that appears when the last entry is
     * picked.
     */
    const phaseHeads = (): HTMLElement => {
        const heads = el('div', 'dya-form__split')
        heads.append(
            el('span', 'dya-label', 'Harness'),
            el('span', 'dya-label', 'Model'),
            el('span', 'dya-label', 'Effort')
        )
        return heads
    }

    const runnerRow = (
        current: Runner,
        above: Runner | null,
        disabled: boolean,
        apply: (next: Partial<Runner>) => void
    ): HTMLElement => {
        const row = el('div', 'dya-form__split')
        const fallback = catalogue[0]?.id ?? 'claude'
        const nameOf = (id: string): string => catalogue.find((entry) => entry.id === id)?.label ?? id
        const inherits = above !== null
        const INHERIT = 'Board default'
        const harnessLabels: Record<string, string | [string, string]> = {
            '': [INHERIT, nameOf(above?.harness ?? fallback)]
        }
        for (const entry of catalogue) {
            harnessLabels[entry.id] = entry.available ? entry.label : [entry.label, 'not on PATH']
        }
        const chosen = current.harness ?? above?.harness ?? fallback
        const info = catalogue.find((entry) => entry.id === chosen)
        const harnessIds = catalogue.map((entry) => entry.id)

        row.appendChild(
            choose(
                'Harness',
                inherits ? (current.harness ?? '') : chosen,
                inherits ? ['', ...harnessIds] : harnessIds,
                harnessLabels,
                disabled,
                (value) => apply({ harness: (value || null) as Runner['harness'] })
            )
        )

        const models = info?.models ?? []
        const modelName = (model: string): string => apiName(chosen, model)
        const listed = current.model === null || models.includes(current.model)
        const modelLabels: Record<string, string | [string, string]> = {
            '': inherits ? (above?.model ? [INHERIT, modelName(above.model)] : INHERIT) : 'Default',
            [OTHER]: 'Other\u2026'
        }
        for (const model of models) {
            modelLabels[model] = modelName(model)
        }
        const custom = el('input', 'dya-field')
        custom.type = 'text'
        custom.placeholder = 'Model'
        custom.disabled = disabled
        custom.hidden = listed
        custom.value = listed ? '' : (current.model ?? '')
        custom.addEventListener('change', () => apply({ model: custom.value.trim() || null }))
        const modelCell = el('div', 'kanban-model')
        modelCell.appendChild(
            pick('Model', listed ? (current.model ?? '') : OTHER, ['', ...models, OTHER], modelLabels, disabled, (value) => {
                if (value === OTHER) {
                    custom.hidden = false
                    custom.focus()
                    return
                }
                apply({ model: value || null })
            })
        )
        modelCell.appendChild(custom)
        row.appendChild(modelCell)

        if (info?.efforts) {
            const effortLabels: Record<string, string | [string, string]> = {
                '': inherits ? (above?.effort ? [INHERIT, above.effort] : INHERIT) : 'Default'
            }
            row.appendChild(
                choose('Effort', current.effort ?? '', ['', ...info.efforts], effortLabels, disabled, (value) =>
                    apply({ effort: value || null })
                )
            )
        } else {
            row.appendChild(el('span'))
        }
        return row
    }

    const capField = (value: number): HTMLInputElement => {
        const field = el('input', 'dya-field kanban-cap')
        field.type = 'number'
        field.min = '0'
        field.max = '10'
        field.step = '1'
        field.value = String(value)
        return field
    }

    const buildBoardSettings = (current: BoardMeta, across: Settings): HTMLElement => {
        const shell = el('div', 'dya-sheet dya-sheet--modal dya-pane kanban-settings')
        shell.setAttribute('role', 'dialog')
        shell.setAttribute('aria-modal', 'true')
        shell.setAttribute('aria-label', 'Board settings')

        const head = el('div', 'dya-sheet__head')
        const close = key('close', 'Close')
        close.addEventListener('click', () => closeSheet())
        const end = el('div', 'dya-sheet__end')
        end.append(close)
        head.append(el('span', 'dya-title', 'Board settings'), end)

        const form = el('div', 'dya-form')

        const name = el('input', 'dya-field')
        name.type = 'text'
        name.value = current.name

        const dirRow = el('div', 'dya-join')
        const dir = el('input', 'dya-field')
        dir.type = 'text'
        dir.setAttribute('aria-label', 'Folder')
        dir.value = current.workdir
        const browse = key('folder', 'Browse')
        browse.addEventListener('click', () => {
            void invoke<string | null>('pickWorkdir')
                .then((picked) => {
                    if (picked) dir.value = picked
                })
                .catch(fail)
        })
        dirRow.append(dir, browse)

        const capsRow = el('div', 'kanban-row')
        const boardCap = capField(current.maxRunning ?? 1)
        boardCap.setAttribute('aria-label', 'Max running on this board')
        const globalCap = capField(across.maxRunning)
        globalCap.setAttribute('aria-label', 'Max running on all boards')
        capsRow.append(
            boardCap,
            el('span', 'dya-key-label', 'This board'),
            globalCap,
            el('span', 'dya-key-label', 'All boards')
        )

        const draft: Runners = {
            implement: { ...current.runners.implement },
            review: { ...current.runners.review }
        }
        const phaseRow = (kind: keyof Runners): HTMLElement => {
            const row = runnerRow(draft[kind], null, false, (next) => {
                Object.assign(draft[kind], next)
                row.replaceWith(phaseRow(kind))
            })
            return row
        }

        const save = el('button', 'dya-button dya-button--primary', 'Save')
        save.type = 'button'
        save.addEventListener('click', () => {
            void invoke('updateSettings', { maxRunning: Number(globalCap.value) })
                .then(() =>
                    invoke('updateBoard', current.slug, {
                        name: name.value,
                        workdir: dir.value,
                        maxRunning: Number(boardCap.value),
                        runners: draft
                    })
                )
                .then(() => {
                    closeSheet()
                    return refresh()
                })
                .catch(fail)
        })

        const archive = key('archive', 'Archive board', 'Archive')
        archive.addEventListener('click', () => {
            if (!window.confirm(`Archive ${current.name}?`)) return
            void invoke('archiveBoard', current.slug, true)
                .then(() => {
                    closeSheet(false)
                    write(pinKey, '')
                    return refresh()
                })
                .catch(fail)
        })

        const remove = key('delete', 'Delete board', 'Delete')
        remove.classList.add('dya-key--danger')
        remove.addEventListener('click', () => {
            if (!window.confirm(`Delete ${current.name} and its cards? The project folder stays.`)) return
            void invoke('deleteBoard', current.slug)
                .then(() => {
                    closeSheet(false)
                    write(pinKey, '')
                    return refresh()
                })
                .catch(fail)
        })

        field(form, 'Name', name)
        field(form, 'Folder', dirRow)
        field(form, 'Max running', capsRow)
        field(form, 'Runners', phaseHeads())
        field(form, 'Implement', phaseRow('implement'))
        field(form, 'Review', phaseRow('review'))
        const unmake = el('div', 'dya-join')
        unmake.append(archive, remove)
        const actions = el('div', 'dya-form__actions')
        actions.append(save, el('span', 'kanban-spacer'), unmake)
        form.append(actions)

        shell.append(head, form)
        return shell
    }

    const NEW_BOARD = '\u0000new-board'
    const ALL_BOARDS = '\u0000all-boards'
    const openBoardMenu = (anchor: HTMLElement): void => {
        const rows: MenuRow[] = registry
            .filter((entry) => !entry.archived)
            .map((entry) => ({
                key: entry.slug,
                label: entry.name,
                group: '',
                direct: true,
                selected: entry.slug === meta?.slug,
                note: entry.workdir,
                leaves: [{ label: entry.name, value: entry.slug }]
            }))

        if (!rows.length) {
            newBoard()
            return
        }

        rows.push(
            {
                key: ALL_BOARDS,
                label: 'All boards',
                group: '',
                direct: true,
                selected: watching,
                leaves: [{ label: 'All boards', value: ALL_BOARDS }]
            },
            {
                key: NEW_BOARD,
                label: 'New board',
                group: '',
                direct: true,
                leaves: [{ label: 'New board', value: NEW_BOARD }]
            }
        )

        openMenu({
            anchor,
            rows,
            onPick: (row) => {
                if (row.key === NEW_BOARD) {
                    newBoard()
                    return
                }
                if (row.key === ALL_BOARDS) {
                    if (!watching) openWatch()
                    return
                }
                write(pinKey, row.key)
                if (watching) closeWatch()
                void refresh().catch(fail)
            }
        })
    }

    /*
     * A board as the thing it is: its name, whether it is running or paused, what waits in it and
     * where it works. The chooser and the watch build the same card, so a board reads the same in
     * both places.
     */
    const boardTile = (name: string, slug: string, shape?: WatchBoard): HTMLElement => {
        const card = el('button', 'dya-tile dya-tile--dense')
        card.type = 'button'
        card.addEventListener('click', () => {
            write(pinKey, slug)
            closeWatch()
            void refresh().catch(fail)
        })

        const top = el('div', 'dya-tile__head')
        top.append(el('span', 'dya-tile__name', name))
        if (shape?.cap === 0) {
            top.append(el('span', 'dya-badge dya-badge--warning', 'Paused'))
        } else if (shape && shape.running > 0) {
            top.append(el('span', 'dya-badge dya-badge--busy', `${shape.running} running`))
        }
        card.append(top)

        if (shape) {
            const pills = el('div', 'dya-pills')
            const tallies: [number, string, string][] = [
                [shape.counts.ready, 'ready', 'dya-tag'],
                [shape.counts.review, 'in review', 'dya-tag'],
                [shape.counts.blocked, 'blocked', 'dya-badge dya-badge--warning'],
                [shape.counts.triage + shape.counts.scheduled, 'waiting', 'dya-tag'],
                [shape.counts.done, 'done', 'dya-tag']
            ]
            for (const [n, word, tone] of tallies) {
                if (n > 0) pills.append(el('span', tone, `${n} ${word}`))
            }
            if (pills.childElementCount) card.append(pills)
        }
        return card
    }

    /*
     * The boards on this machine, as a gallery from the top left, with the way to make another as
     * its first card. It was a title, one tile and a button in the middle of the panel: an island
     * that left the rest of the pane black and put the action under the thing it adds to.
     */
    const buildBoardChooser = (open: BoardMeta[]): HTMLElement => {
        const grid = el('div', 'dya-grid kanban-gallery')
        const make = el('button', 'dya-tile dya-tile--new')
        make.type = 'button'
        const icon = el('span', 'dya-tile__icon')
        icon.innerHTML = glyph('add')
        make.append(icon, el('span', 'dya-tile__name', 'New board'))
        make.addEventListener('click', () => newBoard())
        grid.append(make)

        const place = (shapes: Map<string, WatchBoard>): void => {
            grid.replaceChildren(
                make,
                ...open.map((entry) => boardTile(entry.name, entry.slug, shapes.get(entry.slug)))
            )
        }
        place(new Map())
        void invoke<Overview>('overview')
            .then((shape) => place(new Map(shape.boards.map((board) => [board.slug, board]))))
            .catch(() => undefined)
        return grid
    }

    const newBoard = (): void => {
        setup.dataset.mode = 'welcome'
        show('form')
        setup.replaceChildren(buildBoardForm())
    }

    const worktreeNote = (tree: Worktree): string => {
        if (tree.live) return 'busy'
        if (tree.dirty) return 'uncommitted'
        if (tree.landed) return 'merged'
        return `${tree.ahead} unmerged`
    }

    const openWorktreeMenu = (anchor: HTMLElement): void => {
        void invoke<Worktree[]>('worktrees', meta?.slug)
            .then((trees) => {
                if (!trees.length) {
                    say('No worktrees')
                    return
                }

                openMenu({
                    anchor,
                    rows: trees.map((tree) => ({
                        key: tree.path,
                        label: tree.branch ?? tree.path,
                        group: worktreeNote(tree),
                        direct: true,
                        note: tree.path,
                        leaves: [{ label: tree.branch ?? tree.path, value: tree.path }]
                    })),
                    onPick: (row) => {
                        const tree = trees.find((entry) => entry.path === row.key)
                        if (!tree) return
                        const name = tree.branch ?? tree.path
                        if (tree.live || tree.dirty || !tree.landed) {
                            say(`${name}: ${worktreeNote(tree)}`)
                            return
                        }
                        if (!window.confirm(`Remove worktree ${name}?`)) {
                            return
                        }
                        void invoke('removeWorktree', meta?.slug, tree.path)
                            .then(() => refresh())
                            .catch(fail)
                    }
                })
            })
            .catch(fail)
    }

    const offerIgnore = async (created: BoardMeta): Promise<void> => {
        const state = await invoke<IgnoreState>('ignoreState', created.slug).catch(() => null)
        if (!state?.tracked || state.ignored) return

        const asked = window.confirm(
            `Hide .claude/worktrees from git status in ${created.workdir}?`
        )
        if (!asked) return
        await invoke('addIgnore', created.slug).catch(fail)
    }

    const markable = (): Card[] => cards.filter((card) => marked.has(card.id))

    function paintMarks(): void {
        for (const [id, node] of nodes) node.root.classList.toggle('dya-card--marked', marked.has(id))

        const chosen = markable()
        marks.hidden = chosen.length === 0
        marks.replaceChildren()
        if (!chosen.length) return

        const table = rules
        const targets = table
            ? table.order.filter((status) =>
                  chosen.every((card) => table.allow[shown(card)].includes(status))
              )
            : []

        const count = el('span', 'dya-meta', `${chosen.length} selected`)
        const moveAll = key('move', `Move ${chosen.length} cards`, 'Move')
        moveAll.hidden = targets.length === 0
        moveAll.addEventListener('click', () => {
            if (!table) return
            openMenu({
                anchor: moveAll,
                rows: targets.map((status) => ({
                    key: status,
                    label: table.labels[status],
                    group: '',
                    direct: true,
                    leaves: [{ label: table.labels[status], value: status }]
                })),
                onPick: (row) => bulkMove(row.key as Status)
            })
        })

        const removeAll = key('delete', `Delete ${chosen.length} cards`, 'Delete')
        removeAll.classList.add('dya-key--danger')
        removeAll.addEventListener('click', () => bulkDelete())

        const clear = key('close', 'Clear')
        clear.addEventListener('click', () => clearMarks())

        const strip = el('div', 'dya-join')
        strip.append(...[moveAll, removeAll, clear].filter((entry) => !entry.hidden))
        marks.append(count, el('span', 'kanban-spacer'), strip)
    }

    function clearMarks(): void {
        marked.clear()
        lastMark = null
        paintMarks()
    }

    function toggleMark(id: string): void {
        if (marked.has(id)) marked.delete(id)
        else {
            marked.add(id)
            lastMark = id
        }
        paintMarks()
    }

    function markThrough(id: string): void {
        const card = cardById(id)
        const from = lastMark ? cardById(lastMark) : null
        if (!card || !from || shown(from) !== shown(card)) {
            toggleMark(id)
            return
        }

        const here = columnCards(shown(card))
        const a = here.findIndex((entry) => entry.id === from.id)
        const b = here.findIndex((entry) => entry.id === card.id)
        if (a < 0 || b < 0) {
            toggleMark(id)
            return
        }
        for (const entry of here.slice(Math.min(a, b), Math.max(a, b) + 1)) marked.add(entry.id)
        lastMark = id
        paintMarks()
    }

    const told = (verb: string, result: { done: string[]; refused: { id: string; why: string }[] }): void => {
        const first = result.refused[0]
        const name = first ? (cardById(first.id)?.title ?? 'a card') : ''
        if (!result.refused.length) return
        if (!result.done.length) {
            say(`Nothing ${verb}. ${name}: ${first.why}`)
            return
        }
        say(`${result.done.length} ${verb}, ${result.refused.length} refused. ${name}: ${first.why}`)
    }

    function bulkMove(to: Status): void {
        const wanted = markable().map((card) => ({ id: card.id, rev: card.rev }))
        if (!wanted.length) return
        void invoke<{ done: string[]; refused: { id: string; why: string }[] }>(
            'moveCards',
            meta?.slug,
            wanted,
            to
        )
            .then((result) => {
                for (const id of result.done) marked.delete(id)
                told(`moved to ${to}`, result)
                return refresh()
            })
            .catch((thrown: unknown) => fail(thrown))
    }

    function bulkDelete(): void {
        const chosen = markable()
        if (!chosen.length) return
        if (!window.confirm(`Delete ${chosen.length} cards?`)) return

        void invoke<{ done: string[]; refused: { id: string; why: string }[] }>(
            'deleteCards',
            meta?.slug,
            chosen.map((card) => card.id)
        )
            .then((result) => {
                for (const id of result.done) {
                    marked.delete(id)
                    problems.delete(id)
                    if (selected === id) select(null)
                }
                told('deleted', result)
                return refresh()
            })
            .catch((thrown: unknown) => fail(thrown))
    }

    const openMoveMenu = (id: string, anchor: HTMLElement): void => {
        const card = cardById(id)
        const table = rules
        if (!card || !table) return

        const targets = table.allow[shown(card)]
        if (!targets.length) return

        openMenu({
            anchor,
            rows: targets.map((status) => ({
                key: status,
                label: table.labels[status],
                group: '',
                direct: true,
                leaves: [{ label: table.labels[status], value: status }]
            })),
            onPick: (row) => move(id, row.key as Status)
        })
    }

    const settle = (id: string): void => {
        pending.delete(id)
        const node = nodes.get(id)
        if (node) {
            delete node.root.dataset.pending
            node.root.classList.remove('dya-card--pending')
        }
    }

    const move = (id: string, to: Status): void => {
        const card = cardById(id)
        if (!card || !rules) return
        if (pending.has(id)) return

        const from = shown(card)
        if (from === to) return

        const prompt = rules.confirm[`${from}>${to}`]
        if (prompt && !window.confirm(prompt)) return

        const node = nodes.get(id)
        if (node) {
            node.root.dataset.pending = 'true'
            node.root.classList.add('dya-card--pending')
        }
        pending.add(id)

        if (!prompt) {
            optimistic.set(id, to)
            reconcile()
        }

        void invoke<Card>('moveCard', meta?.slug, id, card.rev, to)
            .then(() => {
                settle(id)
                optimistic.delete(id)
                solved(id)
                return refresh()
            })
            .catch((thrown: unknown) => {
                settle(id)
                optimistic.delete(id)
                reconcile()
                failOn(id, thrown)
            })
    }

    const select = (id: string | null): void => {
        selected = id
        for (const [key, node] of nodes) node.root.classList.toggle('dya-card--selected', key === id)
        paintDrawer()
    }

    const closeTerminal = (): void => {
        terminal?.dispose()
        terminal = null
        terminalFor = ''
        stageView.replaceChildren()
    }

    const stepRow = (
        at: number,
        verb: string,
        subject: string,
        tone: string | null,
        detail: [string, string][] = [],
        code = false
    ): HTMLElement => {
        const node = el('li', `dya-step${tone ? ` dya-step--${tone}` : ''}`)
        node.append(el('span', 'dya-step__time', clock24(at)), el('span', 'dya-step__verb', verb))
        const subjectClass = code ? 'dya-step__subject dya-step__subject--code' : 'dya-step__subject'
        const shown = detail.filter(([, text]) => text.trim())
        if (!shown.length) {
            node.append(el('span', subjectClass, subject))
            return node
        }
        const open = el('button', subjectClass, subject)
        open.type = 'button'
        open.setAttribute('aria-expanded', 'false')
        const more = el('div', 'dya-step__detail')
        more.hidden = true
        for (const [name, text] of shown) more.append(el('span', 'dya-label', name), el('pre', 'dya-entry__body', text))
        open.addEventListener('click', () => {
            more.hidden = !more.hidden
            open.setAttribute('aria-expanded', String(!more.hidden))
        })
        node.append(open, more)
        return node
    }

    const said = (at: number, text: string): HTMLElement => {
        const node = el('li', 'dya-step dya-step--said')
        node.append(el('span', 'dya-step__time', clock24(at)), el('div', 'dya-step__said', text.trim()))
        return node
    }

    /*
     * A file a run named, as a row of the files list: the glyph and the path as the worker wrote
     * it, one line, cut with an ellipsis. It opens in whatever panel reads it, or is shown in its
     * folder when nothing does.
     */
    const fileRow = (name: string, open: () => void, note?: string): HTMLButtonElement => {
        const row = el('button', 'dya-file')
        row.type = 'button'
        row.innerHTML = glyph('file')
        row.append(el('span', 'dya-file__name', name))
        if (note) row.append(el('span', 'dya-meta', note))
        row.addEventListener('click', open)
        return row
    }

    const artifactFile = (card: Card, artifact: string): HTMLButtonElement => {
        const base = (card.workdir ?? meta?.workdir ?? '').replace(/[\\/]+$/, '')
        const path = /^([a-zA-Z]:[\\/]|\/)/.test(artifact) || !base ? artifact : `${base}/${artifact}`
        return fileRow(artifact, () => {
            void (async () => {
                if (!(ctx.shell.canOpen(path) && (await ctx.shell.open({ path })))) await ctx.shell.reveal(path)
            })()
        })
    }

    const fileList = (rows: HTMLElement[]): HTMLElement => {
        const list = el('div', 'dya-files')
        list.append(...rows)
        return list
    }

    /*
     * The block a worker closes its run with. The marker is how the board finds it in everything
     * the agent wrote, so it is protocol, not something to read: what it says is shown instead,
     * the outcome as a pill, the summary as prose, each file as a row that opens, and the JSON
     * itself, indented and coloured, one press away.
     */
    const closing = (at: number, text: string, card: Card): HTMLElement[] => {
        const cut = text.lastIndexOf(MARKER)
        const block = parseTerminal(text)
        if (cut < 0 || !block) return [said(at, text)]
        const nodes: HTMLElement[] = []
        const before = text.slice(0, cut).trim()
        if (before) nodes.push(said(at, before))

        const node = el('li', 'dya-step dya-step--said')
        const body = el('div', 'dya-step__said dya-stack kanban-outcome')
        const head = el('div', 'dya-pills')
        head.append(
            el(
                'span',
                `dya-badge ${block.outcome === 'blocked' ? 'dya-badge--danger' : 'dya-badge--success'}`,
                block.outcome === 'blocked' && block.blockKind ? `Blocked - ${blockWord(block.blockKind)}` : block.outcome === 'blocked' ? 'Blocked' : 'Completed'
            )
        )
        if (block.verdict) head.append(el('span', 'dya-tag', block.verdict === 'approved' ? 'Approved' : 'Changes'))
        body.append(head)
        if (block.summary) body.append(el('p', 'dya-text', block.summary))

        const files = [...block.artifacts, ...block.handoff.filter((entry) => !block.artifacts.includes(entry))]
        if (files.length) body.append(fileList(files.map((artifact) => artifactFile(card, artifact))))
        if (block.followups.length) {
            const list = el('ul', 'kanban-outcome-list')
            for (const item of block.followups) list.append(el('li', 'dya-text', item.title))
            body.append(el('span', 'dya-label', 'Follow-ups'), list)
        }

        const raw = text.slice(cut + MARKER.length)
        const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
        let pretty = json
        try {
            pretty = JSON.stringify(JSON.parse(json), null, 2)
        } catch {
            pretty = json
        }
        const more = el('details', 'kanban-more')
        const summary = el('summary', 'dya-label', 'JSON')
        const code = el('pre', 'dya-code')
        code.innerHTML = highlight(pretty, 'json')
        more.append(summary, code)
        body.append(more)

        node.append(el('span', 'dya-step__time', clock24(at)), body)
        nodes.push(node)
        return nodes
    }

    /*
     * What the agent did in one run, told as steps. A result belongs to the call it answers, so it
     * is folded into that step and read by opening it; a failed call turns its verb red. What the
     * agent said between calls is prose.
     */
    const paintSteps = (card: Card, run: Run, into: HTMLElement): void => {
        const list = el('ol', 'dya-steps kanban-steps')
        into.replaceChildren(list)
        const asked = terminalFor

        void invoke<HistoryRow[]>('runEvents', meta?.slug, card.id, run.runId)
            .then((rows) => {
                if (disposed || terminalFor !== asked) return
                const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 8
                let last: { row: HistoryRow; node: HTMLElement } | null = null
                for (const row of rows) {
                    if (row.kind === 'result' && last && last.row.kind === 'tool' && last.row.output === undefined) {
                        const merged: HistoryRow = { ...last.row, output: row.body, error: row.error }
                        const node = stepRow(merged.at, verbOf(merged.label), merged.body, merged.error ? 'error' : null, [
                            ['Input', merged.detail ?? ''],
                            ['Output', merged.output ?? '']
                        ], true)
                        last.node.replaceWith(node)
                        last = { row: merged, node }
                        continue
                    }
                    let node: HTMLElement
                    if (row.kind === 'text') {
                        const parts = closing(row.at, row.body, card)
                        for (const part of parts.slice(0, -1)) list.appendChild(part)
                        node = parts[parts.length - 1]
                    } else if (row.kind === 'thinking') node = stepRow(row.at, 'thought', row.body.split('\n')[0], 'quiet', [['Thinking', row.body]])
                    else if (row.kind === 'end') node = stepRow(row.at, row.error ? 'stopped' : 'turn ended', row.body, row.error ? 'error' : 'quiet')
                    else if (row.kind === 'result') node = stepRow(row.at, row.error ? 'failed' : 'got', row.body.split('\n')[0], row.error ? 'error' : 'quiet', [['Output', row.body]], true)
                    else {
                        node = stepRow(row.at, verbOf(row.label), row.body, row.error ? 'error' : null, [
                            ['Input', row.detail ?? ''],
                            ['Output', row.output ?? '']
                        ], true)
                    }
                    list.appendChild(node)
                    last = { row, node }
                }
                if (stick) list.scrollTop = list.scrollHeight
            })
            .catch((thrown: unknown) => failOn(card.id, thrown))
    }

    const runOf = (card: Card): Run | undefined =>
        card.runs.find((entry) => entry.runId === runShown) ?? card.runs[card.runs.length - 1]

    const isLive = (card: Card, run: Run): boolean =>
        shown(card) === 'running' && run === card.runs[card.runs.length - 1] && !run.endedAt

    /*
     * The one view of what a card went through: an index of its history, oldest first, and what
     * the chosen run did under it. A run is a row of the index, with its outcome, how long it took
     * and what it cost; what the board did to the card between runs, created, moved, edited,
     * noted, are the quiet rows around it. A board event that belongs to a run is that run's row
     * and is not said again. Choosing a run shows its steps, or its live session while it runs.
     */
    const syncStage = (card: Card): void => {
        const run = runOf(card)
        const view = run ? `${card.id}:${run.runId}:${run && isLive(card, run) && session ? 'session' : `steps:${card.rev}`}` : ''
        if (view === terminalFor) return
        closeTerminal()
        if (!run) return
        terminalFor = view

        if (!(isLive(card, run) && session)) {
            paintSteps(card, run, stageView)
            return
        }

        const pane = el('div', 'dya-terminal kanban-terminal')
        stageView.replaceChildren(pane)
        /*
         * A run that ends takes its session with it, and the terminal attached to it fails on the
         * next reattach. That is the run finishing, not the card failing, so the view falls back
         * to the steps, which is what a finished run has to show.
         */
        terminal = openTerminal(ctx, pane, meta?.slug ?? '', card.id, (thrown) => {
            closeTerminal()
            if (reason(thrown).includes('no session to attach to')) {
                session = false
                paintStage(card)
                return
            }
            failOn(card.id, thrown)
        })
    }

    const runKeys = (card: Card, run: Run): HTMLElement => {
        const strip = el('div', 'dya-join')
        if (isLive(card, run)) {
            const live = key('prompt', 'Session')
            live.classList.toggle('dya-key--active', session)
            live.setAttribute('aria-pressed', String(session))
            live.addEventListener('click', (event) => {
                event.stopPropagation()
                session = !session
                paintStage(card)
            })
            strip.append(live)
        }
        const raw = key('file', 'Transcript')
        raw.addEventListener('click', (event) => {
            event.stopPropagation()
            void invoke<string | null>('transcriptPath', meta?.slug, card.id, run.runId)
                .then(async (path) => {
                    if (!path) return say('No transcript')
                    if (!(ctx.shell.canOpen(path) && (await ctx.shell.open({ path })))) await ctx.shell.reveal(path)
                })
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        strip.append(raw)
        return strip
    }

    const paintIndex = (card: Card, into: HTMLElement, events: BoardEvent[]): void => {
        const current = runOf(card)
        const ids = new Set(card.runs.map((run) => run.runId))
        type Line = { at: number; run?: Run; number?: number; kind?: string; detail?: string; times?: number; until?: number }
        const lines: Line[] = card.runs.map((run, index) => ({ at: run.startedAt, run, number: index + 1 }))
        let previous: Line | null = null
        for (const row of events) {
            if (row.runId && ids.has(row.runId)) continue
            if (previous && row.kind === 'edited' && previous.kind === 'edited') {
                const fields = new Set([...(previous.detail ?? '').split(', '), ...row.detail.split(', ')].filter(Boolean))
                previous.detail = [...fields].join(', ')
                previous.times = (previous.times ?? 1) + 1
                previous.until = row.at
                continue
            }
            previous = { at: row.at, kind: row.kind, detail: row.detail, times: 1, until: row.at }
            lines.push(previous)
        }
        lines.sort((a, b) => a.at - b.at)

        const table = el('table', 'dya-table kanban-index')
        const body = el('tbody')
        for (const line of lines) {
            const row = el('tr')
            if (line.run) {
                const run = line.run
                row.className = run === current ? 'dya-row dya-row--selected' : 'dya-row'
                row.setAttribute('aria-selected', String(run === current))
                const took = run.endedAt ? (since(run.startedAt, run.endedAt) ?? '<1m') : ago(run.startedAt, clock)
                const spent = cost(run.costUsd) ?? `${tokens(run.inputTokens + run.outputTokens)} tok`
                const name = el('td', 'dya-table__name')
                const legend = el('span', 'kanban-run-name')
                legend.append(el('span', light(runTone(run))), el('span', undefined, `Run ${line.number}`))
                name.append(legend)
                const kind = el('td', 'dya-table__fit')
                kind.append(el('span', 'dya-tag', run.kind === 'review' ? 'Review' : 'Implement'))
                const end = el('td', 'dya-table__end')
                if (run === current) end.append(runKeys(card, run))
                const detail = [runEnd(run), took].join(' - ')
                row.append(
                    el('td', 'dya-table__fit', when(run.startedAt)),
                    name,
                    kind,
                    el('td', 'dya-table__prose', run.error && (run.outcome === 'stopped' || run.outcome === 'crashed') ? `${detail} - ${run.error}` : detail),
                    el('td', 'dya-table__num', spent),
                    end
                )
                row.addEventListener('click', () => {
                    if (run === current) return
                    runShown = run.runId
                    session = false
                    paintStage(card)
                })
            } else {
                const [verb, tell, tone] = LOGGED[line.kind ?? ''] ?? [kindWord(line.kind ?? ''), (detail: string) => detail]
                const times = (line.times ?? 1) > 1 ? `${line.times} times, until ${clock24(line.until ?? line.at).slice(0, 5)}` : ''
                const what = el('td', 'dya-table__fit')
                what.colSpan = 2
                what.append(el('span', tone === 'error' ? 'dya-text--danger' : tone === 'warning' ? 'dya-text--warning' : '', verb))
                const detail = el('td', 'dya-table__prose', [tell(line.detail ?? ''), times].filter(Boolean).join(' - '))
                detail.colSpan = 3
                row.append(el('td', 'dya-table__fit', when(line.at)), what, detail)
            }
            body.append(row)
        }
        table.append(body)
        into.replaceChildren(table)
        into.scrollTop = into.scrollHeight
    }

    const paintStage = (card: Card): void => {
        const index = el('div', 'kanban-index-scroll')
        paintIndex(card, index, [])
        stage.replaceChildren(index, stageView)
        const asked = ++indexPaint
        void invoke<BoardEvent[]>('events', meta?.slug, card.id)
            .then((events) => {
                if (!disposed && indexPaint === asked && selected === card.id) paintIndex(card, index, events)
            })
            .catch(() => undefined)
        syncStage(card)
    }

    /*
     * The card's title, which is also where it is renamed: pressing it puts the same words in a
     * field on the same line, and Enter or leaving the field keeps them.
     */
    const headTitle = (card: Card): HTMLElement => {
        const title = el('span', 'dya-title kanban-drawer-title', card.title)
        title.tabIndex = 0
        title.setAttribute('role', 'button')
        title.setAttribute('aria-label', `Rename ${card.title}`)
        const edit = (): void => {
            const field = el('input', 'dya-field dya-field--prose kanban-drawer-rename')
            field.type = 'text'
            field.value = card.title
            field.setAttribute('aria-label', 'Title')
            let done = false
            const finish = (keep: boolean): void => {
                if (done) return
                done = true
                const next = field.value.trim()
                field.replaceWith(title)
                if (keep && next && next !== card.title) patch(card.id, { title: next })
            }
            field.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') finish(true)
                if (event.key === 'Escape') {
                    event.stopPropagation()
                    finish(false)
                    title.focus()
                }
            })
            field.addEventListener('blur', () => finish(true))
            title.replaceWith(field)
            field.focus()
            field.select()
        }
        title.addEventListener('click', edit)
        title.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            edit()
        })
        return title
    }

    const paintDrawer = (): void => {
        const card = selected ? cardById(selected) : undefined
        if (!card || !rules) {
            closeTerminal()
            drawer.hidden = true
            drawer.replaceChildren()
            drawnId = null
            drawnRev = -1
            drawerPaint += 1
            indexPaint += 1
            applySize()
            return
        }

        if (drawnId === card.id && drawnRev === card.rev && drawer.dataset.status === shown(card)) {
            syncStage(card)
            return
        }

        if (drawnId !== card.id) {
            runShown = null
            session = false
        }
        if (runShown && !card.runs.some((entry) => entry.runId === runShown)) runShown = null
        drawnId = card.id
        drawnRev = card.rev
        const painted = ++drawerPaint
        drawer.hidden = false
        drawer.dataset.status = shown(card)
        drawer.dataset.stage = String(card.runs.length > 0)
        drawer.replaceChildren()
        applySize()

        /*
         * The head is the card's title, the state it is in as a pill, and the keys that widen and
         * close the drawer. A blocked card waits for a person, so its state is the one key a
         * person answers: lit red and reading `Blocked`, green and reading `Unblock` under the
         * pointer, which is what pressing it does.
         */
        const head = el('div', 'dya-sheet__head kanban-drawer-head')
        const end = el('div', 'dya-sheet__end')
        const status = shown(card)
        const tone = rules.tone[status] ?? 'idle'
        if (status === 'blocked') {
            const resolve = el('button', 'dya-button dya-button--resolve')
            resolve.type = 'button'
            resolve.append(el('span', 'dya-button__state', rules.labels.blocked), el('span', 'dya-button__answer', 'Unblock'))
            resolve.setAttribute('aria-label', 'Unblock')
            resolve.addEventListener('click', () => {
                void invoke<Card>('unblock', meta?.slug, card.id, card.rev)
                    .then(() => {
                        solved(card.id)
                        return refresh()
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            end.append(resolve)
        }
        const sizeKey = key('expand', 'Expand')
        const paintSize = (): void => {
            const full = inspector === 'full'
            sizeKey.innerHTML = ICONS[full ? 'contract' : 'expand']
            sizeKey.setAttribute('aria-label', full ? 'Collapse' : 'Expand')
            sizeKey.setAttribute('aria-pressed', String(full))
            withTip(sizeKey, full ? 'Collapse' : 'Expand')
        }
        paintSize()
        sizeKey.addEventListener('click', () => {
            inspector = inspector === 'full' ? 'half' : 'full'
            write(sizeStore, inspector)
            applySize()
            paintSize()
        })
        const close = key('close', 'Close')
        close.addEventListener('click', () => select(null))
        const frame = el('div', 'dya-join')
        frame.append(sizeKey, close)
        end.append(frame)
        head.append(headTitle(card))
        if (status !== 'blocked') head.append(el('span', tone === 'idle' ? 'dya-badge' : `dya-badge dya-badge--${tone}`, rules.labels[status]))
        head.append(end)

        const form = el('div', 'dya-pane kanban-form')

        const problem = problems.get(card.id)
        const problemRow = el('div', 'dya-problem dya-problem--box')
        problemRow.hidden = problem === undefined
        if (problem) problemRow.textContent = problem

        const text = el('textarea', 'dya-field dya-field--prose kanban-body-field')
        text.value = card.body
        text.setAttribute('aria-label', 'Brief')
        text.addEventListener('change', () => patch(card.id, { body: text.value }))

        const priorityField = el('input', 'dya-field kanban-cap')
        priorityField.type = 'number'
        priorityField.value = String(card.priority)
        priorityField.setAttribute('aria-label', 'Priority')
        priorityField.addEventListener('change', () => patch(card.id, { priority: Number(priorityField.value) }))
        const priority = el('div', 'kanban-row')
        priority.append(priorityField)

        const number = (
            value: number | null,
            placeholder: string,
            unit: string,
            scale: number,
            apply: (next: number | null) => void
        ): HTMLElement => {
            const input = el('input', 'dya-field kanban-cap')
            input.type = 'number'
            input.min = '1'
            input.placeholder = placeholder
            input.disabled = card.locked
            input.setAttribute('aria-label', unit)
            if (value !== null) input.value = String(Math.round(value / scale))
            input.addEventListener('change', () => {
                const parsed = Number(input.value)
                apply(input.value.trim() && parsed > 0 ? Math.round(parsed) * scale : null)
            })
            const row = el('div', 'kanban-row')
            row.append(input, el('span', 'dya-key-label', unit))
            return row
        }

        const phase = (kind: keyof Runners): HTMLElement =>
            runnerRow(card.runners[kind], meta?.runners[kind] ?? null, card.locked, (next) =>
                patch(card.id, { runners: { [kind]: next } satisfies RunnersPatch })
            )

        const override = el('input', 'dya-field')
        override.type = 'text'
        override.placeholder = meta?.workdir ?? ''
        override.disabled = card.locked
        override.value = card.workdir ?? ''
        override.setAttribute('aria-label', 'Folder')
        override.addEventListener('change', () => patch(card.id, { workdir: override.value.trim() || null }))

        const browse = key('folder', 'Browse')
        browse.disabled = card.locked
        browse.addEventListener('click', () => {
            void invoke<string | null>('pickWorkdir')
                .then((picked) => (picked ? patch(card.id, { workdir: picked }) : undefined))
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        const overrideRow = el('div', 'dya-join')
        overrideRow.append(override, browse)

        const labelled = Object.fromEntries(WORKSPACES) as Record<string, string>

        const label = (name: string): HTMLElement => el('span', 'dya-label', name)

        const settingRows = [
            label('Priority'),
            priority,
            label('Permission'),
            choose(
                'Permission',
                card.permissionMode,
                PERMISSIONS,
                PERMISSION_LABELS,
                card.locked,
                (value) => patch(card.id, { permissionMode: value }),
                PERMISSION_TONES
            ),
            label('Workspace'),
            choose('Workspace', card.workspaceKind, ['dir', 'scratch'], labelled, card.locked, (value) =>
                patch(card.id, { workspaceKind: value as Card['workspaceKind'] })
            ),
            label('Folder'),
            overrideRow,
            label('Time limit'),
            number(card.maxRuntimeSeconds, '-', 'min', 60, (next) =>
                patch(card.id, { maxRuntimeSeconds: next })
            ),
            label('On failure'),
            number(card.maxRetries, '2', 'retries', 1, (next) =>
                patch(card.id, { maxRetries: next })
            )
        ]

        const runnerRows = [
            label('Runners'),
            phaseHeads(),
            label('Implement'),
            phase('implement'),
            label('Review'),
            phase('review')
        ]

        const unattach = (name: string): void => {
            if (!window.confirm(`Delete ${name}?`)) return
            void invoke('removeAttachment', meta?.slug, card.id, name)
                .then(() => {
                    solved(card.id)
                    return refresh()
                })
                .catch((thrown: unknown) => failOn(card.id, thrown))
        }
        const attached = (card.attachments ?? []).map((file) => {
            const row = el('div', 'kanban-file')
            const open = fileRow(file.name, () => {
                void invoke('reveal', meta?.slug, card.id, file.name).catch((thrown: unknown) =>
                    failOn(card.id, thrown)
                )
            }, size(file.bytes))
            const drop = key('close', 'Remove')
            drop.disabled = card.locked
            drop.classList.add('kanban-reveal')
            drop.addEventListener('click', () => unattach(file.name))
            row.append(open, drop)
            return row
        })

        const addFile = key('attach', 'Attach')
        addFile.disabled = card.locked
        addFile.addEventListener('click', () => {
            void invoke<{ card: Card | null; refused: string[] } | null>(
                'addAttachments',
                meta?.slug,
                card.id
            )
                .then((answer) => {
                    if (!answer) return undefined
                    if (answer.refused.length) {
                        failOn(card.id, `Over 25 MB: ${answer.refused.join(', ')}`)
                    } else {
                        solved(card.id)
                    }
                    return refresh()
                })
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        const files = el('div', 'dya-form__stack')
        if (attached.length) files.append(fileList(attached))
        files.append(addFile)

        const parents = el('div', 'dya-form__value')
        for (const parentId of card.parents) {
            const parent = cardById(parentId)
            const holder = el('span', 'dya-join')
            const chip = el('button', 'dya-chip')
            chip.append(el('span', 'kanban-clip', parent ? parent.title : parentId))
            chip.type = 'button'
            chip.disabled = !parent
            chip.addEventListener('click', () => select(parentId))
            const drop = key('close', 'Remove')
            drop.disabled = card.locked
            drop.addEventListener('click', () =>
                patch(card.id, { parents: card.parents.filter((entry) => entry !== parentId) })
            )
            holder.append(chip, drop)
            parents.appendChild(holder)
        }
        if (cards.some((entry) => entry.id !== card.id && !card.parents.includes(entry.id))) {
            const addParent = key('link', 'Add')
            addParent.addEventListener('click', () => openParentMenu(card, addParent))
            parents.append(addParent)
        }

        const thread = el('div', 'dya-form__stack')
        for (const entry of card.comments) {
            const item = el('div', 'dya-stack kanban-note')
            const itemHead = el('div', 'dya-entry__head')
            const forget = key('close', 'Delete')
            forget.classList.add('kanban-reveal')
            forget.addEventListener('click', () => {
                void invoke('uncomment', meta?.slug, card.id, entry.at)
                    .then(() => {
                        solved(card.id)
                        return refresh()
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            itemHead.append(
                el('span', 'dya-tag', entry.author === 'agent' ? 'Agent' : 'You'),
                el('span', 'dya-meta', ago(entry.at, clock)),
                el('span', 'kanban-spacer'),
                forget
            )
            item.append(itemHead, el('div', 'dya-entry__text', entry.text))
            thread.appendChild(item)
        }

        const note = el('input', 'dya-field dya-field--prose')
        note.type = 'text'
        note.placeholder = 'Note'
        note.setAttribute('aria-label', 'Note')
        const leave = (): void => {
            const value = note.value.trim()
            if (!value) return
            note.value = ''
            void invoke('comment', meta?.slug, card.id, value)
                .then(() => {
                    solved(card.id)
                    return refresh()
                })
                .catch((thrown: unknown) => {
                    note.value = value
                    failOn(card.id, thrown)
                })
        }
        note.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            leave()
        })
        note.addEventListener('blur', leave)
        const post = key('add', 'Add')
        post.addEventListener('mousedown', (event) => event.preventDefault())
        post.addEventListener('click', leave)
        const compose = el('div', 'dya-join')
        compose.append(note, post)
        thread.append(compose)

        const parkable = status === 'ready' || status === 'scheduled'
        const schedule = el('div', 'dya-join')
        if (parkable) {
            const at = el('input', 'dya-field')
            at.type = 'datetime-local'
            at.setAttribute('aria-label', 'Park until')
            if (card.scheduledFor) at.value = local(card.scheduledFor)
            const park = key('clock', 'Park')
            park.addEventListener('click', () => {
                const at2 = at.value ? new Date(at.value).getTime() : 0
                if (!at2 || Number.isNaN(at2)) {
                    say('Invalid time')
                    return
                }
                void invoke('updateCard', meta?.slug, card.id, { scheduledFor: at2 })
                    .then((updated) => {
                        const next = updated as Card
                        if (next.status === 'scheduled') return refresh()
                        return invoke('moveCard', meta?.slug, card.id, next.rev, 'scheduled').then(
                            () => refresh()
                        )
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            schedule.append(at, park)
        }

        /*
         * What to do about this card comes first: approve or send back a review, stop a run, move
         * the card. They are one strip in the value column of the form's first row, and deleting
         * the card, rare and the end of it, is the last row.
         */
        const actions = el('div', 'dya-join')
        const review: HTMLElement[] = []
        const actionsLabel = label('')

        if (status === 'review') {
            const judged = [...card.runs].reverse().find((entry) => entry.kind === 'implement' && entry.outcome === 'completed')
            const spent = cost(card.runs.reduce<number | null>((sum, entry) => (typeof entry.costUsd === 'number' ? (sum ?? 0) + entry.costUsd : sum), null))
            if (spent) {
                const pills = el('div', 'dya-pills')
                pills.append(el('span', 'dya-tag', spent))
                review.push(label('Cost'), pills)
            }
            if (judged?.artifacts.length) {
                review.push(label('Artifacts'), fileList(judged.artifacts.map((artifact) => artifactFile(card, artifact))))
            }
            if (judged) {
                void invoke<{ stat: string; text: string; truncated: boolean } | null>('runDiff', meta?.slug, card.id, judged.runId)
                    .then((change) => {
                        if (!change?.stat.trim() || disposed || drawerPaint !== painted) return
                        const holder = el('div', 'kanban-diff')
                        const lines = change.stat.trimEnd().split('\n')
                        const total = lines.pop()?.trim() ?? ''
                        const table = el('table', 'dya-table')
                        const body = el('tbody')
                        for (const line of lines) {
                            const [path, count] = line.split('|').map((part) => part.trim())
                            if (!path) continue
                            const row = el('tr', 'dya-row')
                            row.append(
                                el('td', 'dya-table__name dya-mono', path),
                                el('td', 'dya-table__num', (count ?? '').split(/\s+/)[0] ?? '')
                            )
                            body.append(row)
                        }
                        table.append(body)
                        holder.append(table, el('span', 'dya-meta dya-meta--wrap', total))
                        if (change.text.trim()) {
                            const more = el('details', 'kanban-more')
                            const summary = el('summary', 'dya-label', change.truncated ? 'Diff, cut' : 'Diff')
                            const code = el('pre', 'dya-code')
                            code.innerHTML = highlight(change.text, 'diff')
                            more.append(summary, code)
                            holder.append(more)
                        }
                        actionsLabel.before(label('Changes'), holder)
                    })
                    .catch(() => undefined)
            }

            const approve = key('check', 'Approve')
            approve.classList.add('dya-key--success')
            approve.addEventListener('click', () => move(card.id, 'done'))
            const changes = key('undo', 'Request changes')
            changes.addEventListener('click', () => move(card.id, 'ready'))
            actions.append(approve, changes)
        } else if (status === 'running') {
            const stop = key('stop', 'Stop')
            stop.classList.add('dya-key--danger')
            stop.addEventListener('click', () => {
                if (!window.confirm('Stop the worker?')) return
                void invoke('stopCard', meta?.slug, card.id)
                    .then(() => {
                        solved(card.id)
                        return refresh()
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            actions.append(stop)
        }

        const remove = key('delete', 'Delete')
        remove.classList.add('dya-key--danger')
        remove.addEventListener('click', () => {
            if (!window.confirm(`Delete '${card.title}'?`)) return
            void invoke('deleteCard', meta?.slug, card.id)
                .then(() => {
                    problems.delete(card.id)
                    select(null)
                    return refresh()
                })
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        const removeRow = el('div', 'kanban-row')
        removeRow.append(remove)

        const fields = el('div', 'dya-form')
        fields.append(...review)
        if (actions.childElementCount) fields.append(actionsLabel, actions)
        fields.append(
            label('Brief'),
            text,
            label('Files'),
            files,
            ...settingRows,
            ...runnerRows,
            label('Depends on'),
            parents
        )
        if (parkable) fields.append(label('Park until'), schedule)
        fields.append(label('Thread'), thread, label(''), removeRow)

        form.append(problemRow, fields)
        const body = el('div', 'kanban-drawer-body')
        if (card.runs.length) {
            body.append(stage, form)
            paintStage(card)
        } else {
            closeTerminal()
            body.append(form)
        }
        drawer.append(head, body)
    }

    const openParentMenu = (card: Card, anchor: HTMLElement): void => {
        const rows: MenuRow[] = cards
            .filter((entry) => entry.id !== card.id && !card.parents.includes(entry.id))
            .map((entry) => ({
                key: entry.id,
                label: entry.title,
                group: entry.status,
                direct: true,
                leaves: [{ label: entry.title, value: entry.id }]
            }))

        if (!rows.length) return

        openMenu({
            anchor,
            rows,
            onPick: (row) => patch(card.id, { parents: [...card.parents, row.key] })
        })
    }

    const patch = (id: string, body: Record<string, unknown>): void => {
        void invoke('updateCard', meta?.slug, id, body)
            .then(() => {
                solved(id)
                return refresh()
            })
            .catch((thrown: unknown) => failOn(id, thrown))
    }

    const add = async (raw: string): Promise<boolean> => {
        const title = raw.trim()
        if (!title || !meta) return false
        try {
            await invoke<Card>('createCard', meta.slug, { title })
            await refresh()
            return true
        } catch (thrown) {
            fail(thrown)
            return false
        }
    }

    const visibleColumns = (): Status[] =>
        rules ? rules.order.filter((status) => columns.has(status)) : []

    const focusCard = (id: string): void => {
        const node = nodes.get(id)
        if (!node) return
        for (const [key, entry] of nodes) entry.root.tabIndex = key === id ? 0 : -1
        focused = id
        node.root.focus()
        node.root.scrollIntoView({ block: 'nearest' })
    }

    const columnCards = (status: Status): Card[] =>
        order(cards.filter((card) => shown(card) === status))

    const step = (event: KeyboardEvent, id: string): void => {
        const card = cardById(id)
        if (!card || !rules) return

        const here = columnCards(shown(card))
        const index = here.findIndex((entry) => entry.id === card.id)
        const lane = visibleColumns()
        const laneIndex = lane.indexOf(shown(card))

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (event.ctrlKey) {
                const delta = event.key === 'ArrowDown' ? -1 : 1
                patch(card.id, { priority: card.priority + delta })
                return
            }
            const next = here[index + (event.key === 'ArrowDown' ? 1 : -1)]
            if (next) focusCard(next.id)
            return
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            const delta = event.key === 'ArrowRight' ? 1 : -1

            if (event.ctrlKey) {
                const allowed = rules.allow[shown(card)]
                const walk =
                    delta > 0 ? lane.slice(laneIndex + 1) : lane.slice(0, laneIndex).reverse()
                const found = walk.find((status) => allowed.includes(status))
                if (!found) return
                move(card.id, found)
                return
            }

            for (let cursor = laneIndex + delta; cursor >= 0 && cursor < lane.length; cursor += delta) {
                const neighbour = columnCards(lane[cursor])[0]
                if (neighbour) {
                    focusCard(neighbour.id)
                    return
                }
            }
            return
        }

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            const target = event.key === 'Home' ? here[0] : here[here.length - 1]
            if (target) focusCard(target.id)
            return
        }

        if (event.key === 'Enter') {
            event.preventDefault()
            select(card.id)
            return
        }

        if (event.key === 'x' || (event.key === ' ' && event.ctrlKey)) {
            event.preventDefault()
            toggleMark(card.id)
            return
        }

        if (event.key === 'Escape' && marked.size) {
            event.preventDefault()
            clearMarks()
            return
        }

        if (event.key === 'm' || event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            event.preventDefault()
            const node = nodes.get(card.id)
            if (node) openMoveMenu(card.id, node.root)
        }
    }

    const onBoardKey = (event: KeyboardEvent): void => {
        const id = (event.target as HTMLElement)?.dataset?.card
        if (!id) return
        focused = id
        step(event, id)
    }

    const stopDrag = installDrag(board, {
        columns: () => [...columns.values()],
        cardAt: (target) => (target as HTMLElement | null)?.closest?.('.kanban-card') ?? null,
        idOf: (card) => card.dataset.card ?? '',
        statusOf: (card) => (card.dataset.status ?? 'triage') as Status,
        canDrop: (id, to) => {
            const card = cardById(id)
            return Boolean(card && rules?.allow[shown(card)].includes(to))
        },
        commit: (id, to) => move(id, to),
        gesture: (active) => {
            gesturing = active
            if (active) return
            if (deferred) {
                deferred = false
                void refresh().catch(fail)
            }
        }
    })

    const onEvent = (raw: unknown): void => {
        const event = raw as KanbanEvent | CardProgress | { type: string; slug: string; cardId: string }
        const kind = (event as { type: string }).type

        if (watching) {
            if (kind === 'card:progress' && overview) {
                const live = event as CardProgress
                const run = overview.runs.find(
                    (entry) => entry.slug === live.slug && entry.cardId === live.cardId
                )
                if (run) {
                    run.state = live.state
                    run.tool = live.tool
                    run.inputTokens = live.inputTokens
                    run.outputTokens = live.outputTokens
                    run.waiting = live.waiting
                    clock = Date.now()
                    paintWatch()
                    return
                }
            }
            restock()
        }

        if (kind === 'boards:changed') {
            void refresh().catch(fail)
            return
        }

        if ((event as { slug?: string }).slug !== meta?.slug) return

        if (kind === 'card:progress') {
            const live = event as CardProgress
            progress.set(live.cardId, live)
            const card = cardById(live.cardId)
            if (card) paintCard(card)
            return
        }

        if (kind === 'run:ended') {
            progress.delete((event as { cardId: string }).cardId)
        }

        if (kind !== 'board:changed' && kind !== 'run:ended') return
        if (gesturing) {
            deferred = true
            return
        }
        void refresh().catch(fail)
    }

    boardButton.addEventListener('click', () => openBoardMenu(boardButton))
    newCardKey.addEventListener('click', () => openDraft?.())
    sheetScrim.addEventListener('click', () => closeSheet())
    board.addEventListener('keydown', onBoardKey)
    board.addEventListener('click', (event) => {
        if (!selected || gesturing) return
        const target = event.target as Element
        if (target.closest('.kanban-card, .dya-key, .kanban-new')) return
        select(null)
    })
    /* Clicking the board is how a selection is dropped; under the scrim it is the same gesture. */
    scrim.addEventListener('click', () => select(null))

    /*
     * Escape belongs to the panel. On the drawer it only fired while the focus was already inside
     * it, which is never true of a reader who reached for the key because the pointer was
     * somewhere else -- and never true at all in full, where the board behind is inert.
     */
    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        const target = event.target as Element | null
        if (target?.closest?.('select') || root.querySelector('select:open')) return
        if (sheet) {
            event.preventDefault()
            closeSheet()
            return
        }
        if (drawer.hidden || target?.closest?.('input, textarea, [contenteditable]')) return
        event.preventDefault()
        const returning = drawnId
        select(null)
        if (returning) focusCard(returning)
    })

    const watchRow = (run: WatchRun): HTMLElement => {
        const row = el('button', 'dya-entry dya-entry--row')
        row.type = 'button'

        const dot = el('span', light(run.waiting ? 'warning' : 'busy'))

        const said = [
            run.board,
            run.kind === 'review' ? 'review' : null,
            ago(run.startedAt, clock),
            run.tool ?? run.state,
            `${tokens(run.inputTokens + run.outputTokens)} tok`
        ]
            .filter(Boolean)
            .join(' - ')

        row.append(dot, el('span', 'dya-name', run.title), el('span', 'dya-meta', said))
        if (run.waiting) row.append(el('span', 'dya-tag', 'Waiting on you'))

        row.addEventListener('click', () => {
            const target = run.slug
            const card = run.cardId
            closeWatch()
            if (target === meta?.slug) {
                select(card)
                focusCard(card)
                return
            }
            write(pinKey, target)
            void refresh()
                .then(() => {
                    select(card)
                    focusCard(card)
                })
                .catch(fail)
        })
        return row
    }

    const paintWatch = (): void => {
        if (!overview) return
        const shape = overview
        const holder = el('div', 'kanban-watch-body')

        /*
         * A masthead, then the boards, then what was decided. The headline is the number, not a
         * sentence containing it. The window that dispatches says nothing about it; another one
         * says that agents run elsewhere.
         *
         * What was here said "running" three times before it said anything: a headline reading
         * "0 running of 2", a section called RUNNING NOW, and under it the sentence "nothing is
         * running". The count is the headline; the section exists only when something is in it.
         *
         * The numeral is set in the serif, which until now this system spent on one word in the
         * title bar. A figure that is the whole point of a screen is allowed to be the one thing
         * on it that is not mono.
         */
        const masthead = el('div', 'dya-masthead')
        const stat = el('div', 'dya-stat')
        const figure = el('div', 'dya-stat__figure')
        figure.append(
            el('span', 'dya-stat__value', String(shape.running)),
            el('span', 'dya-stat__unit', `/${shape.across}`)
        )
        const statText = el('div', 'dya-stat__text')
        statText.append(el('span', 'dya-label', 'Running'))
        stat.append(figure, statText)
        masthead.append(stat, el('span', 'kanban-spacer'))

        if (shape.across === 0) {
            masthead.append(el('span', 'dya-badge dya-badge--warning', 'Paused'))
        }
        if (!shape.holding) masthead.append(el('span', 'dya-tag', 'Runs elsewhere'))
        holder.append(masthead)

        /*
         * A board is a card you can press, and pressing it opens that board — which is what makes
         * the relief honest rather than decorative. The tallies are pills whose hue says which
         * queue they are: a number beside the word "blocked" in the same grey as the number beside
         * "ready" is two facts dressed as one.
         */
        const boardsGroup = el('div', 'kanban-group')
        boardsGroup.append(el('span', 'dya-eyebrow', 'boards'))
        const grid = el('div', 'dya-grid')
        for (const entry of shape.boards) {
            grid.append(boardTile(entry.name, entry.slug, entry))
        }
        boardsGroup.append(grid)
        holder.appendChild(boardsGroup)

        /* The section exists when something is in it. */
        if (shape.runs.length) {
            const runsGroup = el('div', 'kanban-group')
            runsGroup.append(el('span', 'dya-eyebrow', 'runs'))
            for (const run of shape.runs) runsGroup.appendChild(watchRow(run))
            holder.appendChild(runsGroup)
        }

        if (shape.problems.length) {
            const problemGroup = el('div', 'kanban-group')
            problemGroup.append(el('span', 'dya-eyebrow', 'problems'))
            for (const entry of shape.problems) {
                const row = el('div', 'dya-entry dya-entry--row')
                row.append(el('span', light('warning')))
                const where = shape.boards.find((board) => board.slug === entry.slug)?.name ?? 'this machine'
                row.append(el('span', 'dya-name', where), el('span', 'dya-meta dya-meta--wrap', entry.problem))
                problemGroup.appendChild(row)
            }
            holder.appendChild(problemGroup)
        }

        if (shape.decisions.length) {
            const log = el('div', 'kanban-group')
            log.append(el('span', 'dya-eyebrow', 'recent'))
            const logTable = el('table', 'dya-table kanban-decided')
            const logBody = el('tbody')
            /*
             * One card's decisions under its title, said once. Ten rows each carrying the same
             * two-line title was the title read ten times to learn that one card had been tried
             * five times.
             */
            const byCard = new Map<string, typeof shape.decisions>()
            for (const row of shape.decisions) {
                const group = byCard.get(row.cardId) ?? []
                group.push(row)
                byCard.set(row.cardId, group)
            }
            for (const [cardId, rows] of byCard) {
                const first = rows[0]
                const gone = first.title === cardId
                const heading = el('tr', 'kanban-decided-card')
                const name = el('td', 'dya-table__subject', gone ? 'Deleted card' : first.title)
                name.colSpan = 2
                if (gone) withTip(name, cardId)
                heading.append(name, el('td', 'dya-table__end dya-meta', first.board))
                logBody.appendChild(heading)
                for (const row of rows) {
                    const line = el('tr', 'dya-row')
                    const kind = el('td', 'dya-table__fit')
                    kind.append(el('span', DECISION_PILL[row.kind] ?? 'dya-tag', kindWord(row.kind)))
                    line.append(
                        kind,
                        el('td', 'dya-table__prose', row.detail),
                        el('td', 'dya-table__end dya-meta', when(row.at))
                    )
                    logBody.appendChild(line)
                }
            }
            logTable.append(logBody)
            log.appendChild(logTable)
            holder.appendChild(log)
        }

        watch.replaceChildren(holder)
    }

    const loadWatch = async (): Promise<void> => {
        overview = await invoke<Overview>('overview')
        clock = overview.at
        paintWatch()
    }

    const openWatch = (): void => {
        watching = true
        show('watch')
        watch.replaceChildren()
        void loadWatch().catch(fail)
    }

    function closeWatch(): void {
        show(meta === null ? 'form' : 'board')
    }

    const restock = (): void => {
        if (!watching || watchTimer) return
        watchTimer = window.setTimeout(() => {
            watchTimer = 0
            if (watching) void loadWatch().catch(fail)
        }, 2_000)
    }

    /*
     * What the dispatcher found wrong. A card it names is lit yellow on the board; the list is the
     * Board health command, opened under the board picker, and there is no key waiting for it.
     */
    const health = async (): Promise<void> => {
        const found = await invoke<Diagnostic[]>('diagnostics')
        diagnostics = found.filter((entry) => entry.slug === meta?.slug || entry.slug === '')
        const before = new Set(diagnosed)
        diagnosed.clear()
        for (const entry of diagnostics) {
            if (entry.cardId) diagnosed.add(entry.cardId)
        }
        for (const id of new Set([...before, ...diagnosed])) {
            if (before.has(id) === diagnosed.has(id)) continue
            const card = cardById(id)
            if (card) paintCard(card)
        }
    }

    const showHealth = (): void => {
        if (!diagnostics.length) {
            say('Healthy')
            return
        }
        const surface = openSurface(boardButton, 'kanban-health')
        surface.root.setAttribute('role', 'dialog')
        surface.root.setAttribute('aria-label', 'Board health')
        surface.root.tabIndex = -1
        for (const entry of diagnostics) {
            const card = entry.cardId ? cardById(entry.cardId) : undefined
            const row = el(card ? 'button' : 'div', 'dya-menu__item dya-menu__item--tall')
            if (row instanceof HTMLButtonElement) row.type = 'button'
            const said = el('span', 'dya-menu__text')
            said.append(
                el('span', undefined, card?.title ?? (entry.slug ? (meta?.name ?? 'This board') : 'This machine')),
                el('span', 'dya-menu__note', entry.problem)
            )
            row.append(el('span', light('warning')), said)
            if (card) {
                row.addEventListener('click', () => {
                    surface.close()
                    select(card.id)
                    focusCard(card.id)
                })
            }
            surface.root.appendChild(row)
        }
        surface.root.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            surface.close()
            boardButton.focus()
        })
        surface.place()
        surface.root.focus()
    }

    const ticker = window.setInterval(() => {
        clock = Date.now()
        for (const card of cards) paintCard(card)
        if (watching) paintWatch()
        if (meta) void health().catch(() => undefined)
    }, 30_000)

    const onNotice = (raw: unknown): void => {
        const action = raw as { slug?: string; cardId?: string } | null
        if (!action?.cardId || action.slug !== meta?.slug) return
        select(action.cardId)
        focusCard(action.cardId)
    }

    const unsubscribe = ctx.on('event', onEvent)
    const unnotice = ctx.on('notice', onNotice)

    const toBoard = (): void => {
        if (watching) closeWatch()
    }
    const commands: Commands = {
        newCard: () => {
            if (!meta) return newBoard()
            toBoard()
            closeSheet(false)
            openDraft?.()
        },
        newBoard: () => {
            closeSheet(false)
            newBoard()
        },
        switchBoard: () => openBoardMenu(boardButton),
        allBoards: () => {
            if (!watching) openWatch()
        },
        health: () => {
            if (!meta) return
            toBoard()
            closeSheet(false)
            void health()
                .then(showHealth)
                .catch(fail)
        },
        worktrees: () => {
            if (!meta) return
            toBoard()
            closeSheet(false)
            openWorktreeMenu(boardButton)
        },
        settings: () => {
            if (!meta) return
            toBoard()
            showBoardSettings()
        }
    }
    void refresh()
        .catch(fail)
        .finally(() => {
            if (!disposed) arrived(handle.instanceId, commands)
        })

    return () => {
        disposed = true
        mounted.delete(handle.instanceId)
        closeTerminal()
        unsubscribe()
        unnotice()
        stopDrag()
        window.clearInterval(ticker)
        if (watchTimer) window.clearTimeout(watchTimer)
        pending.clear()
        root.remove()
    }
}

export function activate(ctx: PluginContext): void {
    injectStyles('kanban', `${xtermCss}
${STYLES}`)
    const command = (id: string, title: string, run: (commands: Commands) => void): void => {
        ctx.registerCommand({
            id,
            title,
            run: async () => {
                const found = await instance(ctx)
                if (found) run(found)
            }
        })
    }
    command('new-card', 'New card', (commands) => commands.newCard())
    command('new-board', 'New board', (commands) => commands.newBoard())
    command('switch-board', 'Switch board', (commands) => commands.switchBoard())
    command('all-boards', 'All boards', (commands) => commands.allBoards())
    command('board-settings', 'Board settings', (commands) => commands.settings())
    command('worktrees', 'Worktrees', (commands) => commands.worktrees())
    command('board-health', 'Board health', (commands) => commands.health())
    ctx.registerPanel(
        {
            id: 'kanban',
            title: 'Kanban',
            icon: ICON,
            duplicable: true
        },
        (container, handle) => mount(ctx, container, handle)
    )
}
