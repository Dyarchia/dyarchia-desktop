import { glyph, injectStyles, ownIds, tips } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'
import { needLabels } from './needs.js'
import type { Requirement, Status } from './needs.js'

/*
 * The panel that decides what this installation is.
 *
 * It used to list every plugin as a tick, which asked the wrong question. Four of them are the
 * application — Setup, a terminal, a reader, a player — and nobody is better off without a
 * terminal, so they are stated rather than offered. The two that are left are the ones that reach
 * outside for something: an agent CLI that spends money, and an interpreter with a browser behind
 * it. Those are a decision, and this panel exists to make that decision legible.
 *
 * Legible means three things per plugin, in this order: what it does, what it will go and get, and
 * where what it produces ends up. What a reader needs at rest is the name, the state and the one
 * action; the paths are a menu one press away, and a reason is said only when a person has to act
 * on it by hand.
 *
 * And still. The sheet is modal and sized by its content, so every row is drawn in its final shape
 * in the first frame, from the manifest, and what the disk says later only repaints it in place.
 */

interface CatalogueEntry {
    manifest: {
        id: string
        name: string
        version: string
        description?: string
        data?: string
        requires?: Requirement[]
    }
    directory: string
    icon?: string
    core: boolean
    enabled: boolean
    loaded: boolean
}

interface Catalogue {
    chosen: boolean
    entries: CatalogueEntry[]
}

interface Paths {
    dataHome: string
    userData: string
    application: string
}

interface Row {
    entry: CatalogueEntry
    item: HTMLElement
    tick: HTMLInputElement | null
    pending: HTMLElement | null
    needs: HTMLElement | null
    log: HTMLPreElement | null
    install: HTMLButtonElement | null
    why: HTMLElement | null
    chips: HTMLElement[]
}

/*
 * The panel's mark, one of a set in black and white and nothing else, each a thing of Sparta:
 * a hoplite shield bearing a delta, for Dyarchia.
 * Solid shapes rather than hairlines, so it reads as a key at 18px.
 */
const GEAR_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10.6" fill="#eceef2"/><path d="M12 5.6 17.9 17.2H6.1z" fill="none" stroke="#0a0a0b" stroke-width="2.3" stroke-linejoin="round"/></svg>'

const STYLES = `
.set {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
.set-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
/*
 * One grid for every row, so the switch, the mark, the name and the pending pill of each plugin
 * stand in the same columns: a row is a subgrid of the list. The first column is as wide as the
 * core pill, and a switch is centred in it.
 */
.set-list {
    display: grid;
    grid-template-columns: max-content 28px minmax(0, 1fr) auto;
    column-gap: var(--dya-space-4);
    row-gap: var(--dya-space-2);
}
.set-plugin {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    row-gap: var(--dya-space-3);
    align-items: start;
    padding: var(--dya-space-4);
    border: var(--dya-border-width) solid var(--dya-hairline);
    border-radius: var(--dya-radius-card);
    background: var(--dya-glass-card);
}
.set-toggle,
.set-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
}
.set-mark {
    width: 28px;
    height: 28px;
}
.set-mark > svg {
    display: block;
    width: 100%;
    height: 100%;
}
.set-text {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    min-width: 0;
}
.set-name {
    font-size: var(--dya-size-h4);
    color: var(--dya-text);
}
.set-later {
    visibility: hidden;
}
.set-needs {
    grid-column: 3 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dya-space-2);
    min-height: 28px;
}
.set-log {
    grid-column: 3 / -1;
    max-height: 160px;
    margin: 0;
}
.set-folders {
    position-area: bottom span-left;
    inset: auto;
    margin: var(--dya-space-2) 0 0;
    min-width: 280px;
}
`

/*
 * What the panel last knew, kept across mounts: the catalogue is asked for when the plugin
 * activates and each inspection is remembered, so opening Setup draws its rows in their final
 * shape at once and the fresh answers only restate them.
 */
let known: Promise<Catalogue> | null = null
const inspected = new Map<string, Status[]>()

function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

