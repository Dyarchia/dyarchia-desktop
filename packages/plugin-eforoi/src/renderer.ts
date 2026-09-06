import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'
import { renderMarkdown } from './markdown.js'
import { openMenu } from './menu.js'
import type { MenuLeaf, MenuRow } from './menu.js'
import { STYLES } from './styles.js'
import type {
    Analysis,
    Catalog,
    CatalogEntry,
    MemberResult,
    Mode,
    PanelStore,
    RunEvent,
    SavedPanel,
    Seat
} from './types.js'

const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.3" r="3.5"/><circle cx="12" cy="4.8" r="2" fill="currentColor" stroke="none"/><circle cx="19.4" cy="17.6" r="2" fill="currentColor" stroke="none"/><circle cx="4.6" cy="17.6" r="2" fill="currentColor" stroke="none"/></svg>'

const COPY_ICON =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'

const DONE_ICON =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>'

const SEATS_KEY = 'eforoi:seats'
const LATENCY_KEY = 'eforoi:latency'
const MIN_PANEL = 2
const MAX_PANEL = 5

const EXCLUDE = /free|preview|contributor|reserve/i
const LIGHT = /mini|flash|lightning|nano|haiku/i
const UNPAID = 'opencode/opencode/'

interface Stored {
    panel: Seat[]
    analyst: Seat | null
}

interface Card {
    root: HTMLElement
    dot: HTMLElement
    title: HTMLElement
    note: HTMLElement
    body: HTMLElement
    chevron: HTMLElement
    raw: string
    open(next: boolean): void
}

type Family = (entry: CatalogEntry) => boolean

const ANTHROPIC: Family = (entry) => entry.group === 'Anthropic'
const OPENAI: Family = (entry) => entry.group === 'OpenAI'
const OPENCODE_NATIVE: Family = (entry) =>
    entry.group.startsWith('opencode') && !entry.key.includes('/gpt-')
const ANY: Family = () => true

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

function seconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`
}

function money(value: number): string {
    return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`
}

function read<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

function write(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        /* a full quota is not worth failing a run over */
    }
}

async function toClipboard(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text)
        return
    } catch {
        const holder = document.createElement('textarea')
        holder.value = text
        holder.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
        document.body.appendChild(holder)
        holder.select()
        document.execCommand('copy')
        holder.remove()
    }
}

function tierOf(key: string): string | undefined {
    if (/free/i.test(key)) return 'free'
    if (/preview/i.test(key)) return 'preview'
    if (/mini|flash|lightning/i.test(key)) return 'light'
    return undefined
}

function usable(entry: CatalogEntry): boolean {
    return entry.modes.some((mode) => mode.available)
}

function firstMode(entry: CatalogEntry): Mode | null {
    return entry.modes.find((mode) => mode.available)?.mode ?? null
}

function score(entry: CatalogEntry, cheap: boolean): number {
    let penalty = 0
    if (EXCLUDE.test(entry.key)) penalty += 1_000_000
    if (entry.key.startsWith(UNPAID)) penalty += 500_000
    if (LIGHT.test(entry.key) !== cheap) penalty += 100_000
    return penalty + (cheap ? -entry.rank : entry.rank)
}

function best(
    catalog: Catalog,
    family: Family,
    taken: CatalogEntry[],
    cheap = false
): CatalogEntry | null {
    return (
        catalog.entries
            .filter((candidate) => usable(candidate) && family(candidate))
            .filter(
                (candidate) =>
                    !taken.some(
                        (chosen) => chosen.key === candidate.key || chosen.label === candidate.label
                    )
            )
            .sort((left, right) => score(left, cheap) - score(right, cheap))[0] ?? null
    )
}

function toSeat(entry: CatalogEntry | null): Seat | null {
    const mode = entry ? firstMode(entry) : null
    return entry && mode ? { key: entry.key, mode } : null
}

function defaultPanel(catalog: Catalog): Stored {
    const chosen: CatalogEntry[] = []
    for (const family of [ANTHROPIC, OPENAI, OPENCODE_NATIVE, ANY]) {
        if (chosen.length >= 3) break
        const pick = best(catalog, family, chosen)
        if (pick) chosen.push(pick)
    }

    while (chosen.length < MIN_PANEL) {
        const spare = best(catalog, ANY, chosen)
        if (!spare) break
        chosen.push(spare)
    }

    const picks = chosen
        .map(toSeat)
        .filter((seat): seat is Seat => seat !== null)

    return { panel: picks, analyst: picks[0] ?? null }
}

