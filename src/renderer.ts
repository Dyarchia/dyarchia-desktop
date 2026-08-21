import type { PluginContext } from '@dyarchia/sdk'
import { openMenu } from './menu.js'
import type { MenuLeaf, MenuRow } from './menu.js'
import { STYLES, STYLE_ID } from './styles.js'
import type { Analysis, Catalog, CatalogEntry, MemberResult, Mode, RunEvent, Seat } from './types.js'

const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 7v10M7 12h10"/></svg>'

const STORAGE = 'eforoi:seats'
const MIN_PANEL = 2
const MAX_PANEL = 5

interface Stored {
    panel: Seat[]
    analyst: Seat | null
}

interface Card {
    card: HTMLElement
    dot: HTMLElement
    title: HTMLElement
    body: HTMLElement
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
    if (document.getElementById(STYLE_ID)) return
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

function load(): Stored | null {
    try {
        const raw = localStorage.getItem(STORAGE)
        return raw ? (JSON.parse(raw) as Stored) : null
    } catch {
        return null
    }
}

function save(stored: Stored): void {
    try {
        localStorage.setItem(STORAGE, JSON.stringify(stored))
    } catch {
        /* a full quota is not worth failing a run over */
    }
}

function usable(entry: CatalogEntry): boolean {
    return entry.modes.some((mode) => mode.available)
}

function firstMode(entry: CatalogEntry): Mode | null {
    return entry.modes.find((mode) => mode.available)?.mode ?? null
}

const DEMOTE = /free|mini|reserve|lightning|flash|contributor|preview/i
const UNPAID = 'opencode/opencode/'

function score(entry: CatalogEntry): number {
    let penalty = 0
    if (DEMOTE.test(entry.key)) penalty += 1000
    if (entry.key.startsWith(UNPAID)) penalty += 500
    return entry.rank + penalty
}

function best(
    catalog: Catalog,
    family: (entry: CatalogEntry) => boolean,
    taken: CatalogEntry[]
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
            .sort((left, right) => score(left) - score(right))[0] ?? null
    )
}

function seed(catalog: Catalog): Stored {
    const families = [
        (entry: CatalogEntry) => entry.group === 'Anthropic',
        (entry: CatalogEntry) => entry.group === 'OpenAI',
        (entry: CatalogEntry) => entry.group.startsWith('opencode'),
        () => true
    ]

    const chosen: CatalogEntry[] = []
    for (const family of families) {
        if (chosen.length >= 3) break
        const pick = best(catalog, family, chosen)
        if (pick) chosen.push(pick)
    }

    while (chosen.length < MIN_PANEL) {
        const spare = best(catalog, () => true, chosen)
        if (!spare) break
        chosen.push(spare)
    }

    const picks = chosen
        .map((entry): Seat | null => {
            const mode = firstMode(entry)
            return mode ? { key: entry.key, mode } : null
        })
        .filter((seat): seat is Seat => seat !== null)

    return { panel: picks, analyst: picks[0] ?? null }
}

