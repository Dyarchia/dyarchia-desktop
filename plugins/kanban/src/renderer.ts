import xtermCss from '@xterm/xterm/css/xterm.css'
import { injectStyles } from '@dyarchia/sdk'
import type { PanelHandle, PluginContext } from '@dyarchia/sdk'
import { installDrag } from './drag.js'
import type { DragColumn } from './drag.js'
import { openMenu, openSurface } from './menu.js'
import type { MenuRow } from './menu.js'
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
    Runner,
    Runners,
    RunnersPatch,
    Settings,
    Status,
    WatchRun
} from './types.js'

interface HistoryRow {
    at: number
    kind: 'text' | 'thinking' | 'tool' | 'result' | 'end'
    label: string
    body: string
    error: boolean
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

const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="10" rx="1"/><rect x="16" y="4" width="5" height="13" rx="1"/></svg>'

const STROKE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'

const ICONS = {
    play: `${STROKE}<polygon points="6 4 20 12 6 20 6 4"/></svg>`,
    eye: `${STROKE}<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    pulse: `${STROKE}<polyline points="3 12 7 12 10 5 14 19 17 12 21 12"/></svg>`,
    plus: `${STROKE}<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    sliders: `${STROKE}<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.5" fill="var(--dya-chassis)"/><circle cx="15" cy="17" r="2.5" fill="var(--dya-chassis)"/></svg>`,
    branch: `${STROKE}<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 7.5v9"/><path d="M18 10.5c0 4-12 3-12 6"/></svg>`,
    expand: `${STROKE}<polyline points="15 4 20 4 20 9"/><polyline points="9 20 4 20 4 15"/><line x1="20" y1="4" x2="14" y2="10"/><line x1="4" y1="20" x2="10" y2="14"/></svg>`,
    contract: `${STROKE}<polyline points="4 10 9 10 9 5"/><polyline points="20 14 15 14 15 19"/><line x1="9" y1="10" x2="3" y2="4"/><line x1="15" y1="14" x2="21" y2="20"/></svg>`,
    close: `${STROKE}<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`
}

const PERMISSIONS = ['acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan']
const OTHER = '\u2026'
const WORKSPACES: [string, string][] = [
    ['dir', 'the project directory'],
    ['scratch', 'a fresh temporary directory']
]

const SLOW_MS = 1200
const PIN = 'kanban:board:'

interface CardNode {
    root: HTMLElement
    title: HTMLElement
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

function size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function tokens(count: number): string {
    if (count < 1000) return String(count)
    if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`
    return `${(count / 1_000_000).toFixed(2)}M`
}

function when(at: number): string {
    const date = new Date(at)
    const day = date.toDateString() === new Date().toDateString() ? '' : `${date.getDate()}/${date.getMonth() + 1} `
    return `${day}${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
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
 * What colour a decision wears. Kinds that differ have to look different — a row saying a card was
 * created and a row saying one was deleted wore the same soft tag, so the list read as one texture
 * and the eye had nothing to catch on. Four families: routine, motion, good, bad.
 */
const DECISION_TONE: Record<string, string> = {
    created: 'dya-badge--accent-3',
    edited: 'dya-badge--soft',
    commented: 'dya-badge--soft',
    attached: 'dya-badge--soft',
    detached: 'dya-badge--soft',
    moved: 'dya-badge--accent',
    promoted: 'dya-badge--accent',
    claimed: 'dya-badge--accent',
    completed: 'dya-badge--accent-3',
    reviewed: 'dya-badge--accent-3',
    unblocked: 'dya-badge--accent-3',
    landed: 'dya-badge--accent-3',
    blocked: 'dya-badge--warning',
    guarded: 'dya-badge--warning',
    violation: 'dya-badge--warning',
    block_loop: 'dya-badge--warning',
    stopped: 'dya-badge--warning',
    crashed: 'dya-badge--danger',
    gave_up: 'dya-badge--danger',
    deleted: 'dya-badge--danger'
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
    let diagnostics: Diagnostic[] = []

    const nodes = new Map<string, CardNode>()
    const columns = new Map<Status, Column>()
    const pending = new Map<string, number>()
    const optimistic = new Map<string, Status>()
    const progress = new Map<string, CardProgress>()

    let terminal: Attached | null = null
    let terminalFor = ''
    let tab: 'terminal' | 'history' | 'board' = 'terminal'
    let drawnId: string | null = null
    let drawnRev = -1
    const marked = new Set<string>()
    let lastMark: string | null = null
    let watching = false
    let overview: Overview | null = null
    let watchTimer = 0

    const root = el('div', 'kanban')

    /*
     * Every icon-only control carries a tip: a hint popover the browser opens on hover or
     * focus and anchors to the control itself. The tips live in one hidden holder under the
     * panel root, so they leave with it.
     */
    const tips = el('div', 'kanban-tips')
    const tipOf = new WeakMap<HTMLElement, HTMLElement>()
    let tipSeq = 0
    const tipScope = handle.instanceId.replace(/[^\w-]/g, '-')
    const withTip = (control: HTMLElement, text: string): void => {
        let tip = tipOf.get(control)
        if (!tip) {
            tip = el('div', 'dya-tip')
            tip.id = `kanban-tip-${tipScope}-${++tipSeq}`
            tip.setAttribute('popover', 'hint')
            tips.appendChild(tip)
            tipOf.set(control, tip)
            control.setAttribute('interestfor', tip.id)
        }
        tip.textContent = text
    }
    const key = (icon: keyof typeof ICONS, label: string, hint = label): HTMLButtonElement => {
        const button = el('button', 'dya-key')
        button.type = 'button'
        button.innerHTML = ICONS[icon]
        button.setAttribute('aria-label', label)
        withTip(button, hint)
        return button
    }

    const bar = el('div', 'dya-bar kanban-bar')
    const boardButton = el('button', 'dya-button dya-button--quiet', 'board')
    boardButton.type = 'button'
    withTip(boardButton, 'switch to another board')
    const newBoardKey = key('plus', 'new board', 'a board on another project')
    const settingsKey = key('sliders', 'board settings', 'rename this board, point it at another directory, archive or delete it')
    settingsKey.hidden = true
    const treesKey = key('branch', 'worktrees', 'what every run left behind in this project')
    treesKey.hidden = true
    const tickButton = key('play', 'dispatch', 'sweep every board now instead of waiting for the tick')
    const WATCH_TIP = 'every board at once: what is running, what is queued, what was decided'
    const watchButton = key('eye', 'watch', WATCH_TIP)
    watchButton.setAttribute('aria-pressed', 'false')
    const spacer = el('span', 'kanban-spacer')
    const healthButton = el('button', 'dya-button dya-button--quiet dya-button--sm kanban-health-button')
    healthButton.type = 'button'
    healthButton.hidden = true
    healthButton.innerHTML = ICONS.pulse
    const healthCount = el('span', undefined, '0')
    healthButton.appendChild(healthCount)
    const meter = el('span', 'dya-tag kanban-meta')
    meter.hidden = true
    bar.append(
        boardButton,
        newBoardKey,
        settingsKey,
        treesKey,
        el('span', 'kanban-bar-sep'),
        tickButton,
        watchButton,
        spacer,
        healthButton,
        meter
    )

    const main = el('div', 'kanban-main')
    const board = el('div', 'kanban-board')
    board.setAttribute('role', 'application')
    board.setAttribute('aria-label', 'task board')

    const drawer = el('aside', 'dya-card kanban-drawer')
    drawer.hidden = true

    const stage = el('div', 'kanban-stage')
    stage.hidden = true
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
    }

    const marks = el('div', 'dya-bar kanban-marks')
    marks.hidden = true

    const setup = el('div', 'kanban-setup')
    setup.hidden = true

    const watch = el('div', 'kanban-watch')
    watch.hidden = true

    const live = el('div', 'dya-sr-only')
    live.setAttribute('aria-live', 'polite')

    const error = el('div', 'kanban-error')
    error.hidden = true

    main.append(board, drawer)
    root.append(bar, marks, main, setup, watch, error, live, tips)
    container.appendChild(root)

    const say = (text: string): void => {
        live.textContent = text
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

    const show = (next: View): void => {
        if (next !== 'watch' && watching) stopWatching()
        main.hidden = next !== 'board'
        watch.hidden = next !== 'watch'
        setup.hidden = next !== 'form'
        marks.hidden = next !== 'board' || marked.size === 0

        const onBoard = next === 'board' && meta !== null
        settingsKey.hidden = !onBoard
        treesKey.hidden = !onBoard
        boardButton.textContent = meta?.name ?? 'board'
        watchButton.classList.toggle('dya-key--active', next === 'watch')
        watchButton.setAttribute('aria-pressed', String(next === 'watch'))
        withTip(watchButton, next === 'watch' ? 'back to the board' : WATCH_TIP)
    }

    const problems = new Map<string, string>()
    let boardProblem: string | null = null

    const reason = (thrown: unknown): string =>
        thrown instanceof Error ? thrown.message : String(thrown)

    const paintProblems = (): void => {
        if (boardProblem) {
            error.textContent = boardProblem
        } else if (problems.size === 1) {
            const [id, problem] = [...problems][0]
            error.textContent = `${cardById(id)?.title ?? 'a card'}: ${problem}`
        } else if (problems.size) {
            error.textContent = `${problems.size} cards have a problem`
        } else {
            error.textContent = ''
        }
        error.hidden = error.textContent === ''
    }

    const fail = (thrown: unknown): void => {
        boardProblem = reason(thrown)
        say(boardProblem)
        paintProblems()
    }

    const failOn = (id: string | undefined, thrown: unknown): void => {
        if (!id) {
            fail(thrown)
            return
        }
        const problem = reason(thrown)
        problems.set(id, problem)
        say(`${cardById(id)?.title ?? 'a card'}: ${problem}`)
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
        const shell = el('section', 'dya-card kanban-column')
        shell.dataset.status = status
        shell.setAttribute('role', 'group')
        shell.setAttribute('aria-label', label)

        const head = el('div', 'dya-card__header kanban-column-head')
        const title = el('span', 'dya-label kanban-column-title', label)
        const count = el('span', 'kanban-count', '0')
        head.append(title, count)

        const scroller = el('div', 'kanban-scroll')
        const list = el('div', 'kanban-list')
        list.setAttribute('role', 'list')
        const indicator = el('div', 'kanban-indicator')
        indicator.hidden = true
        /*
         * An empty column says nothing. It used to say "nothing here", and a board at rest has six
         * or seven empty columns, so the sentence appeared seven times across the widest part of
         * the screen and was the loudest thing on a board whose actual content was one card. The
         * count in the header already says the column is empty. What is left is a drop target,
         * which needs a box and no words.
         */
        const empty = el('div', 'kanban-drop')

        if (status === 'triage') {
            const plus = el('button', 'dya-key kanban-new-key', '+')
            plus.type = 'button'
            plus.setAttribute('aria-label', 'new card')
            withTip(plus, 'a new card in triage')
            const draft = el('div', 'kanban-new')
            draft.hidden = true
            const field = el('input', 'dya-field dya-field--sm')
            field.type = 'text'
            field.placeholder = 'card title, enter to add'
            field.spellcheck = false
            draft.appendChild(field)
            const dismiss = (): void => {
                draft.hidden = true
                field.value = ''
            }
            plus.addEventListener('click', () => {
                draft.hidden = false
                field.focus()
            })
            field.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') dismiss()
                if (event.key === 'Enter') void add(field.value).then(dismiss)
            })
            field.addEventListener('blur', () => {
                if (!field.value.trim()) dismiss()
            })
            head.appendChild(plus)
            scroller.appendChild(draft)
        }

        const fold = el('button', 'dya-key kanban-fold')
        fold.type = 'button'
        const apply = (closed: boolean): void => {
            shell.dataset.collapsed = String(closed)
            fold.textContent = closed ? '+' : '−'
            withTip(fold, closed ? `show ${label}` : `fold ${label}`)
            fold.setAttribute('aria-expanded', String(!closed))
        }
        apply(folded(status))
        fold.addEventListener('click', () => {
            const next = shell.dataset.collapsed !== 'true'
            write(foldKey(status), String(next))
            apply(next)
        })
        head.appendChild(fold)

        scroller.append(list, empty, indicator)
        shell.append(head, scroller)
        board.appendChild(shell)

        return { status, root: shell, scroller, list, indicator, count, empty }
    }

    const buildCard = (card: Card): CardNode => {
        const shell = el('article', 'dya-card kanban-card')
        shell.dataset.card = card.id
        shell.setAttribute('role', 'listitem')
        shell.tabIndex = -1

        const title = el('div', 'kanban-card-title')
        const foot = el('div', 'kanban-card-foot')
        const dot = el('span', 'kanban-dot')
        const note = el('span', 'kanban-card-note')
        foot.append(dot, note)
        shell.append(title, foot)

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

        return { root: shell, title, dot, note }
    }

    const paintCard = (card: Card): CardNode => {
        let node = nodes.get(card.id)
        if (!node) {
            node = buildCard(card)
            nodes.set(card.id, node)
        }

        const status = shown(card)
        const tone = rules?.tone[status] ?? 'idle'
        const blocked = card.parents.length > 0 && status === 'todo'
        const live = status === 'running' ? progress.get(card.id) : undefined
        const bits: string[] = []

        if (live) {
            bits.push(live.waiting ? 'waiting on you' : (live.tool ?? live.state))
            bits.push(ago(live.startedAt, clock))
            if (live.outputTokens) bits.push(`${tokens(live.inputTokens + live.outputTokens)} tok`)
        } else {
            if (card.priority) bits.push(`p${card.priority}`)
            if (status === 'blocked' && card.blockKind) bits.push(card.blockKind.replace('_', ' '))
            if (status === 'scheduled' && card.scheduledFor) bits.push(when(card.scheduledFor))
            if (blocked) bits.push(`${card.parents.length} open`)
            if (card.comments.length) bits.push(`${card.comments.length} notes`)
            bits.push(ago(card.updatedAt, clock))
        }

        node.title.textContent = card.title
        node.dot.dataset.tone = tone
        node.note.textContent = bits.join(' · ')
        node.root.dataset.status = status
        node.root.dataset.locked = String(card.locked)
        node.root.dataset.waiting = String(live?.waiting === true)
        node.root.dataset.selected = String(selected === card.id)
        node.root.dataset.marked = String(marked.has(card.id))
        node.root.dataset.problem = String(problems.has(card.id))
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

        meter.hidden = meta === null || cards.length === 0
        meter.textContent = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
        meter.title = meta ? `${meta.name} · ${meta.workdir}` : ''
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
        show('form')
        setup.dataset.mode = 'welcome'
        setup.replaceChildren()

        const open = registry.filter((entry) => !entry.archived)
        if (missing && !open.some((entry) => entry.slug === missing)) {
            const gone = el('div', 'dya-empty')
            gone.append(
                el('span', 'dya-title', 'That board is gone'),
                el('span', 'dya-text', `'${missing}' was deleted or archived.`)
            )
            const actions = el('div', 'dya-empty__actions')
            const pick = el('button', 'dya-button dya-button--primary', 'choose another')
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
        setup.appendChild(open.length > 0 ? buildBoardChooser(open) : buildBoardForm())
    }

    /*
     * One labelled row of a form. The explanation, when there is one, is a tip on the label: it is
     * needed once, by somebody who has not met the field before, and a sentence that is always on
     * screen to serve that reader buries the field from everybody else.
     */
    const field = (form: HTMLElement, label: string, control: HTMLElement, hint?: string): void => {
        const name = el('span', 'dya-label', label)
        if (hint) withTip(name, hint)
        form.append(name, control)
    }

    const buildBoardForm = (): HTMLElement => {
        const shell = el('div', 'dya-card kanban-setup-shell kanban-welcome')
        const heading = el('div', 'dya-title', 'Make a board')
        const label = el('div', 'dya-lede', 'A board is a project, and its cards go to an agent working in it.')

        const form = el('div', 'dya-form')

        const name = el('input', 'dya-field')
        name.type = 'text'
        name.placeholder = 'what the project is called'

        const dirRow = el('div', 'kanban-row')
        const dir = el('input', 'dya-field')
        dir.type = 'text'
        dir.placeholder = 'absolute path'
        dir.spellcheck = false
        const browse = el('button', 'dya-button dya-button--quiet dya-button--sm', 'browse')
        browse.type = 'button'
        dirRow.append(dir, browse)

        const create = el('button', 'dya-button dya-button--primary', 'create board')
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

        field(form, 'name', name)
        field(form, 'directory', dirRow, 'where the agent works: the project this board is about')
        const actions = el('div', 'dya-form__actions')
        actions.append(create)
        form.append(actions)

        shell.append(heading, label, form)
        return shell
    }

    const showBoardSettings = (): void => {
        if (!meta) return
        const current = meta
        void invoke<Settings>('settings')
            .then((across) => {
                show('form')
                setup.dataset.mode = 'settings'
                setup.replaceChildren(buildBoardSettings(current, across))
            })
            .catch(fail)
    }

    let catalogue: HarnessInfo[] = []
    void invoke<HarnessInfo[]>('harnesses')
        .then((list) => {
            catalogue = list
        })
        .catch(fail)

    const choose = (
        what: string,
        current: string,
        values: string[],
        labels: Record<string, string>,
        disabled: boolean,
        apply: (value: string) => void
    ): HTMLElement => {
        const wrap = el('span', 'dya-select kanban-select')
        const select = el('select', 'dya-field dya-field--sm')
        select.disabled = disabled
        select.setAttribute('aria-label', what)
        for (const value of values) {
            const option = el('option', undefined, labels[value] ?? value)
            option.value = value
            option.selected = value === current
            select.appendChild(option)
        }
        select.addEventListener('change', () => apply(select.value))
        wrap.appendChild(select)
        return wrap
    }

    /*
     * One row per phase: harness, model, effort. A card inherits from its board what it
     * leaves blank, so a blank is labelled with what it inherits rather than with nothing,
     * and the model list is the chosen harness's own. A name the list does not carry is
     * typed into the field that appears when the last entry is picked.
     */
    const runnerRow = (
        current: Runner,
        above: Runner | null,
        disabled: boolean,
        apply: (next: Partial<Runner>) => void
    ): HTMLElement => {
        const row = el('div', 'kanban-row kanban-runner')
        const fallback = catalogue[0]?.id ?? 'claude'
        const harnessLabels: Record<string, string> = {
            '': above ? `board · ${above.harness ?? fallback}` : `default · ${fallback}`
        }
        for (const entry of catalogue) {
            harnessLabels[entry.id] = entry.available ? entry.label : `${entry.label}, not on PATH`
        }
        const chosen = current.harness ?? above?.harness ?? fallback
        const info = catalogue.find((entry) => entry.id === chosen)

        row.appendChild(
            choose('harness', current.harness ?? '', ['', ...catalogue.map((entry) => entry.id)], harnessLabels, disabled, (value) =>
                apply({ harness: (value || null) as Runner['harness'] })
            )
        )

        const models = info?.models ?? []
        const listed = current.model === null || models.includes(current.model)
        const modelLabels: Record<string, string> = {
            '': above?.model ? `board · ${above.model}` : 'default',
            [OTHER]: 'another name\u2026'
        }
        const custom = el('input', 'dya-field dya-field--sm')
        custom.type = 'text'
        custom.spellcheck = false
        custom.placeholder = 'full model name'
        custom.disabled = disabled
        custom.hidden = listed
        custom.value = listed ? '' : (current.model ?? '')
        custom.addEventListener('change', () => apply({ model: custom.value.trim() || null }))
        const modelCell = el('div', 'kanban-model')
        modelCell.appendChild(
            choose('model', listed ? (current.model ?? '') : OTHER, ['', ...models, OTHER], modelLabels, disabled, (value) => {
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
            const effortLabels: Record<string, string> = {
                '': above?.effort ? `board · ${above.effort}` : 'default'
            }
            row.appendChild(
                choose('effort', current.effort ?? '', ['', ...info.efforts], effortLabels, disabled, (value) =>
                    apply({ effort: value || null })
                )
            )
        } else {
            row.appendChild(el('span', 'kanban-setting', 'no effort setting'))
        }
        return row
    }

    const capField = (value: number, note: string): HTMLInputElement => {
        const field = el('input', 'dya-field dya-field--sm kanban-cap')
        field.type = 'number'
        field.min = '0'
        field.max = '10'
        field.step = '1'
        field.value = String(value)
        field.title = note
        return field
    }

    const buildBoardSettings = (current: BoardMeta, across: Settings): HTMLElement => {
        const shell = el('div', 'kanban-setup-shell')
        const heading = el('div', 'kanban-setup-head')
        heading.append(el('span', 'dya-title', current.name))
        const slug = el('span', 'dya-mono dya-text', current.slug)
        withTip(slug, 'names this board\u2019s storage on disk, and never changes')
        heading.append(slug)

        const form = el('div', 'dya-form')

        const name = el('input', 'dya-field')
        name.type = 'text'
        name.value = current.name

        const dirRow = el('div', 'kanban-row')
        const dir = el('input', 'dya-field')
        dir.type = 'text'
        dir.spellcheck = false
        dir.value = current.workdir
        const browse = el('button', 'dya-button dya-button--quiet dya-button--sm', 'browse')
        browse.type = 'button'
        browse.addEventListener('click', () => {
            void invoke<string | null>('pickWorkdir')
                .then((picked) => {
                    if (picked) dir.value = picked
                })
                .catch(fail)
        })
        dirRow.append(dir, browse)

        const CAP_HINT =
            '0 pauses it: nothing new is claimed and what is running finishes. A reviewer you ask ' +
            'for by hand starts regardless.'
        const capsRow = el('div', 'kanban-row')
        const boardCap = capField(current.maxRunning ?? 1, 'on this board')
        const globalCap = capField(across.maxRunning, 'across every board')
        capsRow.append(boardCap, el('span', 'dya-label', 'everywhere'), globalCap)

        const runnersGrid = el('div', 'kanban-settings')
        const draft: Runners = {
            implement: { ...current.runners.implement },
            review: { ...current.runners.review }
        }
        const renderRunners = (): void => {
            runnersGrid.replaceChildren(
                el('span', 'kanban-setting', 'implement'),
                runnerRow(draft.implement, null, false, (next) => {
                    Object.assign(draft.implement, next)
                    renderRunners()
                }),
                el('span', 'kanban-setting', 'review'),
                runnerRow(draft.review, null, false, (next) => {
                    Object.assign(draft.review, next)
                    renderRunners()
                })
            )
        }
        renderRunners()

        const save = el('button', 'dya-button dya-button--primary', 'save')
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
                    say(`${name.value} saved`)
                    return refresh()
                })
                .catch(fail)
        })

        const back = el('button', 'dya-button dya-button--quiet', 'cancel')
        back.type = 'button'
        back.addEventListener('click', () => void refresh().catch(fail))

        const archive = el('button', 'dya-button dya-button--quiet dya-button--sm dya-form__push', 'archive')
        archive.type = 'button'
        withTip(archive, 'the files are kept and the board leaves the picker')
        archive.addEventListener('click', () => {
            if (!window.confirm(`Archive ${current.name}? Its cards and files are kept, and it leaves the picker.`)) {
                return
            }
            void invoke('archiveBoard', current.slug, true)
                .then(() => {
                    write(pinKey, '')
                    say(`${current.name} archived`)
                    return refresh()
                })
                .catch(fail)
        })

        const remove = el('button', 'dya-button dya-button--danger dya-button--sm', 'delete')
        remove.type = 'button'
        remove.addEventListener('click', () => {
            const warning =
                `Delete ${current.name}? Its cards, their run history and every artifact a run left ` +
                `go with it, and none of that is recoverable. ${current.workdir} itself is NOT touched, ` +
                'and neither are the worktrees any run left in it.'
            if (!window.confirm(warning)) return
            void invoke('deleteBoard', current.slug)
                .then(() => {
                    write(pinKey, '')
                    say(`${current.name} deleted`)
                    return refresh()
                })
                .catch(fail)
        })

        const actions = el('div', 'dya-form__actions')
        actions.append(save, back, archive, remove)

        field(form, 'name', name)
        field(form, 'directory', dirRow, 'where the agent works: the project this board is about')
        field(form, 'workers', capsRow, CAP_HINT)
        field(
            form,
            'phases',
            runnersGrid,
            'which harness, model and effort run each phase, unless a card says otherwise. A ' +
                'reviewer on a different model than the implementer is a better judge of it.'
        )
        form.append(actions)

        shell.append(heading, form)
        return shell
    }

