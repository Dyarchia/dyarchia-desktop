import { glyph, injectStyles, ownIds } from '@dyarchia/sdk'
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
 * Legible means one table: a row per plugin, and the same columns in every row, so the switch, the
 * mark, the name, what it is, what it needs and whether it waits for a restart each stand in one
 * column the eye can run down. A reason is said only when a person has to act on it by hand, and
 * the folders this installation keeps are palette commands, not keys.
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
    rows: HTMLTableRowElement[]
    tick: HTMLInputElement | null
    pending: HTMLElement | null
    end: HTMLElement
    log: HTMLPreElement | null
    logRow: HTMLTableRowElement | null
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
.set-list td {
    vertical-align: middle;
}
.set-switch {
    text-align: center;
}
.set-switch > .dya-checkbox {
    display: inline-grid;
    vertical-align: middle;
}
.set-later {
    visibility: hidden;
}
.set-log-row > td {
    padding-top: 0;
}
.set-log {
    max-height: 160px;
    margin: 0;
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

function cell(className?: string, ...children: (Node | string)[]): HTMLTableCellElement {
    const td = document.createElement('td')
    if (className) td.className = className
    td.append(...children)
    return td
}

export function activate(ctx: PluginContext): void {
    injectStyles(ctx.pluginId, STYLES)
    known = ctx.shell.catalogue() as Promise<Catalogue>

    ctx.registerCommand({
        id: 'settings.files',
        title: 'Open data folder',
        icon: glyph('folder'),
        run: async () => {
            const paths = (await ctx.shell.paths()) as Paths
            await ctx.shell.reveal(paths.dataHome)
        }
    })
    ctx.registerCommand({
        id: 'settings.state',
        title: 'Open app folder',
        icon: glyph('folder'),
        run: async () => {
            const paths = (await ctx.shell.paths()) as Paths
            await ctx.shell.reveal(paths.userData)
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
        const table = document.createElement('table')
        table.className = 'dya-table set-list'
        const body = document.createElement('tbody')
        table.append(body)

        /*
         * The panel's one action sits in the tab row, and only while a choice is waiting for it.
         */
        const restart = el('button', 'dya-button dya-button--primary', 'Restart') as HTMLButtonElement
        restart.hidden = true
        handle.toolbar.append(restart)
        container.append(table)

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
            if (!row?.log || !row.logRow) return
            row.logRow.hidden = false
            row.log.append(line + '\n')
            row.log.scrollTop = row.log.scrollHeight
        }

        /*
         * Every pill a plugin needs is drawn from its manifest at once, neutral, and the inspection
         * repaints each in place: a warning when it is missing, Install at the end of the row when
         * something missing can be fetched, and the reason, once, when it cannot.
         */
        function paintNeeds(row: Row, statuses: Status[] | undefined): void {
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
                const install = el('button', 'dya-button', 'Install') as HTMLButtonElement
                install.addEventListener('click', () => acquire(row, false))
                row.install = install
                row.end.append(install)
            }
            if (row.install) {
                const busy = installing === row.entry.manifest.id
                row.install.hidden = !fetchable && !busy
                row.install.disabled = busy
                row.install.textContent = busy ? 'Installing…' : 'Install'
            }
            if (row.pending) row.pending.hidden = row.install ? !row.install.hidden : false
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
         * Every plugin is one row of six columns: a switch when it is a choice and a core pill when
         * it is not, its mark, its name, what it is, what it needs, and at the end Install or
         * whether a change waits for a restart. An install's log is a second row under it.
         */
        function build(entry: CatalogueEntry): Row {
            const tr = document.createElement('tr')
            const mark = el('span', 'dya-glyph dya-glyph--mark')
            if (entry.icon?.startsWith('<svg')) mark.innerHTML = ownIds(entry.icon)
            const description =
                entry.manifest.description && entry.manifest.description !== entry.manifest.name
                    ? entry.manifest.description
                    : ''
            const end = cell('dya-table__end')
            const row: Row = {
                entry,
                rows: [tr],
                tick: null,
                pending: null,
                end,
                log: null,
                logRow: null,
                install: null,
                why: null,
                chips: []
            }

            const switchCell = cell('dya-table__fit set-switch')
            if (entry.core) {
                switchCell.append(el('span', 'dya-tag', 'Core'))
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
                switchCell.append(tick)
                row.tick = tick
                row.pending = el('span', 'dya-badge dya-badge--warning', 'Next launch')
                end.append(row.pending)
            }

            const needs = el('div', 'dya-pills')
            const requires = entry.manifest.requires ?? []
            for (const label of requires.flatMap(needLabels)) {
                const chip = el('span', 'dya-tag', label)
                row.chips.push(chip)
                needs.append(chip)
            }
            const size = requires.find((requirement) => requirement.note)?.note
            if (size) needs.append(el('span', 'dya-meta', size))
            if (requires.length > 0) {
                const why = el('span', 'dya-meta')
                why.hidden = true
                needs.append(why)
                row.why = why
            }

            tr.append(
                switchCell,
                cell('dya-table__fit', mark),
                cell('dya-table__name', entry.manifest.name),
                cell(undefined, description),
                cell(undefined, needs),
                end
            )

            if (requires.length > 0) {
                const logRow = document.createElement('tr')
                logRow.className = 'set-log-row'
                logRow.hidden = true
                const log = el('pre', 'dya-log set-log') as HTMLPreElement
                const logCell = cell(undefined, log)
                logCell.colSpan = 4
                logRow.append(cell(), cell(), logCell)
                row.rows.push(logRow)
                row.log = log
                row.logRow = logRow
            }
            paintPending(row)
            paintNeeds(row, inspected.get(entry.manifest.id))
            return row
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
                body.replaceChildren(
                    ...ordered.flatMap((entry) => {
                        const row = build(entry)
                        rows.set(entry.manifest.id, row)
                        return row.rows
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
            if (ok && row.logRow) row.logRow.hidden = true
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

        return () => {
            disposed = true
            offLine()
            offDone()
            container.replaceChildren()
        }
    })
}
