import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

interface Prompt {
    text: string
    at: number
    endedAt: number | null
    requests: number
    input: number
    output: number
    cacheWrite: number
    cacheRead: number
    cost: number
}

interface Session {
    id: string
    title: string
    cwd: string
    model: string
    kind: 'interactive' | 'background' | 'print'
    startedAt: number
    updatedAt: number
    live: boolean
    prompts: Prompt[]
    totals: { requests: number; input: number; output: number; cacheWrite: number; cacheRead: number; cost: number }
    exactCost: number | null
}

const COINS_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>'

const STYLES = `
.costs {
    display: flex;
    height: 100%;
    min-height: 0;
}
.costs-list {
    flex: 0 0 300px;
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-2) 0;
    border-right: var(--dya-border-width) solid var(--dya-hairline);
}
.costs-entry {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.costs-entry-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.costs-entry-sum {
    flex: none;
    color: var(--dya-text-4);
}
.costs-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--dya-radius-full);
    background: var(--dya-idle);
}
.costs-dot[data-live='true'] { background: var(--dya-success); }
.costs-detail {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.costs-head {
    flex: none;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--dya-space-3);
    padding: var(--dya-space-3) var(--dya-space-4);
    border-bottom: var(--dya-border-width) solid var(--dya-hairline);
}
.costs-head-title {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
}
.costs-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
}
.costs-table td.costs-num,
.costs-table th.costs-num {
    text-align: right;
    font-variant-numeric: tabular-nums;
}
.costs-table td.costs-prompt {
    max-width: 44ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--dya-text);
}
.costs-table tr[data-live='true'] td { color: var(--dya-text); }
.costs-foot {
    flex: none;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--dya-space-3);
    padding: var(--dya-space-2) var(--dya-space-4);
    border-top: var(--dya-border-width) solid var(--dya-hairline);
}
.costs-foot .dya-value { text-transform: none; }
`

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

function tokens(count: number): string {
    if (count < 1000) return String(count)
    if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`
    return `${(count / 1_000_000).toFixed(2)}M`
}

function usd(value: number, exact: boolean): string {
    const text = value < 0.01 && value > 0 ? '<0.01' : value.toFixed(2)
    return exact ? `${text} USD` : `~${text} USD`
}

function clock(at: number): string {
    const date = new Date(at)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function duration(from: number, to: number): string {
    const seconds = Math.max(0, Math.round((to - from) / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.round(seconds / 60)
    return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`
}

