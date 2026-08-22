import type { PluginContext } from '@dyarchia/sdk'
import { renderMarkdown } from './markdown.js'
import { openMenu } from './menu.js'
import type { MenuLeaf, MenuRow } from './menu.js'
import { STYLES, STYLE_ID } from './styles.js'
import type { Analysis, Catalog, CatalogEntry, MemberResult, Mode, RunEvent, Seat } from './types.js'

const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 7v10M7 12h10"/></svg>'

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
    open(next: boolean): void
}

type Family = (entry: CatalogEntry) => boolean

interface Preset {
    label: string
    hint: string
    panel: { family: Family; cheap?: boolean }[]
    analyst: { family: Family; cheap?: boolean }
}

const ANTHROPIC: Family = (entry) => entry.group === 'Anthropic'
const OPENAI: Family = (entry) => entry.group === 'OpenAI'
const OPENCODE: Family = (entry) => entry.group.startsWith('opencode')
const OPENCODE_NATIVE: Family = (entry) => OPENCODE(entry) && !entry.key.includes('/gpt-')
const ANY: Family = () => true

const PRESETS: Record<string, Preset> = {
    Frontier: {
        label: 'Frontier',
        hint: 'the strongest models available, capability over variety',
        panel: [{ family: ANTHROPIC }, { family: OPENAI }, { family: ANTHROPIC }],
        analyst: { family: ANTHROPIC }
    },
    Diverse: {
        label: 'Diverse',
        hint: 'one model per vendor, so the analyst has real disagreement to compare',
        panel: [{ family: ANTHROPIC }, { family: OPENAI }, { family: OPENCODE_NATIVE }],
        analyst: { family: ANTHROPIC }
    },
    Budget: {
        label: 'Budget',
        hint: 'the light tiers, for questions that do not need the frontier',
        panel: [
            { family: ANTHROPIC, cheap: true },
            { family: OPENAI, cheap: true },
            { family: OPENCODE, cheap: true }
        ],
        analyst: { family: ANTHROPIC, cheap: true }
    }
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

function injectStyles(): void {
    const existing = document.getElementById(STYLE_ID)
    if (existing) existing.remove()
    const style = el('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    document.head.appendChild(style)
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

function apply(catalog: Catalog, preset: Preset): Stored {
    const chosen: CatalogEntry[] = []

    for (const slot of preset.panel) {
        const pick =
            best(catalog, slot.family, chosen, slot.cheap === true) ??
            best(catalog, ANY, chosen, slot.cheap === true)
        if (pick) chosen.push(pick)
    }

    while (chosen.length < MIN_PANEL) {
        const spare = best(catalog, ANY, chosen)
        if (!spare) break
        chosen.push(spare)
    }

    const analyst =
        best(catalog, preset.analyst.family, [], preset.analyst.cheap === true) ??
        best(catalog, ANY, [], preset.analyst.cheap === true)

    return {
        panel: chosen.map(toSeat).filter((seat): seat is Seat => seat !== null),
        analyst: toSeat(analyst)
    }
}

function mount(ctx: PluginContext, container: HTMLElement): () => void {
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
    let runId: string | null = null
    let answerText = ''

    const promptBox = el('textarea', 'eforoi-prompt')
    promptBox.placeholder = 'Ask the panel — ctrl+enter to run'

    const seats = el('div', 'eforoi-seats')
    const analystSeat = el('div', 'eforoi-seats')
    const bar = el('div', 'eforoi-bar')

    const runButton = el('button', 'eforoi-button', 'Run')
    const addButton = el('button', 'eforoi-button eforoi-icon', '+')
    const removeButton = el('button', 'eforoi-button eforoi-icon', '−')
    const presetButton = el('button', 'eforoi-button', 'Preset')
    const refreshButton = el('button', 'eforoi-button', 'Refresh')
    const status = el('span', 'eforoi-meta')

    addButton.title = 'add a panel member'
    removeButton.title = 'remove the last panel member'
    presetButton.title = 'seat the whole panel at once'
    refreshButton.title = 'rediscover installed CLIs, plans and API models'

    const panelLegend = el('div', 'eforoi-legend')
    panelLegend.append(el('span', 'eforoi-label', 'Panel'), presetButton, addButton, removeButton)

    const analystLegend = el('div', 'eforoi-legend')
    analystLegend.append(
        el('span', 'eforoi-label', 'Analyst'),
        el('span', 'eforoi-meta', 'compares the panel, then writes the answer')
    )

    bar.append(refreshButton, el('span', 'eforoi-spacer'), status, runButton)

    const promptColumn = el('div', 'eforoi-column')
    promptColumn.dataset.side = 'prompt'
    promptColumn.append(el('span', 'eforoi-label', 'Prompt'), promptBox)

    const panelColumn = el('div', 'eforoi-column')
    panelColumn.dataset.side = 'panel'
    panelColumn.append(panelLegend, seats, analystLegend, analystSeat)

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

    const seatRow = (
        seat: Seat | null,
        lead: { ordinal?: string; role?: string },
        set: (next: Seat) => void
    ): HTMLElement => {
        const row = el('div', 'eforoi-seat')
        const offer = offerOf(seat)

        if (lead.role) {
            row.dataset.role = 'analyst'
            row.append(el('span', 'eforoi-role eforoi-cell', lead.role))
        } else {
            row.append(el('span', 'eforoi-ordinal eforoi-cell', lead.ordinal ?? ''))
        }

        const model = el('button', 'eforoi-pick eforoi-model eforoi-cell', labelOf(seat))
        model.dataset.empty = String(!seat)
        model.addEventListener('click', () => pickSeat(model, seat, set))

        const mode = el('button', 'eforoi-pick eforoi-mode eforoi-cell')
        mode.textContent = seat ? `${seat.mode === 'api' ? 'API' : 'Subscription'} ›` : '—'
        mode.dataset.empty = String(!seat)
        mode.dataset.broken = String(Boolean(seat) && !offer?.available)
        if (offer && !offer.available) mode.title = offer.reason ?? 'unavailable'
        mode.addEventListener('click', () => pickSeat(mode, seat, set))

        const route = el('span', 'eforoi-route eforoi-cell', offer?.available ? offer.route : '')

        const tierCell = el('span', 'eforoi-cell')
        const tier = seat ? tierOf(seat.key) : undefined
        if (tier) tierCell.append(el('span', 'eforoi-tier', tier))

        const elapsed = seat && latency[seat.key] ? `~${seconds(latency[seat.key])}` : ''

        row.append(model, mode, route, tierCell, el('span', 'eforoi-route eforoi-cell', elapsed))
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
            seatRow(state.analyst, { role: 'analyst' }, (next) => {
                state.analyst = next
            })
        )
        addButton.disabled = state.panel.length >= MAX_PANEL
        removeButton.disabled = state.panel.length <= MIN_PANEL
    }

    const cards = new Map<string, Card>()

    const makeCard = (id: string, title: string, role: string, expanded: boolean): Card => {
        const wrapper = el('div', 'eforoi-card')
        wrapper.dataset.role = role

        const header = el('button', 'eforoi-card-head')
        const chevron = el('span', 'eforoi-chevron', expanded ? '▾' : '▸')
        const dot = el('span', 'eforoi-dot')
        const label = el('span', 'eforoi-card-title', title)
        const note = el('span', 'eforoi-card-note')
        const body = el('div', 'eforoi-body')
        body.hidden = !expanded

        const card: Card = {
            root: wrapper,
            dot,
            title: label,
            note,
            body,
            chevron,
            open(next) {
                body.hidden = !next
                chevron.textContent = next ? '▾' : '▸'
            }
        }

        header.append(chevron, dot, label, note)
        header.addEventListener('click', () => card.open(body.hidden))
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
        answer.body.append(el('span', 'eforoi-pending', 'waiting for the panel'))

        const analysis = makeCard('analysis', 'Analysis', 'analysis', true)
        analysis.note.textContent = `compared by ${analyst}`
        analysis.body.append(el('span', 'eforoi-pending', 'waiting for the panel'))

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

        const escape = (text: string): string =>
            text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const tag = (label: string): string => `<span class="eforoi-tag">${label}</span>`

        const section = (heading: string, items: string[]): void => {
            if (!items.length) return
            const block = el('div', 'eforoi-section')
            block.appendChild(el('h4', undefined, heading))
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
            block.appendChild(el('h4', undefined, 'Nothing separated them'))
            card.body.appendChild(block)
        }
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
                card.body.replaceChildren(el('div', 'eforoi-error', event.result.error))
            } else {
                if (!card.body.textContent) card.body.textContent = event.result.text
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
                card.body.dataset.prose = 'true'
                card.body.innerHTML = renderMarkdown(answerText || event.answer)
            }
            const spend =
                event.summary.meteredCostUsd > 0
                    ? `${money(event.summary.meteredCostUsd)} metered`
                    : 'plan only'
            status.textContent = `${seconds(event.summary.ms)} · ${spend} · ${event.summary.outputTokens} out`
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
            const seeded = apply(catalog, PRESETS.Diverse)
            if (state.panel.length < MIN_PANEL) state.panel = seeded.panel
            state.analyst = state.analyst ?? seeded.analyst
        }

        renderSeats()
        const live = Object.entries(catalog.routes)
            .filter(([, value]) => value.available)
            .map(([id]) => id)
        status.textContent = live.length ? `routes: ${live.join(' ')}` : 'no route available'
    }

    presetButton.addEventListener('click', () => {
        if (!catalog) return
        openMenu({
            anchor: presetButton,
            filter: 'filter presets',
            rows: Object.entries(PRESETS).map(([key, preset]) => ({
                key,
                label: preset.label,
                group: 'Seat the whole panel',
                note: preset.hint.slice(0, 46),
                direct: true,
                leaves: [{ label: 'Apply', value: key }]
            })),
            onPick: (row) => {
                const preset = PRESETS[row.key]
                if (!preset || !catalog) return
                state = apply(catalog, preset)
                commit()
            }
        })
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

    refreshButton.addEventListener('click', () => void refresh(true))
    runButton.addEventListener('click', () => void start())
    promptBox.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void start()
    })

    const unsubscribe = ctx.on('event', onEvent)
    void refresh(false)

    return () => {
        unsubscribe()
        if (runId) void ctx.invoke('cancel', runId)
        root.remove()
    }
}

export function activate(ctx: PluginContext): void {
    injectStyles()
    ctx.registerPanel({ id: 'eforoi', title: 'Eforoi', icon: ICON, duplicable: true }, (container) =>
        mount(ctx, container)
    )
}
