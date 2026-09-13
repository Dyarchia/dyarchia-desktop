import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

/*
 * The panel that decides what this installation is.
 *
 * The shell arrives empty and every plugin is off, so this is the first and sometimes the only
 * thing a new install has to show. It answers three questions in one screen: what is here, what
 * each one costs, and what is missing before it can run.
 */

interface Requirement {
    kind: string
    label: string
    name?: string
    hint?: string
    note?: string
}

interface CatalogueEntry {
    manifest: {
        id: string
        name: string
        version: string
        description?: string
        requires?: Requirement[]
    }
    directory: string
    enabled: boolean
    loaded: boolean
}

interface Catalogue {
    chosen: boolean
    entries: CatalogueEntry[]
}

interface Status {
    label: string
    met: boolean
    acquirable: boolean
    detail: string
}

const GEAR_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'

const STYLES = `
.set {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
.set-head {
    padding: var(--dya-space-4) var(--dya-space-4) var(--dya-space-3);
    border-bottom: var(--dya-border-width) dashed var(--dya-dashed);
}
.set-lede {
    margin-top: var(--dya-space-2);
    max-width: 68ch;
}
.set-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-3) var(--dya-space-4);
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-3);
}
.set-item {
    display: flex;
    gap: var(--dya-space-3);
    align-items: flex-start;
    padding: var(--dya-space-3);
}
.set-tick {
    margin-top: 2px;
    flex: none;
}
.set-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
}
.set-title {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-2);
    flex-wrap: wrap;
}
.set-needs {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
}
.set-need {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-2);
    flex-wrap: wrap;
}
.set-foot {
    display: flex;
    align-items: center;
    gap: var(--dya-space-3);
    padding: var(--dya-space-3) var(--dya-space-4);
    border-top: var(--dya-border-width) dashed var(--dya-dashed);
}
.set-foot-note {
    flex: 1;
    min-width: 0;
}
.set-log {
    max-height: 40%;
    overflow-y: auto;
    margin: 0 var(--dya-space-4) var(--dya-space-3);
}
.set-log[hidden] {
    display: none;
}
`

function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

export function activate(ctx: PluginContext): void {
    injectStyles(ctx.pluginId, STYLES)

    ctx.registerPanel({ id: 'settings', title: 'Setup', icon: GEAR_ICON }, (container) => {
        const root = el('div', 'set')

        const head = el('div', 'set-head')
        head.append(el('div', 'dya-eyebrow', 'Setup'))
        const lede = el('p', 'dya-text set-lede')
        head.append(lede)

        const list = el('div', 'set-list')
        const log = el('pre', 'dya-log set-log')
        log.hidden = true

        const foot = el('div', 'set-foot')
        const note = el('span', 'dya-text set-foot-note')
        const restart = el('button', 'dya-button dya-button--sm', 'Restart now') as HTMLButtonElement
        restart.hidden = true
        foot.append(note, restart)

        root.append(head, list, log, foot)
        container.append(root)

        const wanted = new Set<string>()
        let entries: CatalogueEntry[] = []
        let loadedIds = new Set<string>()

        function say(line: string): void {
            log.hidden = false
            log.append(line + '\n')
            log.scrollTop = log.scrollHeight
        }

        function pendingRestart(): boolean {
            return entries.some(
                (entry) => wanted.has(entry.manifest.id) !== loadedIds.has(entry.manifest.id)
            )
        }

        function refreshFoot(): void {
            const changed = pendingRestart()
            restart.hidden = !changed
            note.textContent = changed
                ? 'A plugin only loads at startup, so these changes take effect on the next launch.'
                : `${wanted.size} of ${entries.length} plugins enabled.`
        }

        async function persist(): Promise<void> {
            await ctx.shell.enable([...wanted])
            refreshFoot()
        }

        function renderNeeds(entry: CatalogueEntry, box: HTMLElement, statuses: Status[]): void {
            box.replaceChildren()
            const requires = entry.manifest.requires ?? []
            if (requires.length === 0) return

            for (const status of statuses) {
                const row = el('div', 'set-need')
                const badge = el(
                    'span',
                    `dya-badge ${status.met ? 'dya-badge--success' : 'dya-badge--warning'}`,
                    status.met ? 'ready' : 'needed'
                )
                row.append(badge, el('span', 'dya-text', status.label))
                row.append(el('span', 'dya-mono dya-text', status.detail))
                box.append(row)
            }

            const missing = statuses.filter((status) => !status.met)
            if (missing.length === 0) return

            if (missing.every((status) => !status.acquirable)) {
                box.append(el('p', 'dya-text', 'This one has to be installed outside Dyarchia.'))
                return
            }

            const install = el(
                'button',
                'dya-button dya-button--sm',
                'Install what this needs'
            ) as HTMLButtonElement
            install.addEventListener('click', () => {
                install.disabled = true
                install.textContent = 'Installing…'
                void ctx.invoke('acquire', {
                    pluginId: entry.manifest.id,
                    directory: entry.directory,
                    requires: entry.manifest.requires ?? []
                })
            })
            box.append(install)
        }

        async function draw(): Promise<void> {
            const catalogue = (await ctx.shell.catalogue()) as Catalogue
            entries = catalogue.entries.filter((entry) => entry.manifest.id !== ctx.pluginId)
            loadedIds = new Set(
                catalogue.entries.filter((entry) => entry.loaded).map((entry) => entry.manifest.id)
            )
            wanted.clear()
            for (const entry of entries) if (entry.enabled) wanted.add(entry.manifest.id)

            lede.textContent = catalogue.chosen
                ? 'Everything Dyarchia ships is here. Tick what you want this installation to load.'
                : 'Dyarchia ships as an empty shell. Tick the plugins you want and it will install whatever each one needs.'

            list.replaceChildren()
            for (const entry of entries) {
                const item = el('div', 'dya-card set-item')

                const tick = el('input', 'set-tick') as HTMLInputElement
                tick.type = 'checkbox'
                tick.checked = wanted.has(entry.manifest.id)

                const body = el('div', 'set-body')
                const title = el('div', 'set-title')
                title.append(el('strong', 'dya-text', entry.manifest.name))
                title.append(el('span', 'dya-mono dya-text', `v${entry.manifest.version}`))
                body.append(title)
                if (entry.manifest.description) {
                    body.append(el('p', 'dya-text', entry.manifest.description))
                }

                const needs = el('div', 'set-needs')
                body.append(needs)

                tick.addEventListener('change', () => {
                    if (tick.checked) wanted.add(entry.manifest.id)
                    else wanted.delete(entry.manifest.id)
                    void persist()
                })

                item.append(tick, body)
                list.append(item)

                void ctx
                    .invoke('inspect', {
                        pluginId: entry.manifest.id,
                        requires: entry.manifest.requires ?? []
                    })
                    .then((statuses) => renderNeeds(entry, needs, statuses as Status[]))
            }

            refreshFoot()
        }

        restart.addEventListener('click', () => void ctx.shell.relaunch())

        const offLine = ctx.on('line', (line) => say(String(line)))
        const offDone = ctx.on('done', (payload) => {
            const { ok } = payload as { ok: boolean }
            say(ok ? 'installed' : 'the installation did not finish')
            void draw()
        })

        void draw()

        return () => {
            offLine()
            offDone()
        }
    })
}
