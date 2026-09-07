import xtermCss from '@xterm/xterm/css/xterm.css'
import { injectStyles } from '@dyarchia/sdk'
import type { PanelHandle, PluginContext } from '@dyarchia/sdk'
import { installDrag } from './drag.js'
import type { DragColumn } from './drag.js'
import { openMenu } from './menu.js'
import type { MenuRow } from './menu.js'
import { STYLES } from './styles.js'
import { openTerminal } from './terminal.js'
import type { Attached } from './terminal.js'
import type { BoardMeta, BoardPayload, Card, KanbanEvent, Rules, Status } from './types.js'

interface HistoryRow {
    at: number
    kind: 'text' | 'thinking' | 'tool' | 'result' | 'end'
    label: string
    body: string
    error: boolean
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

function mount(ctx: PluginContext, container: HTMLElement, handle: PanelHandle): () => void {
    const pinKey = `${PIN}${handle.instanceId}`

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
    let tab: 'terminal' | 'history' = 'terminal'
    let drawnId: string | null = null
    let drawnRev = -1

    const root = el('div', 'kanban')

    const bar = el('div', 'dya-bar kanban-bar')
    const boardButton = el('button', 'dya-button dya-button--quiet', 'board')
    boardButton.type = 'button'
    const titleField = el('input', 'dya-field dya-field--sm')
    titleField.type = 'text'
    titleField.placeholder = 'new card'
    titleField.spellcheck = false
    const addButton = el('button', 'dya-button dya-button--sm', 'add')
    addButton.type = 'button'
    const tickButton = el('button', 'dya-button dya-button--quiet dya-button--sm', 'dispatch')
    tickButton.type = 'button'
    tickButton.title = 'sweep every board now instead of waiting for the tick'
    const spacer = el('span', 'kanban-spacer')
    const healthButton = el('button', 'dya-button dya-button--quiet dya-button--sm', 'health')
    healthButton.type = 'button'
    healthButton.hidden = true
    const meter = el('span', 'kanban-meta')
    bar.append(boardButton, titleField, addButton, tickButton, spacer, healthButton, meter)

    const main = el('div', 'kanban-main')
    const board = el('div', 'kanban-board')
    board.setAttribute('role', 'application')
    board.setAttribute('aria-label', 'task board')

    const drawer = el('aside', 'kanban-drawer')
    drawer.hidden = true

    const stage = el('div', 'kanban-stage')
    stage.hidden = true

    const setup = el('div', 'kanban-setup')
    setup.hidden = true

    const live = el('div', 'kanban-sr')
    live.setAttribute('aria-live', 'polite')

    const error = el('div', 'kanban-error')
    error.hidden = true

    main.append(board, drawer)
    root.append(bar, main, setup, error, live)
    container.appendChild(root)

    const say = (text: string): void => {
        live.textContent = text
    }

    const fail = (reason: unknown): void => {
        const message = reason instanceof Error ? reason.message : String(reason)
        error.textContent = message
        error.hidden = false
        say(message)
    }

    const clearError = (): void => {
        error.hidden = true
        error.textContent = ''
    }

    const cardById = (id: string): Card | undefined => cards.find((card) => card.id === id)

    const shown = (card: Card): Status => optimistic.get(card.id) ?? card.status

    const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
        clearError()
        return (await ctx.invoke(channel, ...args)) as T
    }

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
        const empty = el('div', 'dya-empty kanban-empty', 'nothing here')

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
        shell.addEventListener('click', () => select(card.id))
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