    const openBoardMenu = (anchor: HTMLElement): void => {
        const rows: MenuRow[] = registry
            .filter((entry) => !entry.archived)
            .map((entry) => ({
                key: entry.slug,
                label: entry.name,
                group: 'boards',
                direct: true,
                selected: entry.slug === meta?.slug,
                note: entry.workdir,
                leaves: [{ label: entry.name, value: entry.slug }]
            }))

        if (!rows.length) {
            newBoard()
            return
        }

        openMenu({
            anchor,
            rows,
            filter: 'filter boards',
            onPick: (row) => {
                write(pinKey, row.key)
                void refresh().catch(fail)
            }
        })
    }

    const buildBoardChooser = (open: BoardMeta[]): HTMLElement => {
        const shell = el('div', 'kanban-setup-shell kanban-chooser')
        shell.append(el('div', 'dya-title', 'Pick up where you left off'))

        const grid = el('div', 'kanban-chooser-grid')
        for (const entry of open) {
            const tile = el('button', 'dya-tile')
            tile.type = 'button'
            tile.append(el('span', 'dya-tile__name', entry.name))
            tile.append(el('span', 'dya-tile__note kanban-chooser-path', entry.workdir))
            tile.addEventListener('click', () => {
                write(pinKey, entry.slug)
                void refresh().catch(fail)
            })
            grid.append(tile)
        }
        shell.append(grid)

        const actions = el('div', 'dya-form__actions')
        const make = el('button', 'dya-button dya-button--quiet', 'new board')
        make.type = 'button'
        make.addEventListener('click', () => newBoard())
        actions.append(make)
        shell.append(actions)
        return shell
    }