function mount(ctx: PluginContext, container: HTMLElement, conversation: string): () => void {
    const root = el('div', 'eforoi')
    const head = el('div', 'eforoi-head')
    const results = el('div', 'eforoi-results')
    const grid = el('div', 'eforoi-grid')
    results.appendChild(grid)
    root.append(head, results)
    container.appendChild(root)

    let catalog: Catalog | null = null
    let state: Stored = read<Stored>(SEATS_KEY, { panel: [], analyst: null })
    let latency = read<Record<string, number>>(LATENCY_KEY, {})
    let store: PanelStore = { path: '', items: [] }
    let runId: string | null = null
    let answerText = ''

    const promptBox = el('textarea', 'dya-field eforoi-prompt')
    promptBox.placeholder = 'Ask the panel — ctrl+enter to run'

    const seats = el('div', 'eforoi-seats')
    const analystSeat = el('div', 'eforoi-seats')
    const bar = el('div', 'eforoi-bar')

    const runButton = el('button', 'dya-button', 'Run')
    const addButton = el('button', 'dya-key', '+')
    const removeButton = el('button', 'dya-key', '−')
    const panelsButton = el('button', 'dya-button', 'Presets')
    const saveButton = el('button', 'dya-button', 'Save')
    const nameInput = el('input', 'dya-field dya-field--sm eforoi-name')
    const refreshButton = el('button', 'dya-button', 'Refresh')
    const newButton = el('button', 'dya-button', 'New')
    const turnLabel = el('span', 'dya-value eforoi-meta')
    const status = el('span', 'dya-value eforoi-meta')

    newButton.title = 'forget the conversation and start over'

    addButton.title = 'add a panel member'
    removeButton.title = 'remove the last panel member'
    panelsButton.title = 'load or delete a saved preset'
    saveButton.title = 'save this preset'
    nameInput.type = 'text'
    nameInput.placeholder = 'name it, enter to save'
    nameInput.spellcheck = false
    nameInput.hidden = true
    refreshButton.title = 'rediscover installed CLIs, plans and API models'

    const panelLegend = el('div', 'eforoi-legend')
    const legendActions = el('div', 'eforoi-legend-actions')
    legendActions.append(panelsButton, saveButton, addButton, removeButton, nameInput)
    panelLegend.append(el('span', 'dya-label', 'Panel'), legendActions)

    bar.append(
        runButton,
        refreshButton,
        newButton,
        turnLabel,
        el('span', 'eforoi-spacer'),
        status
    )

    const promptColumn = el('div', 'eforoi-column')
    promptColumn.dataset.side = 'prompt'
    promptColumn.append(el('span', 'dya-label', 'Prompt'), promptBox)

    const panelColumn = el('div', 'eforoi-column')
    panelColumn.dataset.side = 'panel'
    panelColumn.append(panelLegend, seats, analystSeat)

    const columns = el('div', 'eforoi-columns')
    columns.append(promptColumn, panelColumn)
    head.append(columns, bar)

    const entryOf = (key: string): CatalogEntry | undefined =>
        catalog?.entries.find((candidate) => candidate.key === key)

    const labelOf = (seat: Seat | null): string =>
        seat ? (entryOf(seat.key)?.label ?? seat.key) : 'select a model'

    const offerOf = (seat: Seat | null) =>
        seat ? entryOf(seat.key)?.modes.find((mode) => mode.mode === seat.mode) : undefined

    const rowsFor = (selected: Seat | null): MenuRow[] => {
        if (!catalog) return []
        return catalog.entries.map((entry) => ({
            key: entry.key,
            label: entry.label,
            group: entry.group,
            tier: tierOf(entry.key),
            note: latency[entry.key] ? seconds(latency[entry.key]) : undefined,
            selected: selected?.key === entry.key,
            leaves: entry.modes.map(
                (mode): MenuLeaf => ({
                    label: mode.mode === 'subscription' ? 'Subscription' : 'API',
                    value: mode.mode,
                    disabled: !mode.available,
                    reason: mode.reason,
                    selected: selected?.key === entry.key && selected.mode === mode.mode
                })
            )
        }))
    }

    const commit = (): void => {
        write(SEATS_KEY, state)
        renderSeats()
    }

    const pickSeat = (anchor: HTMLElement, current: Seat | null, set: (seat: Seat) => void): void => {
        openMenu({
            anchor,
            rows: rowsFor(current),
            filter: 'filter models',
            onPick: (row, leaf) => {
                set({ key: row.key, mode: leaf.value as Mode })
                commit()
            }
        })
    }

    const pickMode = (anchor: HTMLElement, seat: Seat | null, set: (next: Seat) => void): void => {
        const entry = seat ? entryOf(seat.key) : undefined
        if (!seat || !entry) return

        const current = entry.modes.find((mode) => mode.mode === seat.mode)
        const modeRows: MenuRow[] = entry.modes.map((mode) => ({
            key: `mode:${mode.mode}`,
            label: mode.mode === 'subscription' ? 'Subscription' : 'API',
            group: 'Route',
            selected: mode.mode === seat.mode,
            note: mode.available ? mode.route : undefined,
            direct: true,
            leaves: [
                {
                    label: 'Use',
                    value: `mode:${mode.mode}`,
                    disabled: !mode.available,
                    reason: mode.reason
                }
            ]
        }))

        const effortRows: MenuRow[] = ['', ...(current?.efforts ?? [])].map((level) => ({
            key: `effort:${level}`,
            label: level || 'default',
            group: 'Effort',
            selected: (seat.effort ?? '') === level,
            direct: true,
            leaves: [{ label: 'Use', value: `effort:${level}` }]
        }))

        openMenu({
            anchor,
            rows: [...modeRows, ...(effortRows.length > 1 ? effortRows : [])],
            filter: 'filter',
            onPick: (_row, leaf) => {
                const [kind, value] = leaf.value.split(':')
                if (kind === 'mode') {
                    set({ ...seat, mode: value as Mode })
                } else {
                    set({ ...seat, effort: value || undefined })
                }
                commit()
            }
        })
    }

    const seatRow = (
        seat: Seat | null,
        lead: { ordinal?: string; role?: string },
        set: (next: Seat) => void
    ): HTMLElement => {
        const row = el('div', 'dya-row eforoi-seat')
        const offer = offerOf(seat)

        if (lead.role) {
            row.dataset.role = 'analyst'
            row.append(el('span', 'dya-label eforoi-role eforoi-cell', lead.role))
        } else {
            row.append(el('span', 'dya-value eforoi-cell', lead.ordinal ?? ''))
        }

        const model = el('button', 'dya-item eforoi-pick eforoi-cell')
        model.append(el('span', 'eforoi-pick-label', labelOf(seat)))
        model.dataset.empty = String(!seat)
        model.addEventListener('click', () => pickSeat(model, seat, set))

        const mode = el('button', 'dya-item eforoi-pick eforoi-cell')
        const modeName = seat?.mode === 'api' ? 'API' : 'Subscription'
        mode.append(
            el('span', 'eforoi-pick-label', seat ? `${modeName}${seat.effort ? ` · ${seat.effort}` : ''}` : '—'),
            el('span', 'eforoi-menu-arrow', seat ? '›' : '')
        )
        mode.dataset.empty = String(!seat)
        mode.dataset.broken = String(Boolean(seat) && !offer?.available)
        if (offer && !offer.available) mode.title = offer.reason ?? 'unavailable'
        mode.addEventListener('click', () => {
            if (seat) pickMode(mode, seat, set)
            else pickSeat(mode, seat, set)
        })

        const route = el('span', 'dya-value eforoi-route eforoi-cell', offer?.available ? offer.route : '')

        const tierCell = el('span', 'eforoi-cell')
        const tier = seat ? tierOf(seat.key) : undefined
        if (tier) tierCell.append(el('span', 'dya-badge dya-badge--soft eforoi-tier', tier))

        const elapsed = seat && latency[seat.key] ? `~${seconds(latency[seat.key])}` : ''

        row.append(model, mode, route, tierCell, el('span', 'dya-value eforoi-route eforoi-cell', elapsed))
        return row
    }

    function renderSeats(): void {
        seats.replaceChildren(
            ...state.panel.map((seat, index) =>
                seatRow(seat, { ordinal: String(index + 1) }, (next) => {
                    state.panel[index] = next
                })
            )
        )
        analystSeat.replaceChildren(
            seatRow(state.analyst, { role: 'dogma' }, (next) => {
                state.analyst = next
            })
        )
        addButton.disabled = state.panel.length >= MAX_PANEL
        removeButton.disabled = state.panel.length <= MIN_PANEL
    }

    const cards = new Map<string, Card>()

    const makeCard = (id: string, title: string, role: string, expanded: boolean): Card => {
        const wrapper = el('div', 'dya-card eforoi-card')
        wrapper.dataset.role = role

        const header = el('div', 'dya-card__header eforoi-card-head')
        const toggle = el('button', 'eforoi-card-toggle')
        const chevron = el('span', 'eforoi-chevron', expanded ? '▾' : '▸')
        const dot = el('span', 'eforoi-dot')
        const label = el('span', 'dya-value eforoi-card-title', title)
        const note = el('span', 'eforoi-card-note')
        const copy = el('button', 'dya-key eforoi-copy')
        const body = el('div', 'eforoi-body')

        body.hidden = !expanded
        copy.innerHTML = COPY_ICON
        copy.title = 'copy to the clipboard'
        copy.setAttribute('aria-label', 'copy')

        const card: Card = {
            root: wrapper,
            dot,
            title: label,
            note,
            body,
            chevron,
            raw: '',
            open(next) {
                body.hidden = !next
                chevron.textContent = next ? '▾' : '▸'
            }
        }

        copy.addEventListener('click', (event) => {
            event.stopPropagation()
            const text = card.raw || card.body.innerText
            if (!text.trim()) return
            void toClipboard(text).then(() => {
                copy.innerHTML = DONE_ICON
                copy.dataset.done = 'true'
                window.setTimeout(() => {
                    copy.innerHTML = COPY_ICON
                    delete copy.dataset.done
                }, 1200)
            })
        })

        toggle.append(chevron, dot, label, note)
        toggle.addEventListener('click', () => card.open(body.hidden))
        header.append(toggle, copy)
        wrapper.append(header, body)
        grid.appendChild(wrapper)
        cards.set(id, card)
        return card
    }

    const prepare = (): void => {
        cards.clear()
        grid.replaceChildren()

        const analyst = labelOf(state.analyst)
        const answer = makeCard('answer', 'Answer', 'answer', true)
        answer.note.textContent = `written by ${analyst}`
        answer.body.append(el('span', 'dya-empty', 'waiting for the panel'))

        const analysis = makeCard('analysis', 'Analysis', 'analysis', true)
        analysis.note.textContent = `compared by ${analyst}`
        analysis.body.append(el('span', 'dya-empty', 'waiting for the panel'))

        state.panel.forEach((seat, index) => {
            const card = makeCard(`member-${index + 1}`, `${index + 1}. ${labelOf(seat)}`, 'member', false)
            card.note.textContent = seat.mode === 'api' ? 'API' : 'plan'
        })
    }

    const remember = (key: string, ms: number): void => {
        latency = { ...latency, [key]: ms }
        write(LATENCY_KEY, latency)
    }

    const renderAnalysis = (analysis: Analysis): void => {
        const card = cards.get('analysis')
        if (!card) return

        card.body.replaceChildren()
        card.body.dataset.structured = 'true'

        const plain: string[] = []

        const escape = (text: string): string =>
            text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const tag = (label: string): string =>
            `<span class="dya-badge dya-badge--soft eforoi-tag">${label}</span>`

        const section = (heading: string, items: string[]): void => {
            if (!items.length) return
            plain.push(
                heading.toUpperCase(),
                ...items.map((item) => `- ${item.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`),
                ''
            )
            const block = el('div', 'eforoi-section')
            block.appendChild(el('h4', 'dya-label', heading))
            const list = el('ul')
            for (const item of items) {
                const entry = el('li')
                entry.innerHTML = item
                list.appendChild(entry)
            }
            block.appendChild(list)
            card.body.appendChild(block)
        }

        section(
            'Consensus',
            analysis.consensus.map((point) => escape(point.claim) + tag(point.supported_by.join(' ')))
        )
        section(
            'Contradictions',
            analysis.contradictions.map(
                (point) =>
                    `<strong>${escape(point.topic)}</strong><br>` +
                    point.positions
                        .map((position) => `${tag(String(position.member))} ${escape(position.position)}`)
                        .join('<br>')
            )
        )
        section(
            'Partial coverage',
            analysis.partial_coverage.map((point) => escape(point.point) + tag(point.covered_by.join(' ')))
        )
        section(
            'Unique insights',
            analysis.unique_insights.map((point) => tag(String(point.member)) + ' ' + escape(point.insight))
        )
        section('Blind spots', analysis.blind_spots.map(escape))

        if (!card.body.childElementCount) {
            const block = el('div', 'eforoi-section')
            block.appendChild(el('h4', 'dya-label', 'Nothing separated them'))
            card.body.appendChild(block)
            plain.push('Nothing separated them')
        }

        card.raw = plain.join('\n').trim()
    }

    const memberNote = (result: MemberResult): string => {
        const parts = [seconds(result.ms), result.seat.mode === 'api' ? 'API' : 'plan']
        if (result.usage.costUsd) parts.push(money(result.usage.costUsd))
        if (result.usage.outputTokens) parts.push(`${result.usage.outputTokens} out`)
        return parts.join(' · ')
    }

    const onEvent = (raw: unknown): void => {
        const event = raw as RunEvent
        if (event.runId !== runId) return

        if (event.type === 'stage') {
            status.textContent = `${event.stage}…`
            const card = cards.get(event.stage === 'analysis' ? 'analysis' : 'answer')
            if (event.stage !== 'panel' && card) {
                card.dot.dataset.state = 'running'
                card.body.replaceChildren()
            }
            return
        }

        if (event.type === 'member:delta') {
            const card = cards.get(`member-${event.index}`)
            if (!card) return
            card.dot.dataset.state = 'running'
            card.body.textContent = (card.body.textContent ?? '') + event.text
            return
        }

        if (event.type === 'member:done') {
            const card = cards.get(`member-${event.result.index}`)
            if (!card) return
            card.dot.dataset.state = event.result.error ? 'error' : 'done'
            card.note.textContent = event.result.error ?? memberNote(event.result)
            if (event.result.error) {
                card.raw = event.result.error
                card.body.replaceChildren(el('div', 'eforoi-error', event.result.error))
            } else {
                card.raw = event.result.text
                card.body.dataset.prose = 'true'
                card.body.innerHTML = renderMarkdown(event.result.text)
                remember(event.result.seat.key, event.result.ms)
            }
            return
        }

        if (event.type === 'analysis') {
            const card = cards.get('analysis')
            if (card) {
                card.dot.dataset.state = 'done'
                card.note.textContent = `compared by ${labelOf(state.analyst)} · ${seconds(event.ms)}`
            }
            renderAnalysis(event.analysis)
            return
        }

        if (event.type === 'answer:delta') {
            const card = cards.get('answer')
            if (!card) return
            card.dot.dataset.state = 'running'
            answerText += event.text
            card.body.textContent = answerText
            return
        }

        if (event.type === 'done') {
            const card = cards.get('answer')
            if (card) {
                card.dot.dataset.state = 'done'
                card.note.textContent = `written by ${labelOf(state.analyst)}`
                card.raw = answerText || event.answer
                card.body.dataset.prose = 'true'
                card.body.innerHTML = renderMarkdown(card.raw)
            }
            const spend =
                event.summary.meteredCostUsd > 0
                    ? `${money(event.summary.meteredCostUsd)} metered`
                    : 'plan only'
            status.textContent = `${seconds(event.summary.ms)} · ${spend} · ${event.summary.outputTokens} out`
            turnLabel.textContent = `turn ${event.summary.turn}/${event.summary.maxTurns}`
            promptBox.value = ''
            promptBox.focus()
            renderSeats()
            runId = null
            runButton.textContent = 'Run'
            return
        }

        if (event.type === 'error') {
            status.textContent = ''
            const card = cards.get('answer')
            if (card) {
                card.dot.dataset.state = 'error'
                card.body.replaceChildren(el('div', 'eforoi-error', event.message))
            } else {
                grid.appendChild(el('div', 'eforoi-error', event.message))
            }
            runId = null
            runButton.textContent = 'Run'
        }
    }

    const start = async (): Promise<void> => {
        if (runId) {
            await ctx.invoke('cancel', runId)
            return
        }
        if (!promptBox.value.trim()) {
            promptBox.focus()
            return
        }
        if (state.panel.some((seat) => !seat) || !state.analyst) {
            status.textContent = 'every seat needs a model'
            return
        }

        prepare()
        answerText = ''
        status.textContent = 'starting…'
        runButton.textContent = 'Cancel'

        try {
            runId = String(
                await ctx.invoke('run', {
                    conversation,
                    prompt: promptBox.value,
                    panel: state.panel,
                    analyst: state.analyst,
                    temperature: 0.7,
                    maxTokens: 16000
                })
            )
        } catch (error) {
            runId = null
            runButton.textContent = 'Run'
            status.textContent = error instanceof Error ? error.message : String(error)
        }
    }

    const refresh = async (force: boolean): Promise<void> => {
        status.textContent = 'discovering routes…'
        catalog = (await ctx.invoke('catalog', force)) as Catalog

        const known = new Set(catalog.entries.map((entry) => entry.key))
        state.panel = state.panel.filter((seat) => known.has(seat.key))
        if (state.analyst && !known.has(state.analyst.key)) state.analyst = null

        if (state.panel.length < MIN_PANEL || !state.analyst) {
            const seeded = defaultPanel(catalog)
            if (state.panel.length < MIN_PANEL) state.panel = seeded.panel
            state.analyst = state.analyst ?? seeded.analyst
        }

        renderSeats()
        const live = Object.values(catalog.routes).filter((route) => route.available)
        status.textContent = live.length ? '' : 'no route available'
    }

    const applyPanel = (entry: SavedPanel): void => {
        state = { panel: entry.panel.map((seat) => ({ ...seat })), analyst: entry.analyst }
        commit()
    }

    panelsButton.addEventListener('click', () => {
        const saved: MenuRow[] = store.items.map((item) => ({
            key: item.name,
            label: item.name,
            group: 'Presets',
            leaves: [
                { label: 'Load', value: 'load' },
                { label: 'Delete', value: 'delete' }
            ]
        }))

        openMenu({
            anchor: panelsButton,
            filter: 'filter presets',
            rows: [
                ...saved,
                {
                    key: '',
                    label: 'New',
                    group: '',
                    direct: true,
                    leaves: [{ label: 'New', value: 'new' }]
                }
            ],
            onPick: (row, leaf) => {
                if (leaf.value === 'new') {
                    if (!catalog) return
                    state = defaultPanel(catalog)
                    commit()
                    return
                }
                const entry = store.items.find((item) => item.name === row.key)
                if (!entry) return
                if (leaf.value === 'load') {
                    applyPanel(entry)
                    return
                }
                void ctx.invoke('deletePanel', entry.name).then((raw) => {
                    store = raw as PanelStore
                    status.textContent = `deleted ${entry.name}`
                })
            }
        })
    })

    const commitName = (): void => {
        const name = nameInput.value.trim()
        nameInput.hidden = true
        if (!name) return
        void ctx
            .invoke('savePanel', { name, panel: state.panel, analyst: state.analyst })
            .then((raw) => {
                store = raw as PanelStore
                status.textContent = `saved ${name}`
            })
            .catch((error: unknown) => {
                status.textContent = error instanceof Error ? error.message : String(error)
            })
    }

    saveButton.addEventListener('click', () => {
        nameInput.hidden = !nameInput.hidden
        if (nameInput.hidden) return
        nameInput.value = ''
        nameInput.focus()
    })

    nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') commitName()
        if (event.key === 'Escape') nameInput.hidden = true
    })

    addButton.addEventListener('click', () => {
        if (state.panel.length >= MAX_PANEL || !catalog) return
        const taken = state.panel
            .map((seat) => entryOf(seat.key))
            .filter((entry): entry is CatalogEntry => entry !== undefined)
        const seat = toSeat(best(catalog, ANY, taken))
        if (seat) state.panel.push(seat)
        commit()
    })

    removeButton.addEventListener('click', () => {
        if (state.panel.length <= MIN_PANEL) return
        state.panel.pop()
        commit()
    })

    newButton.addEventListener('click', () => {
        void ctx.invoke('reset', conversation)
        turnLabel.textContent = ''
        status.textContent = 'conversation cleared'
        cards.clear()
        grid.replaceChildren()
        promptBox.value = ''
        promptBox.focus()
    })

    refreshButton.addEventListener('click', () => void refresh(true))
    runButton.addEventListener('click', () => void start())
    promptBox.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void start()
    })

    const unsubscribe = ctx.on('event', onEvent)
    void ctx.invoke('panels').then((raw) => {
        store = raw as PanelStore
        saveButton.title = `save this panel to ${store.path}`
    })
    void refresh(true)
    void ctx.invoke('turns', conversation).then((raw) => {
        const state = raw as { turn: number; maxTurns: number }
        if (state?.turn) turnLabel.textContent = `turn ${state.turn}/${state.maxTurns}`
    })

    return () => {
        unsubscribe()
        if (runId) void ctx.invoke('cancel', runId)
        root.remove()
    }
}

export function activate(ctx: PluginContext): void {
    injectStyles('eforoi', STYLES)
    ctx.registerPanel(
        { id: 'eforoi', title: 'Eforoi', icon: ICON, duplicable: true },
        (container, handle) => mount(ctx, container, handle.instanceId)
    )
}