            column.count.textContent = String(wantedHere.length)
            column.empty.hidden = wantedHere.length > 0
        }

        for (const [id, node] of nodes) {
            node.root.tabIndex = id === focused ? 0 : -1
        }
        if (focused === null) {
            const first = nodes.values().next().value as CardNode | undefined
            if (first) first.root.tabIndex = 0
        }

        meter.textContent = meta ? `${meta.name} · ${cards.length} cards · ${meta.workdir}` : ''
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
        }

        setup.hidden = true
        main.hidden = false
        bar.hidden = false
        boardButton.textContent = meta.name
        reconcile()
        void health().catch(() => undefined)
    }

    const renderAbsence = (missing: string | null): void => {
        main.hidden = true
        bar.hidden = registry.length === 0
        boardButton.textContent = 'board'
        setup.hidden = false
        setup.replaceChildren()

        const open = registry.filter((entry) => !entry.archived)
        if (missing && !open.some((entry) => entry.slug === missing)) {
            const gone = el('div', 'dya-empty', `board '${missing}' is gone or archived`)
            const pick = el('button', 'dya-button', 'choose a board')
            pick.type = 'button'
            pick.addEventListener('click', () => openBoardMenu(pick))
            const holder = el('div', 'kanban-setup-form')
            holder.append(gone, pick)
            setup.appendChild(holder)
            return
        }

        setup.appendChild(buildBoardForm())
    }

    const buildBoardForm = (): HTMLElement => {
        const form = el('div', 'kanban-setup-form')
        const label = el('div', 'dya-empty', 'a board is a project. name it and point it at a directory.')

        const name = el('input', 'dya-field')
        name.type = 'text'
        name.placeholder = 'project name'

        const dirRow = el('div', 'kanban-row')
        const dir = el('input', 'dya-field')
        dir.type = 'text'
        dir.placeholder = 'absolute project directory'
        dir.spellcheck = false
        const browse = el('button', 'dya-button dya-button--quiet dya-button--sm', 'browse')
        browse.type = 'button'
        dirRow.append(dir, browse)

        const create = el('button', 'dya-button', 'create board')
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
                .then((created) => {
                    write(pinKey, created.slug)
                    return refresh()
                })
                .catch(fail)
        })

        form.append(label, name, dirRow, create)
        return form
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

        rows.push({
            key: '',
            label: 'new board',
            group: 'registry',
            direct: true,
            leaves: [{ label: 'new board', value: '' }]
        })

        openMenu({
            anchor,
            rows,
            filter: 'filter boards',
            onPick: (row) => {
                if (!row.key) {
                    meta = null
                    columns.clear()
                    nodes.clear()
                    board.replaceChildren()
                    main.hidden = true
                    setup.hidden = false
                    setup.replaceChildren(buildBoardForm())
                    return
                }
                write(pinKey, row.key)
                void refresh().catch(fail)
            }
        })
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
                say(`${updated.title} moved to ${updated.status}`)
                return refresh()
            })
            .catch((reason: unknown) => {
                settle(id)
                optimistic.delete(id)
                reconcile()
                fail(reason)
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
        stage.replaceChildren()
        stage.hidden = true
    }

    const paintHistory = (card: Card, into: HTMLElement): void => {
        void invoke<HistoryRow[]>('runEvents', meta?.slug, card.id)
            .then((rows) => {
                if (!into.isConnected) return
                into.replaceChildren()
                if (!rows.length) {
                    into.appendChild(el('div', 'dya-empty kanban-empty', 'nothing recorded yet'))
                    return
                }
                const stick = into.scrollTop + into.clientHeight >= into.scrollHeight - 8
                for (const row of rows) into.appendChild(historyRow(row))
                if (stick) into.scrollTop = into.scrollHeight
            })
            .catch(fail)
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
        const key = run ? `${tab}:${card.id}:${run.runId}` : ''

        if (key === terminalFor) return
        closeTerminal()
        if (!key) return

        terminalFor = key
        stage.hidden = false

        if (tab === 'history' || !live) {
            const list = el('div', 'kanban-history')
            stage.replaceChildren(list)
            paintHistory(card, list)
            return
        }

        const view = el('div', 'kanban-terminal')
        stage.replaceChildren(view)
        terminal = openTerminal(ctx, view, meta?.slug ?? '', card.id, (reason) => {
            closeTerminal()
            fail(reason)
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
            return
        }

        if (drawnId === card.id && drawnRev === card.rev) {
            const label = drawer.querySelector('.kanban-drawer-head .dya-label')
            if (label) label.textContent = rules.labels[shown(card)]
            syncTerminal(card)
            return
        }

        drawnId = card.id
        drawnRev = card.rev
        drawer.hidden = false
        drawer.replaceChildren()

        const head = el('div', 'dya-card__header kanban-drawer-head')
        const heading = el('span', 'dya-label', rules.labels[shown(card)])

        const tabs = el('div', 'dya-tabs kanban-tabs')
        tabs.setAttribute('role', 'tablist')
        for (const name of ['terminal', 'history'] as const) {
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

        const close = el('button', 'dya-key', '×')
        close.type = 'button'
        close.setAttribute('aria-label', 'close the card')
        close.addEventListener('click', () => select(null))
        head.append(heading, el('span', 'kanban-spacer'), tabs, close)

        const body = el('div', 'kanban-drawer-body')

        const titleGroup = el('div', 'kanban-group')
        titleGroup.append(el('span', 'dya-label', 'title'))
        const title = el('input', 'dya-field')
        title.type = 'text'
        title.value = card.title
        title.addEventListener('change', () => patch(card.id, { title: title.value }))
        titleGroup.appendChild(title)

        const bodyGroup = el('div', 'kanban-group')
        bodyGroup.append(el('span', 'dya-label', 'brief'))
        const text = el('textarea', 'dya-field kanban-body-field')
        text.value = card.body
        text.addEventListener('change', () => patch(card.id, { body: text.value }))
        bodyGroup.appendChild(text)

        const priorityGroup = el('div', 'kanban-group')
        priorityGroup.append(el('span', 'dya-label', 'priority'))
        const priority = el('input', 'dya-field dya-field--sm')
        priority.type = 'number'
        priority.value = String(card.priority)
        priority.addEventListener('change', () => patch(card.id, { priority: Number(priority.value) }))
        priorityGroup.appendChild(priority)

        const depsGroup = el('div', 'kanban-group')
        depsGroup.append(el('span', 'dya-label', 'depends on'))
        const parents = el('div', 'kanban-parents')
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
                .then(() => refresh())
                .catch(fail)
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
                const label = el(
                    'span',
                    'kanban-card-note',
                    `${run.outcome ?? 'running'} · ${tokens(run.inputTokens + run.outputTokens)} tok · ${ago(run.startedAt, clock)}`
                )
                row.append(dot, label)
                if (run.branch) {
                    const branch = el('span', 'dya-tag', run.branch)
                    branch.title = run.worktree ?? ''
                    row.append(branch)
                }
                for (const name of run.kept ?? []) {
                    const file = el('button', 'dya-chip', name)
                    file.type = 'button'
                    file.title = 'show this artifact on disk'
                    file.addEventListener('click', () => {
                        void invoke('reveal', meta?.slug, card.id, name).catch(fail)
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
                    .catch(fail)
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
                        say(`${next.title} returned to ${next.status}`)
                        return refresh()
                    })
                    .catch(fail)
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
            actions.append(approve, changes)
        }

        if (shown(card) === 'running') {
            const stop = el('button', 'dya-button dya-button--sm dya-button--danger', 'stop')
            stop.type = 'button'
            stop.addEventListener('click', () => {
                if (!window.confirm(`Stop the worker on '${card.title}'? Its conversation is kept.`)) return
                void invoke('stopCard', meta?.slug, card.id)
                    .then(() => refresh())
                    .catch(fail)
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
                    select(null)
                    return refresh()
                })
                .catch(fail)
        })
        actions.append(moveButton, remove)

        body.append(
            titleGroup,
            bodyGroup,
            priorityGroup,
            depsGroup,
            scheduleGroup,
            runsGroup,
            actions,
            notesGroup
        )
        drawer.append(head, stage, body)
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
            .then(() => refresh())
            .catch(fail)
    }

    const add = (): void => {
        const title = titleField.value.trim()
        if (!title || !meta) return
        void invoke<Card>('createCard', meta.slug, { title })
            .then((card) => {
                titleField.value = ''
                say(`${card.title} added to triage`)
                return refresh()
            })
            .catch(fail)
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
    healthButton.addEventListener('click', () => showHealth())
    tickButton.addEventListener('click', () => {
        void invoke('dispatchNow')
            .then(() => refresh())
            .catch(fail)
    })
    addButton.addEventListener('click', add)
    titleField.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') add()
    })
    board.addEventListener('keydown', onBoardKey)

    const health = async (): Promise<void> => {
        const found = await invoke<Diagnostic[]>('diagnostics')
        const mine = found.filter((entry) => entry.slug === meta?.slug || entry.slug === '')
        healthButton.hidden = mine.length === 0
        healthButton.textContent = mine.length ? `health ${mine.length}` : 'health'
        diagnostics = mine
    }

    const showHealth = (): void => {
        if (!diagnostics.length) return
        openMenu({
            anchor: healthButton,
            rows: diagnostics.map((entry, index) => ({
                key: entry.cardId ?? '',
                label: entry.cardId ? (cardById(entry.cardId)?.title ?? entry.cardId) : 'this machine',
                group: entry.problem,
                direct: true,
                leaves: [{ label: entry.problem, value: String(index) }]
            })),
            filter: 'filter problems',
            onPick: (row) => {
                if (!row.key) return
                select(row.key)
                focusCard(row.key)
            }
        })
    }

    const ticker = window.setInterval(() => {
        clock = Date.now()
        for (const card of cards) paintCard(card)
    }, 30_000)

    const unsubscribe = ctx.on('event', onEvent)
    void refresh().catch(fail)

    return () => {
        disposed = true
        closeTerminal()
        unsubscribe()
        stopDrag()
        window.clearInterval(ticker)
        for (const timer of pending.values()) window.clearTimeout(timer)
        pending.clear()
        root.remove()
    }
}

export function activate(ctx: PluginContext): void {
    injectStyles('kanban', `${xtermCss}
${STYLES}`)
    ctx.registerPanel(
        { id: 'kanban', title: 'Kanban', icon: ICON, duplicable: true },
        (container, handle) => mount(ctx, container, handle)
    )
}