export function activate(ctx: PluginContext): void {
    injectStyles(ctx.pluginId, STYLES)
    known = ctx.shell.catalogue() as Promise<Catalogue>

    ctx.registerCommand({
        id: 'settings.files',
        title: 'Your files',
        icon: glyph('folder'),
        run: async () => {
            const paths = (await ctx.shell.paths()) as Paths
            await ctx.shell.reveal(paths.dataHome)
        }
    })
    ctx.registerCommand({
        id: 'settings.restart',
        title: 'Restart',
        icon: glyph('refresh'),
        run: () => ctx.shell.relaunch()
    })

    ctx.registerPanel(
        {
            id: 'settings',
            title: 'Setup',
            icon: GEAR_ICON,
            modal: true
        },
        (container, handle) => {
        const root = el('div', 'set')
        const scope = handle.instanceId.replace(/[^a-zA-Z0-9_-]/g, '')

        const tipHolder = el('div')
        const withTip = tips(tipHolder)

        const scroll = el('div', 'set-scroll')
        const list = el('div', 'set-list')
        scroll.append(list)

        /*
         * The panel's two actions sit in the tab row: restart, only while a choice is waiting for
         * it, and the folders this installation keeps, a click away rather than three rows of
         * absolute paths at the top of the panel.
         */
        const restart = el('button', 'dya-button dya-button--primary dya-button--sm', 'Restart to apply') as HTMLButtonElement
        restart.hidden = true

        const folders = el('button', 'dya-key')
        folders.innerHTML = glyph('folder')
        folders.setAttribute('aria-label', 'Folders')
        withTip(folders, 'Folders')
        const menu = el('div', 'dya-menu set-folders')
        menu.id = `set-folders-${scope}`
        menu.setAttribute('popover', 'auto')
        menu.setAttribute('role', 'menu')
        const anchor = `--${menu.id}`
        folders.style.setProperty('anchor-name', anchor)
        menu.style.setProperty('position-anchor', anchor)
        folders.setAttribute('popovertarget', menu.id)

        handle.toolbar.append(restart, folders, menu)
        root.append(scroll, tipHolder)
        container.append(root)

        const wanted = new Set<string>()
        const rows = new Map<string, Row>()
        let loadedIds = new Set<string>()
        let installing: string | null = null
        let disposed = false

        function refreshRestart(): void {
            restart.hidden = ![...rows.values()].some(
                ({ entry }) => !entry.core && wanted.has(entry.manifest.id) !== loadedIds.has(entry.manifest.id)
            )
        }

        function paintPending(row: Row): void {
            if (!row.pending) return
            const waiting = wanted.has(row.entry.manifest.id) !== loadedIds.has(row.entry.manifest.id)
            row.pending.classList.toggle('set-later', !waiting)
        }

        async function persist(): Promise<void> {
            await ctx.shell.enable([...wanted])
            refreshRestart()
        }

        function say(line: string): void {
            const row = installing ? rows.get(installing) : undefined
            if (!row?.log) return
            row.log.hidden = false
            row.log.append(line + '\n')
            row.log.scrollTop = row.log.scrollHeight
        }

        /*
         * Every pill a plugin needs is drawn from its manifest at once, neutral, and the inspection
         * repaints each in place: a warning when it is missing, Install at the end of the line when
         * something missing can be fetched, and the reason, once, when it cannot.
         */
        function paintNeeds(row: Row, statuses: Status[] | undefined): void {
            if (!row.needs) return
            statuses?.forEach((status, index) => {
                const chip = row.chips[index]
                if (!chip) return
                chip.className = status.met ? 'dya-tag' : 'dya-badge dya-badge--warning'
                chip.textContent = status.label
            })
            if (row.why && statuses) {
                const by = statuses.filter((status) => !status.met && !status.acquirable).map((status) => status.detail)
                row.why.textContent = by.join(' - ')
                row.why.hidden = by.length === 0
            }
            const fetchable = statuses?.some((status) => !status.met && status.acquirable) ?? false
            if (fetchable && !row.install) {
                const install = el('button', 'dya-button dya-button--sm', 'Install') as HTMLButtonElement
                install.addEventListener('click', () => acquire(row, false))
                row.install = install
                row.needs.append(install)
            }
            if (row.install) {
                const busy = installing === row.entry.manifest.id
                row.install.hidden = !fetchable && !busy
                row.install.disabled = busy
                row.install.textContent = busy ? 'Installing…' : 'Install'
            }
        }

        function inspect(row: Row): void {
            const requires = row.entry.manifest.requires ?? []
            if (requires.length === 0) return
            void ctx
                .invoke('inspect', { pluginId: row.entry.manifest.id, requires })
                .then((statuses) => {
                    inspected.set(row.entry.manifest.id, statuses as Status[])
                    if (!disposed) paintNeeds(row, statuses as Status[])
                })
        }

        function acquire(row: Row, withPlugin: boolean): void {
            if (installing) return
            installing = row.entry.manifest.id
            row.log?.replaceChildren()
            paintNeeds(row, inspected.get(row.entry.manifest.id))
            void ctx
                .invoke('acquire', {
                    pluginId: row.entry.manifest.id,
                    directory: row.entry.directory,
                    requires: row.entry.manifest.requires ?? [],
                    ...(withPlugin ? { withPlugin: true } : {})
                })
                .catch((error: unknown) => {
                    say(String(error instanceof Error ? error.message : error))
                    installing = null
                    paintNeeds(row, inspected.get(row.entry.manifest.id))
                })
        }

        /*
         * Every plugin is one row: a switch when it is a choice and a core pill when it is not, its
         * face and name, what it is, and at the end whether a change waits for a restart.
         */
        function build(entry: CatalogueEntry): Row {
            const item = el('div', 'set-plugin')
            const toggleCell = el('div', 'set-toggle')
            const mark = el('span', 'set-mark')
            if (entry.icon?.startsWith('<svg')) mark.innerHTML = ownIds(entry.icon)

            const text = el('div', 'set-text')
            text.append(el('span', 'set-name', entry.manifest.name))
            if (entry.manifest.description && entry.manifest.description !== entry.manifest.name) {
                text.append(el('span', 'dya-text set-desc', entry.manifest.description))
            }

            const row: Row = { entry, item, tick: null, pending: null, needs: null, log: null, install: null, why: null, chips: [] }
            const state = el('div', 'set-state')

            if (entry.core) {
                toggleCell.append(el('span', 'dya-tag', 'Core'))
            } else {
                const tick = el('input', 'dya-checkbox') as HTMLInputElement
                tick.type = 'checkbox'
                tick.checked = wanted.has(entry.manifest.id)
                tick.setAttribute('aria-label', entry.manifest.name)
                tick.addEventListener('change', () => {
                    if (tick.checked) wanted.add(entry.manifest.id)
                    else wanted.delete(entry.manifest.id)
                    if (tick.checked && (entry.manifest.requires ?? []).some((need) => need.withPlugin)) {
                        acquire(row, true)
                    }
                    paintPending(row)
                    void persist()
                })
                toggleCell.append(tick)
                row.tick = tick
                row.pending = el('span', 'dya-badge dya-badge--warning', 'Next launch')
                state.append(row.pending)
            }
            item.append(toggleCell, mark, text, state)

            const requires = entry.manifest.requires ?? []
            if (requires.length > 0) {
                const needs = el('div', 'set-needs')
                for (const label of requires.flatMap(needLabels)) {
                    const chip = el('span', 'dya-tag', label)
                    row.chips.push(chip)
                    needs.append(chip)
                }
                const size = requires.find((requirement) => requirement.note)?.note
                if (size) needs.append(el('span', 'dya-meta', size))
                const why = el('span', 'dya-meta')
                why.hidden = true
                needs.append(why)
                row.why = why
                const log = el('pre', 'dya-log set-log') as HTMLPreElement
                log.hidden = true
                item.append(needs, log)
                row.needs = needs
                row.log = log
            }
            paintPending(row)
            paintNeeds(row, inspected.get(entry.manifest.id))
            return row
        }

        function renderFolders(paths: Paths): void {
            menu.replaceChildren()
            const places: [string, string][] = [
                ['Your files', paths.dataHome],
                ['This installation', paths.application],
                ['Settings and state', paths.userData]
            ]
            for (const [label, value] of places) {
                const item = el('button', 'dya-menu__item dya-menu__item--tall')
                item.setAttribute('role', 'menuitem')
                const text = el('span', 'dya-menu__text')
                text.append(el('span', undefined, label), el('span', 'dya-menu__note dya-mono', value))
                item.append(text)
                item.addEventListener('click', () => {
                    menu.hidePopover()
                    void ctx.shell.reveal(value)
                })
                menu.append(item)
            }
        }

        /*
         * The rows are built once, from whatever catalogue is at hand, and a fresher one only
         * repaints which boxes are ticked and which plugins are loaded. A set of plugins that
         * changed underneath is the one case that rebuilds.
         */
        function apply(catalogue: Catalogue): void {
            const entries = catalogue.entries.filter((entry) => entry.manifest.id !== ctx.pluginId)
            loadedIds = new Set(catalogue.entries.filter((entry) => entry.loaded).map((entry) => entry.manifest.id))
            wanted.clear()
            for (const entry of entries) if (!entry.core && entry.enabled) wanted.add(entry.manifest.id)

            const ordered = [...entries.filter((entry) => entry.core), ...entries.filter((entry) => !entry.core)]
            const same = ordered.length === rows.size && ordered.every((entry) => rows.has(entry.manifest.id))
            if (same) {
                for (const entry of ordered) {
                    const row = rows.get(entry.manifest.id)!
                    row.entry = entry
                    if (row.tick) row.tick.checked = wanted.has(entry.manifest.id)
                    paintPending(row)
                }
            } else {
                rows.clear()
                list.replaceChildren(
                    ...ordered.map((entry) => {
                        const row = build(entry)
                        rows.set(entry.manifest.id, row)
                        return row.item
                    })
                )
                for (const row of rows.values()) inspect(row)
            }
            refreshRestart()
        }

        restart.addEventListener('click', () => void ctx.shell.relaunch())

        const offLine = ctx.on('line', (line) => say(String(line)))
        const offDone = ctx.on('done', (payload) => {
            const { pluginId, ok } = payload as { pluginId: string; ok: boolean }
            const row = rows.get(pluginId)
            if (!ok) say('Failed')
            installing = null
            if (!row) return
            if (ok && row.log) row.log.hidden = true
            paintNeeds(row, inspected.get(pluginId))
            inspect(row)
        })

        void (known ?? (ctx.shell.catalogue() as Promise<Catalogue>)).then((catalogue) => {
            if (disposed) return
            apply(catalogue)
            known = ctx.shell.catalogue() as Promise<Catalogue>
            void known.then((fresh) => {
                if (!disposed) apply(fresh)
            })
        })
        void (ctx.shell.paths() as Promise<Paths>).then((paths) => {
            if (!disposed) renderFolders(paths)
        })

        return () => {
            disposed = true
            offLine()
            offDone()
        }
    })
}