function mount(ctx: PluginContext, container: HTMLElement): () => void {
    const root = el('div', 'eforoi')
    const scroll = el('div', 'eforoi-scroll')
    root.appendChild(scroll)
    container.appendChild(root)

    let catalog: Catalog | null = null
    let state: Stored = load() ?? { panel: [], analyst: null }
    let runId: string | null = null

    const promptBox = el('textarea', 'eforoi-prompt')
    promptBox.placeholder = 'Ask the panel'

    const seats = el('div', 'eforoi-seats')
    const bar = el('div', 'eforoi-bar')
    const results = el('div', 'eforoi-scroll')
    results.style.padding = '0'
    results.style.overflow = 'visible'
    results.style.flex = 'none'

    const runButton = el('button', 'eforoi-button', 'Run')
    const addButton = el('button', 'eforoi-button eforoi-icon', '+')
    const removeButton = el('button', 'eforoi-button eforoi-icon', '−')
    const refreshButton = el('button', 'eforoi-button', 'Refresh')
    const status = el('span', 'eforoi-meta')

    addButton.title = 'add a panel member'
    removeButton.title = 'remove the last panel member'
    refreshButton.title = 'rediscover installed CLIs, plans and API models'

    bar.append(addButton, removeButton, refreshButton, el('span', 'eforoi-spacer'), status, runButton)

    scroll.append(
        el('div', 'eforoi-label', 'Prompt'),
        promptBox,
        el('div', 'eforoi-label', 'Panel'),
        seats,
        bar,
        results
    )

    const entryOf = (key: string): CatalogEntry | undefined =>
        catalog?.entries.find((candidate) => candidate.key === key)

    const describe = (seat: Seat | null): string => {
        if (!seat) return 'select a model'
        return entryOf(seat.key)?.label ?? seat.key
    }

    const rowsFor = (selected: Seat | null): MenuRow[] => {
        if (!catalog) return []
        return catalog.entries.map((entry) => ({
            label: entry.label,
            group: entry.group,
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
        save(state)
        renderSeats()
    }

    const pickSeat = (anchor: HTMLElement, current: Seat | null, apply: (seat: Seat) => void): void => {
        openMenu({
            anchor,
            rows: rowsFor(current),
            filter: 'filter models',
            onPick: (row, leaf) => {
                const entry = catalog?.entries.find((candidate) => candidate.label === row.label)
                if (!entry) return
                apply({ key: entry.key, mode: leaf.value as Mode })
                commit()
            }
        })
    }

    const seatRow = (seat: Seat | null, ordinal: string, apply: (next: Seat) => void): HTMLElement => {
        const row = el('div', 'eforoi-seat')
        if (ordinal === '*') row.dataset.role = 'analyst'

        const model = el('button', 'eforoi-pick')
        model.textContent = describe(seat)
        model.dataset.empty = String(!seat)
        model.addEventListener('click', () => pickSeat(model, seat, apply))

        const mode = el('button', 'eforoi-pick eforoi-mode')
        const offer = seat ? entryOf(seat.key)?.modes.find((candidate) => candidate.mode === seat.mode) : null
        mode.textContent = seat ? `${seat.mode === 'api' ? 'API' : 'Subscription'} ›` : '—'
        mode.dataset.empty = String(!seat)
        if (offer && !offer.available) {
            mode.style.color = 'var(--e-danger)'
            mode.title = offer.reason ?? 'unavailable'
        }
        mode.addEventListener('click', () => pickSeat(mode, seat, apply))

        row.append(el('span', 'eforoi-ordinal', ordinal), model, mode)
        return row
    }

    function renderSeats(): void {
        seats.replaceChildren()
        state.panel.forEach((seat, index) => {
            seats.appendChild(
                seatRow(seat, String(index + 1), (next) => {
                    state.panel[index] = next
                })
            )
        })
        seats.appendChild(
            seatRow(state.analyst, '*', (next) => {
                state.analyst = next
            })
        )
        addButton.disabled = state.panel.length >= MAX_PANEL
        removeButton.disabled = state.panel.length <= MIN_PANEL
    }

    const cards = new Map<string, Card>()

    const card = (id: string, title: string): Card => {
        const existing = cards.get(id)
        if (existing) return existing

        const wrapper = el('div', 'eforoi-card')
        const head = el('button', 'eforoi-card-head')
        const dot = el('span', 'eforoi-dot')
        const label = el('span', 'eforoi-card-title', title)
        const body = el('div', 'eforoi-body')

        head.append(dot, label)
        head.addEventListener('click', () => {
            body.hidden = !body.hidden
        })
        wrapper.append(head, body)
        results.appendChild(wrapper)

        const made = { card: wrapper, dot, title: label, body }
        cards.set(id, made)
        return made
    }

    const renderAnalysis = (analysis: Analysis, ms: number): void => {
        const target = card('analysis', `Analysis · ${seconds(ms)}`)
        target.dot.dataset.state = 'done'
        target.body.replaceChildren()
        target.body.style.padding = '0'
        target.body.style.whiteSpace = 'normal'

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
            target.body.appendChild(block)
        }

        const tag = (label: string): string => `<span class="eforoi-tag">${label}</span>`
        const escape = (text: string): string =>
            text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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

        if (!target.body.childElementCount) {
            const block = el('div', 'eforoi-section')
            block.appendChild(el('h4', undefined, 'Nothing to separate them'))
            target.body.appendChild(block)
        }
    }

    const memberTitle = (result: MemberResult): string => {
        const entry = entryOf(result.seat.key)
        const label = entry?.label ?? result.seat.key
        const parts = [seconds(result.ms), result.seat.mode === 'api' ? 'API' : 'plan']
        if (result.usage.costUsd) parts.push(money(result.usage.costUsd))
        if (result.usage.outputTokens) parts.push(`${result.usage.outputTokens} out`)
        return `${result.index}. ${label} — ${parts.join(' · ')}`
    }

    const reset = (): void => {
        cards.clear()
        results.replaceChildren()
    }

    const onEvent = (raw: unknown): void => {
        const event = raw as RunEvent
        if (event.runId !== runId) return

        if (event.type === 'stage') {
            status.textContent = `${event.stage}…`
            if (event.stage === 'analysis') card('analysis', 'Analysis').dot.dataset.state = 'running'
            if (event.stage === 'answer') card('answer', 'Answer').dot.dataset.state = 'running'
            return
        }

        if (event.type === 'member:delta') {
            const target = card(`member-${event.index}`, `${event.index}. running`)
            target.dot.dataset.state = 'running'
            target.body.textContent = (target.body.textContent ?? '') + event.text
            return
        }

        if (event.type === 'member:done') {
            const target = card(`member-${event.result.index}`, memberTitle(event.result))
            target.title.textContent = memberTitle(event.result)
            target.dot.dataset.state = event.result.error ? 'error' : 'done'
            if (event.result.error) {
                target.body.replaceChildren(el('div', 'eforoi-error', event.result.error))
            } else if (!target.body.textContent) {
                target.body.textContent = event.result.text
            }
            target.body.hidden = true
            return
        }

        if (event.type === 'analysis') {
            renderAnalysis(event.analysis, event.ms)
            return
        }

        if (event.type === 'answer:delta') {
            const target = card('answer', 'Answer')
            target.dot.dataset.state = 'running'
            target.body.textContent = (target.body.textContent ?? '') + event.text
            return
        }

        if (event.type === 'done') {
            card('answer', 'Answer').dot.dataset.state = 'done'
            const spend =
                event.summary.meteredCostUsd > 0
                    ? ` · ${money(event.summary.meteredCostUsd)} metered`
                    : ' · plan only'
            status.textContent = `${seconds(event.summary.ms)}${spend} · ${event.summary.outputTokens} out`
            runId = null
            runButton.textContent = 'Run'
            return
        }

        if (event.type === 'error') {
            status.textContent = ''
            results.appendChild(el('div', 'eforoi-error', event.message))
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

        reset()
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

        if (state.panel.length < MIN_PANEL) {
            const seeded = seed(catalog)
            state.panel = seeded.panel
            state.analyst = state.analyst ?? seeded.analyst
        }

        renderSeats()
        const live = Object.entries(catalog.routes)
            .filter(([, value]) => value.available)
            .map(([id]) => id)
        status.textContent = live.length ? `routes: ${live.join(' ')}` : 'no route available'
    }

    addButton.addEventListener('click', () => {
        if (state.panel.length >= MAX_PANEL || !catalog) return
        const spare = catalog.entries.find(
            (entry) => usable(entry) && !state.panel.some((seat) => seat.key === entry.key)
        )
        const mode = spare ? firstMode(spare) : null
        if (spare && mode) state.panel.push({ key: spare.key, mode })
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