export function activate(ctx: PluginContext): void {
    ctx.registerPanel({ id: 'costs', title: 'Costs', icon: COINS_ICON }, (container) => {
        injectStyles(ctx.pluginId, STYLES)

        const root = el('div', 'costs')
        const list = el('div', 'costs-list')
        const detail = el('div', 'costs-detail')
        root.append(list, detail)
        container.appendChild(root)

        let sessions: Session[] = []
        let chosen: string | null = null
        let timer: ReturnType<typeof setTimeout> | null = null
        let disposed = false

        const paintList = (): void => {
            list.replaceChildren()
            if (!sessions.length) {
                list.appendChild(el('div', 'dya-empty', 'No Claude Code session in the last fourteen days.'))
                return
            }
            for (const session of sessions) {
                const entry = el('button', session.id === chosen ? 'dya-entry dya-entry--active costs-entry' : 'dya-entry costs-entry')
                entry.type = 'button'
                const dot = el('span', 'costs-dot')
                dot.dataset.live = String(session.live)
                const cost = session.exactCost ?? session.totals.cost
                entry.append(
                    dot,
                    el('span', 'costs-entry-title', session.title),
                    el('span', 'costs-entry-sum', usd(cost, session.exactCost !== null))
                )
                entry.title = `${session.cwd}\n${session.model || 'model unknown'} · ${session.prompts.length} prompts · ${clock(session.startedAt)} to ${clock(session.updatedAt)}`
                entry.addEventListener('click', () => {
                    chosen = session.id
                    paintList()
                    paintDetail()
                })
                list.appendChild(entry)
            }
        }

        const paintDetail = (): void => {
            detail.replaceChildren()
            const session = sessions.find((entry) => entry.id === chosen)
            if (!session) {
                detail.appendChild(el('div', 'dya-empty', 'Pick a session. The figures follow it while it runs.'))
                return
            }
            const exact = session.exactCost !== null

            const head = el('div', 'costs-head')
            head.append(
                el('span', 'dya-text costs-head-title', session.title),
                el('span', 'dya-mono', session.model || 'model unknown'),
                el('span', 'dya-badge dya-badge--soft', session.kind)
            )
            if (session.live) head.appendChild(el('span', 'dya-badge dya-badge--success', 'live'))

            const scroll = el('div', 'costs-scroll')
            const table = el('table', 'dya-table costs-table')
            const header = el('tr')
            for (const [label, numeric] of [
                ['#', true],
                ['prompt', false],
                ['at', false],
                ['took', true],
                ['requests', true],
                ['input', true],
                ['cache read', true],
                ['cache write', true],
                ['output', true],
                ['usd', true]
            ] as Array<[string, boolean]>) {
                header.appendChild(el('th', numeric ? 'costs-num' : undefined, label))
            }
            table.appendChild(header)
            session.prompts.forEach((prompt, index) => {
                const row = el('tr', 'dya-row')
                const open = prompt.endedAt === null
                row.dataset.live = String(open && session.live)
                const cells: Array<[string, boolean]> = [
                    [String(index + 1), true],
                    [prompt.text, false],
                    [clock(prompt.at), false],
                    [open ? (session.live ? 'running' : 'open') : duration(prompt.at, prompt.endedAt ?? prompt.at), true],
                    [String(prompt.requests), true],
                    [tokens(prompt.input), true],
                    [tokens(prompt.cacheRead), true],
                    [tokens(prompt.cacheWrite), true],
                    [tokens(prompt.output), true],
                    [prompt.cost.toFixed(2), true]
                ]
                cells.forEach(([text, numeric], column) => {
                    const cell = el('td', numeric ? 'costs-num' : column === 1 ? 'costs-prompt' : undefined, text)
                    if (column === 1) cell.title = prompt.text
                    row.appendChild(cell)
                })
                table.appendChild(row)
            })
            scroll.appendChild(table)

            const foot = el('div', 'costs-foot')
            const totals = session.totals
            foot.append(
                el('span', 'dya-key-label', 'session'),
                el('span', 'dya-value', `${session.prompts.length} prompts · ${totals.requests} requests`),
                el('span', 'dya-value', `${tokens(totals.input + totals.cacheRead + totals.cacheWrite)} in · ${tokens(totals.output)} out`),
                el('span', 'dya-value', exact ? `${usd(session.exactCost ?? 0, true)}, the CLI's own figure` : `${usd(totals.cost, false)}, estimated from tokens`)
            )
            if (!exact) {
                foot.appendChild(el('span', 'dya-text', 'An interactive session carries no cost line, so this is tokens times a price table; a background or print run shows the figure the CLI wrote.'))
            }

            detail.append(head, scroll, foot)
        }

        const refresh = async (): Promise<void> => {
            if (disposed) return
            try {
                sessions = (await ctx.invoke('sessions')) as Session[]
                if (chosen === null && sessions.length) chosen = sessions[0].id
                paintList()
                paintDetail()
            } catch (error) {
                list.replaceChildren(el('div', 'dya-empty dya-text--danger', String(error)))
            }
        }

        const schedule = (): void => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => void refresh(), 400)
        }

        const unsubscribe = ctx.on('changed', schedule)
        const tick = setInterval(() => void refresh(), 15_000)
        void refresh()

        return () => {
            disposed = true
            unsubscribe()
            clearInterval(tick)
            if (timer) clearTimeout(timer)
            root.remove()
        }
    })
}