    const newBoard = (): void => {
        meta = null
        columns.clear()
        nodes.clear()
        board.replaceChildren()
        show('form')
        setup.dataset.mode = 'welcome'
        setup.replaceChildren(buildBoardForm())
    }

    const worktreeNote = (tree: Worktree): string => {
        if (tree.live) return 'a worker is in it'
        if (tree.dirty) return 'it holds changes nobody committed'
        if (tree.landed) return 'landed, removable'
        return `${tree.ahead} commit${tree.ahead === 1 ? '' : 's'} nothing has landed`
    }

    const openWorktreeMenu = (anchor: HTMLElement): void => {
        void invoke<Worktree[]>('worktrees', meta?.slug)
            .then((trees) => {
                if (!trees.length) {
                    say('this project holds no worktree from this board')
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
                    filter: 'filter worktrees',
                    onPick: (row) => {
                        const tree = trees.find((entry) => entry.path === row.key)
                        if (!tree) return
                        const name = tree.branch ?? tree.path
                        if (tree.live || tree.dirty || !tree.landed) {
                            say(`${name} cannot go yet: ${worktreeNote(tree)}`)
                            return
                        }
                        if (!window.confirm(`Remove ${name}? Its commits are already in the project, and its working tree goes with it.`)) {
                            return
                        }
                        void invoke('removeWorktree', meta?.slug, tree.path)
                            .then(() => {
                                say(`${name} removed`)
                                return refresh()
                            })
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
            `Every run leaves a worktree under .claude/worktrees inside ${created.workdir}, and that project does not ignore it, so it will show up in git status. Exclude it? Only this clone is changed and no tracked file is touched.`
        )
        if (!asked) return
        await invoke('addIgnore', created.slug).catch(fail)
    }

    const markable = (): Card[] => cards.filter((card) => marked.has(card.id))

    function paintMarks(): void {
        for (const [id, node] of nodes) node.root.dataset.marked = String(marked.has(id))

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

        const count = el('span', 'kanban-card-note', `${chosen.length} selected`)
        const moveAll = el('button', 'dya-button dya-button--sm', 'move')
        moveAll.type = 'button'
        moveAll.disabled = targets.length === 0
        moveAll.title = targets.length
            ? 'the states every selected card may go to'
            : 'these cards have no state they can all go to'
        moveAll.addEventListener('click', () => {
            if (!table) return
            openMenu({
                anchor: moveAll,
                rows: targets.map((status) => ({
                    key: status,
                    label: table.labels[status],
                    group: `move ${chosen.length} to`,
                    direct: true,
                    leaves: [{ label: table.labels[status], value: status }]
                })),
                filter: 'filter states',
                onPick: (row) => bulkMove(row.key as Status)
            })
        })

        const removeAll = el('button', 'dya-button dya-button--sm dya-button--danger', 'delete')
        removeAll.type = 'button'
        removeAll.addEventListener('click', () => bulkDelete())

        const clear = el('button', 'dya-button dya-button--quiet dya-button--sm', 'clear')
        clear.type = 'button'
        clear.addEventListener('click', () => clearMarks())

        marks.append(count, el('span', 'kanban-spacer'), moveAll, removeAll, clear)
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
        if (!result.refused.length) {
            say(`${result.done.length} ${verb}`)
            return
        }
        if (!result.done.length) {
            say(`nothing ${verb}. ${name}: ${first.why}`)
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
        const warning =
            `Delete ${chosen.length} cards? Their run history and every artifact those runs left go ` +
            'with them, and none of that is recoverable.'
        if (!window.confirm(warning)) return

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
        if (!targets.length) {
            say(`a card in ${shown(card)} cannot be moved`)
            return
        }

        openMenu({
            anchor,
            rows: targets.map((status) => ({
                key: status,
                label: table.labels[status],
                group: 'move to',
                direct: true,
                leaves: [{ label: table.labels[status], value: status }]
            })),
            filter: 'filter states',
            onPick: (row) => move(id, row.key as Status)
        })
    }

    const settle = (id: string): void => {
        const timer = pending.get(id)
        if (timer) window.clearTimeout(timer)
        pending.delete(id)
        const node = nodes.get(id)
        if (node) delete node.root.dataset.pending
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
        if (node) node.root.dataset.pending = 'true'
        pending.set(
            id,
            window.setTimeout(() => say(`still moving ${card.title}`), SLOW_MS)
        )

        if (!prompt) {
            optimistic.set(id, to)
            reconcile()
        }

        void invoke<Card>('moveCard', meta?.slug, id, card.rev, to)
            .then((updated) => {
                settle(id)
                optimistic.delete(id)
                solved(id)
                say(`${updated.title} moved to ${updated.status}`)
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
        for (const [key, node] of nodes) node.root.dataset.selected = String(key === id)
        paintDrawer()
    }

    const closeTerminal = (): void => {
        terminal?.dispose()
        terminal = null
        terminalFor = ''
        stageView.replaceChildren()
        stage.hidden = true
        drawer.dataset.stage = 'false'
    }

    const paintHistory = (card: Card, into: HTMLElement): void => {
        void invoke<HistoryRow[]>('runEvents', meta?.slug, card.id)
            .then((rows) => {
                if (!into.isConnected) return
                into.replaceChildren()
                if (!rows.length) {
                    into.appendChild(el('div', 'dya-empty', 'no transcript for this run: the CLI keeps that file, and it is gone'))
                    return
                }
                const stick = into.scrollTop + into.clientHeight >= into.scrollHeight - 8
                for (const row of rows) into.appendChild(historyRow(row))
                if (stick) into.scrollTop = into.scrollHeight
            })
            .catch((thrown: unknown) => failOn(card.id, thrown))
    }

    const paintEvents = (card: Card, into: HTMLElement): void => {
        void invoke<BoardEvent[]>('events', meta?.slug, card.id)
            .then((rows) => {
                if (!into.isConnected) return
                into.replaceChildren()
                if (!rows.length) {
                    into.appendChild(
                        el('div', 'dya-empty', 'the board has decided nothing about this card yet')
                    )
                    return
                }
                for (const row of rows) into.appendChild(eventRow(row))
                into.scrollTop = into.scrollHeight
            })
            .catch((thrown: unknown) => failOn(card.id, thrown))
    }

    const eventRow = (row: BoardEvent): HTMLElement => {
        const node = el('div', 'kanban-row-entry')
        node.dataset.kind = row.kind
        const head = el('div', 'kanban-row-head')
        head.append(
            el('span', 'dya-badge dya-badge--soft', row.kind.replace('_', ' ')),
            el('span', 'kanban-card-note', `${when(row.at)}${row.detail ? ` · ${row.detail}` : ''}`)
        )
        node.append(head)
        return node
    }

    const historyRow = (row: HistoryRow): HTMLElement => {
        const node = el('div', 'kanban-row-entry')
        node.dataset.kind = row.kind
        node.dataset.error = String(row.error)

        if (row.kind === 'text') {
            node.appendChild(el('div', 'kanban-comment-text', row.body))
            return node
        }

        const head = el('button', 'kanban-row-head')
        head.type = 'button'
        const label =
            row.kind === 'tool'
                ? row.label
                : row.kind === 'result'
                  ? (row.error ? 'error' : 'result')
                  : row.kind
        head.append(
            el('span', 'dya-badge dya-badge--soft', label),
            el('span', 'kanban-card-note', row.kind === 'tool' ? row.body : row.body.slice(0, 90))
        )

        const body = el('pre', 'kanban-row-body', row.body)
        body.hidden = true
        head.addEventListener('click', () => {
            body.hidden = !body.hidden
        })

        node.append(head, body)
        return node
    }

    const syncTerminal = (card: Card): void => {
        const run = card.runs[card.runs.length - 1]
        const live = shown(card) === 'running' && run !== undefined
        const wanted = tab === 'board' ? `board:${card.id}:${card.rev}` : run ? `${tab}:${card.id}:${run.runId}` : ''

        if (wanted === terminalFor) return
        closeTerminal()
        if (!wanted) return

        terminalFor = wanted
        stage.hidden = false
        drawer.dataset.stage = 'true'

        if (tab === 'board') {
            const list = el('div', 'kanban-history')
            stageView.replaceChildren(list)
            paintEvents(card, list)
            return
        }

        if (tab === 'history' || !live) {
            const list = el('div', 'kanban-history')
            stageView.replaceChildren(list)
            paintHistory(card, list)
            return
        }

        const view = el('div', 'kanban-terminal')
        stageView.replaceChildren(view)
        terminal = openTerminal(ctx, view, meta?.slug ?? '', card.id, (thrown) => {
            closeTerminal()
            failOn(card.id, thrown)
        })
    }

    const paintDrawer = (): void => {
        const card = selected ? cardById(selected) : undefined
        if (!card || !rules) {
            closeTerminal()
            drawer.hidden = true
            drawer.replaceChildren()
            drawnId = null
            drawnRev = -1
            applySize()
            return
        }

        if (drawnId === card.id && drawnRev === card.rev) {
            const label = drawer.querySelector('.kanban-drawer-state')
            if (label) label.textContent = rules.labels[shown(card)]
            syncTerminal(card)
            return
        }

        drawnId = card.id
        drawnRev = card.rev
        drawer.hidden = false
        drawer.replaceChildren()
        applySize()

        const head = el('div', 'dya-card__header kanban-drawer-head')
        const heading = el('span', 'dya-tag kanban-drawer-state', rules.labels[shown(card)])
        const named = el('span', 'dya-text kanban-drawer-title', card.title)
        const sizeKey = key('expand', 'take the whole panel')
        const paintSize = (): void => {
            const full = inspector === 'full'
            sizeKey.innerHTML = ICONS[full ? 'contract' : 'expand']
            sizeKey.setAttribute('aria-label', full ? 'back to half the panel' : 'take the whole panel')
            sizeKey.setAttribute('aria-pressed', String(full))
            withTip(sizeKey, full ? 'back to half the panel, board beside it' : 'take the whole panel')
        }
        paintSize()
        sizeKey.addEventListener('click', () => {
            inspector = inspector === 'full' ? 'half' : 'full'
            write(sizeStore, inspector)
            applySize()
            paintSize()
        })

        const tabs = el('div', 'dya-tabs kanban-tabs')
        tabs.setAttribute('role', 'tablist')
        for (const name of ['terminal', 'history', 'board'] as const) {
            const button = el('button', 'dya-tab', name)
            button.type = 'button'
            button.setAttribute('role', 'tab')
            button.setAttribute('aria-selected', String(tab === name))
            button.addEventListener('click', () => {
                if (tab === name) return
                tab = name
                drawnRev = -1
                paintDrawer()
            })
            tabs.appendChild(button)
        }

        const close = key('close', 'close the card')
        close.addEventListener('click', () => select(null))
        head.append(heading, named, sizeKey, close)
        stage.replaceChildren(tabs, stageView)

        const form = el('div', 'kanban-form')

        const problem = problems.get(card.id)
        const problemRow = el('div', 'kanban-problem')
        problemRow.hidden = problem === undefined
        if (problem) problemRow.textContent = problem

        const titleGroup = el('div', 'kanban-group')
        titleGroup.append(el('span', 'dya-label', 'title'))
        const title = el('input', 'dya-field')
        title.type = 'text'
        title.value = card.title
        title.addEventListener('change', () => patch(card.id, { title: title.value }))
        titleGroup.appendChild(title)

        const bodyGroup = el('div', 'kanban-group kanban-grow')
        bodyGroup.append(el('span', 'dya-label', 'brief'))
        const text = el('textarea', 'dya-field kanban-body-field')
        text.value = card.body
        text.addEventListener('change', () => patch(card.id, { body: text.value }))
        bodyGroup.appendChild(text)

        const priority = el('input', 'dya-field dya-field--sm')
        priority.type = 'number'
        priority.value = String(card.priority)
        priority.addEventListener('change', () => patch(card.id, { priority: Number(priority.value) }))

        const settingsGroup = el('div', 'kanban-group')
        settingsGroup.append(el('span', 'dya-label', 'settings'))
        const settings = el('div', 'kanban-settings')

        const number = (value: number | null, unit: string, apply: (next: number | null) => void): HTMLInputElement => {
            const input = el('input', 'dya-field dya-field--sm')
            input.type = 'number'
            input.min = '1'
            input.placeholder = unit
            input.disabled = card.locked
            if (value !== null) input.value = String(value)
            input.addEventListener('change', () => {
                const parsed = Number(input.value)
                apply(input.value.trim() && parsed > 0 ? Math.round(parsed) : null)
            })
            return input
        }

        const phase = (kind: keyof Runners): HTMLElement =>
            runnerRow(card.runners[kind], meta?.runners[kind] ?? null, card.locked, (next) =>
                patch(card.id, { runners: { [kind]: next } satisfies RunnersPatch })
            )

        const override = el('input', 'dya-field dya-field--sm')
        override.type = 'text'
        override.spellcheck = false
        override.placeholder = meta?.workdir ?? 'the board directory'
        override.disabled = card.locked
        override.value = card.workdir ?? ''
        override.addEventListener('change', () => patch(card.id, { workdir: override.value.trim() || null }))

        const browse = el('button', 'dya-button dya-button--quiet dya-button--sm', 'browse')
        browse.type = 'button'
        browse.disabled = card.locked
        browse.addEventListener('click', () => {
            void invoke<string | null>('pickWorkdir')
                .then((picked) => (picked ? patch(card.id, { workdir: picked }) : undefined))
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        const overrideRow = el('div', 'kanban-row')
        overrideRow.append(override, browse)

        const labelled = Object.fromEntries(WORKSPACES) as Record<string, string>

        settings.append(
            el('span', 'kanban-setting', 'priority'),
            priority,
            el('span', 'kanban-setting', 'permission'),
            choose('permission mode', card.permissionMode, PERMISSIONS, {}, card.locked, (value) =>
                patch(card.id, { permissionMode: value })
            ),
            el('span', 'kanban-setting', 'workspace'),
            choose('workspace', card.workspaceKind, ['dir', 'scratch'], labelled, card.locked, (value) =>
                patch(card.id, { workspaceKind: value as Card['workspaceKind'] })
            ),
            el('span', 'kanban-setting', 'directory'),
            overrideRow,
            el('span', 'kanban-setting', 'runtime cap'),
            number(card.maxRuntimeSeconds, 'seconds, blank for none', (next) =>
                patch(card.id, { maxRuntimeSeconds: next })
            ),
            el('span', 'kanban-setting', 'retries'),
            number(card.maxRetries, 'blank for the default 2', (next) =>
                patch(card.id, { maxRetries: next })
            )
        )
        settingsGroup.appendChild(settings)

        const runnersGrid = el('div', 'kanban-runners')
        runnersGrid.append(
            el('span', 'kanban-setting'),
            el('span', 'dya-label', 'harness'),
            el('span', 'dya-label', 'model'),
            el('span', 'dya-label', 'effort'),
            el('span', 'kanban-setting', 'implement'),
            phase('implement'),
            el('span', 'kanban-setting', 'review'),
            phase('review')
        )
        settingsGroup.appendChild(runnersGrid)

        const filesGroup = el('div', 'kanban-group')
        filesGroup.append(el('span', 'dya-label', 'files'))
        const files = el('div', 'dya-pills')

        for (const file of card.attachments ?? []) {
            const holder = el('span', 'kanban-file')
            const open = el('button', 'dya-chip', `${file.name} · ${size(file.bytes)}`)
            open.type = 'button'
            open.title = 'show this file on disk'
            open.addEventListener('click', () => {
                void invoke('reveal', meta?.slug, card.id, file.name).catch((thrown: unknown) =>
                    failOn(card.id, thrown)
                )
            })
            const drop = el('button', 'dya-key', '×')
            drop.type = 'button'
            drop.title = `remove ${file.name} from this card`
            drop.disabled = card.locked
            drop.addEventListener('click', () => {
                if (!window.confirm(`Remove ${file.name}? The file goes from the card and from disk.`)) {
                    return
                }
                void invoke('removeAttachment', meta?.slug, card.id, file.name)
                    .then(() => {
                        solved(card.id)
                        return refresh()
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            holder.append(open, drop)
            files.appendChild(holder)
        }

        const addFile = el('button', 'dya-button dya-button--quiet dya-button--sm', 'add files')
        addFile.type = 'button'
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
                        failOn(card.id, `too big to attach, 25 MB is the cap: ${answer.refused.join(', ')}`)
                    } else {
                        solved(card.id)
                    }
                    return refresh()
                })
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        filesGroup.append(files, addFile)

        const depsGroup = el('div', 'kanban-group')
        depsGroup.append(el('span', 'dya-label', 'depends on'))
        const parents = el('div', 'dya-pills')
        for (const parentId of card.parents) {
            const parent = cardById(parentId)
            const chip = el('button', 'dya-chip', parent ? parent.title : parentId)
            chip.type = 'button'
            chip.title = 'remove this dependency'
            chip.addEventListener('click', () =>
                patch(card.id, { parents: card.parents.filter((entry) => entry !== parentId) })
            )
            parents.appendChild(chip)
        }
        const addParent = el('button', 'dya-button dya-button--quiet dya-button--sm', 'add dependency')
        addParent.type = 'button'
        addParent.addEventListener('click', () => openParentMenu(card, addParent))
        depsGroup.append(parents, addParent)

        const notesGroup = el('div', 'kanban-group')
        notesGroup.append(el('span', 'dya-label', 'thread'))
        for (const entry of card.comments) {
            const item = el('div', 'kanban-comment')
            const itemHead = el('div', 'kanban-comment-head')
            itemHead.append(
                el('span', 'dya-badge dya-badge--soft', entry.author),
                el('span', 'kanban-card-note', ago(entry.at, clock))
            )
            item.append(itemHead, el('div', 'kanban-comment-text', entry.text))
            notesGroup.appendChild(item)
        }

        const note = el('textarea', 'dya-field')
        note.placeholder = 'leave a note for the next run'
        note.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
            event.preventDefault()
            const value = note.value.trim()
            if (!value) return
            void invoke('comment', meta?.slug, card.id, value)
                .then(() => {
                    solved(card.id)
                    return refresh()
                })
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        notesGroup.appendChild(note)

        const runsGroup = el('div', 'kanban-group')
        if (card.runs.length) {
            runsGroup.append(el('span', 'dya-label', 'runs'))
            for (const run of [...card.runs].reverse().slice(0, 6)) {
                const row = el('div', 'kanban-run')
                const dot = el('span', 'kanban-dot')
                dot.dataset.tone =
                    run.outcome === 'completed'
                        ? 'success'
                        : run.outcome === null
                          ? 'accent'
                          : run.outcome === 'blocked'
                            ? 'warning'
                            : 'idle'
                const kind = run.kind === 'review' ? 'review · ' : ''
                const label = el(
                    'span',
                    'kanban-card-note',
                    `${kind}${run.outcome ?? 'running'} · ${tokens(run.inputTokens + run.outputTokens)} tok · ${ago(run.startedAt, clock)}`
                )
                row.append(dot, label)
                if (run.branch) {
                    const branch = el('span', 'dya-tag', run.branch)
                    branch.title = run.worktree ?? ''
                    row.append(branch)
                }
                for (const name of [...(run.kept ?? []), ...(run.handoff ?? [])]) {
                    const file = el('button', 'dya-chip', name)
                    file.type = 'button'
                    file.title = (run.handoff ?? []).includes(name)
                        ? 'handed to the next worker on this card; show it on disk'
                        : 'show this artifact on disk'
                    file.addEventListener('click', () => {
                        void invoke('reveal', meta?.slug, card.id, name).catch((thrown: unknown) =>
                            failOn(card.id, thrown)
                        )
                    })
                    row.append(file)
                }
                if (run.summary) row.append(el('div', 'kanban-comment-text', run.summary))
                runsGroup.appendChild(row)
            }
        }

        const scheduleGroup = el('div', 'kanban-group')
        if (shown(card) === 'ready' || shown(card) === 'scheduled') {
            scheduleGroup.append(el('span', 'dya-label', 'park until'))
            const row = el('div', 'kanban-row')
            const at = el('input', 'dya-field dya-field--sm')
            at.type = 'datetime-local'
            if (card.scheduledFor) at.value = local(card.scheduledFor)
            const park = el('button', 'dya-button dya-button--quiet dya-button--sm', 'park')
            park.type = 'button'
            park.addEventListener('click', () => {
                const at2 = at.value ? new Date(at.value).getTime() : 0
                if (!at2 || Number.isNaN(at2)) {
                    say('that is not a time this card can wait for')
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
            row.append(at, park)
            scheduleGroup.appendChild(row)
        }

        const actions = el('div', 'kanban-row')

        if (shown(card) === 'blocked') {
            const back = el('button', 'dya-button dya-button--sm', 'unblock')
            back.type = 'button'
            back.title = `returns it to ${card.sourcePhase ?? 'ready'}, or to todo while parents are open`
            back.addEventListener('click', () => {
                void invoke<Card>('unblock', meta?.slug, card.id, card.rev)
                    .then((next) => {
                        solved(card.id)
                        say(`${next.title} returned to ${next.status}`)
                        return refresh()
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            actions.append(back)
        }

        if (shown(card) === 'review') {
            const approve = el('button', 'dya-button dya-button--sm', 'approve')
            approve.type = 'button'
            approve.addEventListener('click', () => move(card.id, 'done'))
            const changes = el('button', 'dya-button dya-button--quiet dya-button--sm', 'request changes')
            changes.type = 'button'
            changes.addEventListener('click', () => move(card.id, 'ready'))
            const ask = el('button', 'dya-button dya-button--quiet dya-button--sm', 'ask a reviewer')
            ask.type = 'button'
            ask.title = 'starts a second session that reads the branch and judges it'
            ask.addEventListener('click', () => {
                void invoke('reviewCard', meta?.slug, card.id)
                    .then(() => {
                        say(`a reviewer is reading ${card.title}`)
                        return refresh()
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            actions.append(approve, changes, ask)
        }

        if (shown(card) === 'running') {
            const stop = el('button', 'dya-button dya-button--sm dya-button--danger', 'stop')
            stop.type = 'button'
            stop.addEventListener('click', () => {
                if (!window.confirm(`Stop the worker on '${card.title}'? Its conversation is kept.`)) return
                void invoke('stopCard', meta?.slug, card.id)
                    .then(() => {
                        solved(card.id)
                        return refresh()
                    })
                    .catch((thrown: unknown) => failOn(card.id, thrown))
            })
            actions.append(stop)
        }
        const moveButton = el('button', 'dya-button dya-button--sm', 'move')
        moveButton.type = 'button'
        moveButton.addEventListener('click', () => openMoveMenu(card.id, moveButton))
        const remove = el('button', 'dya-button dya-button--sm dya-button--danger', 'delete')
        remove.type = 'button'
        remove.addEventListener('click', () => {
            if (!window.confirm(`Delete '${card.title}'? Its history goes with it.`)) return
            void invoke('deleteCard', meta?.slug, card.id)
                .then(() => {
                    problems.delete(card.id)
                    select(null)
                    return refresh()
                })
                .catch((thrown: unknown) => failOn(card.id, thrown))
        })
        actions.append(moveButton, remove)

        form.append(
            problemRow,
            titleGroup,
            bodyGroup,
            filesGroup,
            settingsGroup,
            depsGroup,
            scheduleGroup,
            runsGroup,
            actions,
            notesGroup
        )
        const body = el('div', 'kanban-drawer-body')
        body.append(stage, form)
        drawer.append(head, body)
        syncTerminal(card)
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

        if (!rows.length) {
            say('no other card can be a dependency')
            return
        }

        openMenu({
            anchor,
            rows,
            filter: 'filter cards',
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

    const add = async (raw: string): Promise<void> => {
        const title = raw.trim()
        if (!title || !meta) return
        try {
            const card = await invoke<Card>('createCard', meta.slug, { title })
            say(`${card.title} added to triage`)
            await refresh()
        } catch (thrown) {
            fail(thrown)
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
                if (!found) {
                    say(`a card in ${shown(card)} has no legal move that way`)
                    return
                }
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
        refuse: (id, to) => {
            const card = cardById(id)
            say(`a card cannot go from ${card ? shown(card) : 'here'} to ${to}`)
        },
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
    newBoardKey.addEventListener('click', () => newBoard())
    settingsKey.addEventListener('click', () => showBoardSettings())
    treesKey.addEventListener('click', () => openWorktreeMenu(treesKey))
    watchButton.addEventListener('click', () => {
        if (watching) {
            closeWatch()
            void refresh().catch(fail)
            return
        }
        openWatch()
    })
    healthButton.addEventListener('click', () => showHealth())
    tickButton.addEventListener('click', () => {
        void invoke('dispatchNow')
            .then(() => refresh())
            .catch(fail)
    })
    board.addEventListener('keydown', onBoardKey)
    board.addEventListener('click', (event) => {
        if (!selected || gesturing) return
        const target = event.target as Element
        if (target.closest('.kanban-card, .dya-key, .kanban-new')) return
        select(null)
    })
    drawer.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        select(null)
        if (drawnId) focusCard(drawnId)
    })

    const watchRow = (run: WatchRun): HTMLElement => {
        const row = el('button', 'kanban-watch-run')
        row.type = 'button'
        row.title = 'open this card, and its session'

        const dot = el('span', 'kanban-dot')
        dot.dataset.tone = run.waiting ? 'warning' : 'accent'

        const said = [
            run.board,
            run.kind === 'review' ? 'review' : null,
            ago(run.startedAt, clock),
            run.tool ?? run.state,
            `${tokens(run.inputTokens + run.outputTokens)} tok`
        ]
            .filter(Boolean)
            .join(' · ')

        row.append(dot, el('span', 'dya-text', run.title), el('span', 'kanban-card-note', said))
        if (run.waiting) row.append(el('span', 'dya-tag', 'waiting on you'))

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
         * The headline is the number, not a sentence containing it. Which window holds the
         * dispatcher is a fact about the machine that matters twice a month, so it is a tag with a
         * tip rather than half a line of running text on every refresh.
         */
        /*
         * A masthead, then the boards, then what was decided.
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
        statText.append(
            el('span', 'dya-label', shape.running === 1 ? 'run in flight' : 'runs in flight'),
            el('span', 'dya-stat__note', `${shape.boards.length} boards on this machine`)
        )
        stat.append(figure, statText)
        masthead.append(stat, el('span', 'kanban-spacer'))

        if (shape.across === 0) {
            masthead.append(el('span', 'dya-badge dya-badge--warning', 'paused'))
        }
        const role = el(
            'span',
            `dya-badge ${shape.holding ? 'dya-badge--accent' : 'dya-badge--soft'}`,
            shape.holding ? 'dispatcher' : 'follower'
        )
        withTip(
            role,
            shape.holding
                ? 'this window is the one sweeping the boards'
                : 'another window holds the dispatcher; this one is watching'
        )
        masthead.append(role)
        holder.append(masthead)

        /*
         * A board is a card you can press, and pressing it opens that board — which is what makes
         * the relief honest rather than decorative. The tallies are pills whose hue says which
         * queue they are: a number beside the word "blocked" in the same grey as the number beside
         * "ready" is two facts dressed as one.
         */
        const boardsGroup = el('div', 'kanban-group')
        boardsGroup.append(el('span', 'dya-eyebrow', 'boards'))
        const grid = el('div', 'kanban-board-grid')
        for (const entry of shape.boards) {
            const card = el('button', 'dya-tile dya-tile--dense')
            card.type = 'button'
            card.addEventListener('click', () => {
                write(pinKey, entry.slug)
                closeWatch()
                void refresh().catch(fail)
            })

            const top = el('div', 'dya-tile__head')
            top.append(el('span', 'dya-tile__name', entry.name))
            if (entry.cap === 0) {
                top.append(el('span', 'dya-badge dya-badge--warning dya-badge--soft', 'paused'))
            } else if (entry.running > 0) {
                top.append(el('span', 'dya-badge dya-badge--accent', `${entry.running} running`))
            }
            card.append(top)

            const pills = el('div', 'dya-pills')
            const tallies: [number, string, string][] = [
                [entry.counts.ready, 'ready', 'dya-badge--accent-3'],
                [entry.counts.review, 'in review', 'dya-badge--accent-2'],
                [entry.counts.blocked, 'blocked', 'dya-badge--danger'],
                [
                    entry.counts.todo + entry.counts.triage + entry.counts.scheduled,
                    'waiting',
                    'dya-badge--soft'
                ]
            ]
            const shown = tallies.filter(([n]) => n > 0)
            if (shown.length === 0) {
                pills.append(el('span', 'dya-empty dya-empty--inline', 'nothing queued'))
            } else {
                for (const [n, word, tone] of shown) {
                    pills.append(el('span', `dya-badge dya-badge--soft ${tone}`, `${n} ${word}`))
                }
            }
            card.append(pills)

            /*
             * One mark per worker this board may run, filled while it is, and only where there is
             * more than one: a single pip is a stray dash rather than a meter. Static, because a
             * board being busy is a fact and not something to animate at somebody for as long as
             * the panel is open.
             */
            if (entry.cap > 1) {
                const caps = el('div', 'dya-meter')
                withTip(caps, `${entry.running} of ${entry.cap} workers busy`)
                for (let slot = 0; slot < Math.min(entry.cap, 8); slot += 1) {
                    const pip = el('span', 'dya-meter__pip')
                    pip.dataset.on = String(slot < entry.running)
                    caps.append(pip)
                }
                card.append(caps)
            }

            grid.append(card)
        }
        boardsGroup.append(grid)
        holder.appendChild(boardsGroup)

        /* The section exists when something is in it. */
        if (shape.runs.length) {
            const runsGroup = el('div', 'kanban-group')
            runsGroup.append(el('span', 'dya-eyebrow', 'in flight'))
            for (const run of shape.runs) runsGroup.appendChild(watchRow(run))
            holder.appendChild(runsGroup)
        }

        if (shape.problems.length) {
            const problemGroup = el('div', 'kanban-group')
            problemGroup.append(el('span', 'dya-eyebrow', 'problems'))
            for (const entry of shape.problems) {
                const row = el('div', 'kanban-run')
                row.append(el('span', 'dya-badge dya-badge--warning dya-badge--soft', 'check'))
                const where = shape.boards.find((board) => board.slug === entry.slug)?.name ?? 'this machine'
                row.append(el('span', 'dya-text', where), el('span', 'kanban-card-note', entry.problem))
                problemGroup.appendChild(row)
            }
            holder.appendChild(problemGroup)
        }

        if (shape.decisions.length) {
            const log = el('div', 'kanban-group')
            log.append(el('span', 'dya-eyebrow', 'decided'))
            const logTable = el('table', 'dya-table')
            const logBody = el('tbody')
            for (const row of shape.decisions) {
                const line = el('tr', 'dya-row')
                const gone = row.title === row.cardId
                const lead = gone && row.detail ? row.detail : row.title
                const rest = gone && row.detail ? '' : row.detail

                const kind = el('td', 'dya-table__fit')
                const pill = el(
                    'span',
                    `dya-badge dya-badge--soft ${DECISION_TONE[row.kind] ?? 'dya-badge--soft'}`,
                    row.kind.replace('_', ' ')
                )
                if (gone) withTip(pill, row.cardId)
                kind.append(pill)

                const first = el('td', 'kanban-cell-name', lead)
                line.append(kind, first, el('td', 'kanban-tally', rest))
                line.append(el('td', 'kanban-cell-end', `${row.board} \u00b7 ${when(row.at)}`))
                logBody.appendChild(line)
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
        watch.replaceChildren(el('div', 'dya-empty dya-empty--inline', 'reading every board'))
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

    const health = async (): Promise<void> => {
        const found = await invoke<Diagnostic[]>('diagnostics')
        const mine = found.filter((entry) => entry.slug === meta?.slug || entry.slug === '')
        healthButton.hidden = mine.length === 0
        healthCount.textContent = String(mine.length)
        healthButton.setAttribute('aria-label', `${mine.length} ${mine.length === 1 ? 'problem' : 'problems'}`)
        withTip(
            healthButton,
            `${mine.length} ${mine.length === 1 ? 'problem' : 'problems'} on this board or this machine; open the list`
        )
        diagnostics = mine
    }

    const showHealth = (): void => {
        if (!diagnostics.length) return
        const surface = openSurface(healthButton, 'kanban-health')
        surface.root.setAttribute('role', 'dialog')
        surface.root.setAttribute('aria-label', 'problems')
        surface.root.tabIndex = -1
        for (const entry of diagnostics) {
            const card = entry.cardId ? cardById(entry.cardId) : undefined
            const row = el(card ? 'button' : 'div', 'kanban-health-row')
            if (row instanceof HTMLButtonElement) row.type = 'button'
            const dot = el('span', 'kanban-dot')
            dot.dataset.tone = 'warning'
            const where = el('span', 'kanban-health-where')
            where.append(dot, el('span', 'dya-text', card?.title ?? 'this machine'))
            row.append(where, el('span', 'kanban-health-problem', entry.problem))
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
            healthButton.focus()
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
    void refresh().catch(fail)

    return () => {
        disposed = true
        closeTerminal()
        unsubscribe()
        unnotice()
        stopDrag()
        window.clearInterval(ticker)
        if (watchTimer) window.clearTimeout(watchTimer)
        for (const timer of pending.values()) window.clearTimeout(timer)
        pending.clear()
        root.remove()
    }
}

export function activate(ctx: PluginContext): void {
    injectStyles('kanban', `${xtermCss}
${STYLES}`)
    ctx.registerPanel(
        {
            id: 'kanban',
            title: 'Kanban',
            icon: ICON,
            note: 'Write a card, hand it to an agent, and watch the run as it happens.',
            duplicable: true
        },
        (container, handle) => mount(ctx, container, handle)
    )
}
