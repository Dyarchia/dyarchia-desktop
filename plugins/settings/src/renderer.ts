import { glyph, injectStyles, ownIds } from '@dyarchia/sdk'
import type { PluginCatalogueEntry, PluginContext } from '@dyarchia/sdk'

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
 * where what it produces ends up. The last one was missing entirely, which is how a corpus came to
 * be written into a temporary folder for a whole release without anybody being able to see it.
 *
 * Legible is also short. The first cut answered all three in full sentences, and a card that says
 * everything says it in eleven lines: a lede, a description, a destination, four requirement rows
 * each carrying an absolute path, a warning about the download and a button. What a reader needs
 * at rest is the name, the state and the one action; the paths and the reasons are tips, one hover
 * away, and the reader who never needs them never pays for them.
 */

interface Requirement {
    kind: string
    label: string
    name?: string
    hint?: string
    note?: string
    withPlugin?: boolean
}

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

interface Status {
    label: string
    met: boolean
    acquirable: boolean
    detail: string
}

/*
 * The panel's mark, one of a set drawn for this application in its own three colours, black,
 * garnet and white, so the marks read as one family and as Dyarchia's. Flat layers, a shadow on the
 * lower half, no gradients, because the same mark is drawn several times at once and a gradient is
 * found by id.
 */
const GEAR_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.55 9.67 L22 9.97 L22 14.03 L19.55 14.33 L18.99 15.69 L20.5 17.64 L17.64 20.5 L15.69 18.99 L14.33 19.55 L14.03 22 L9.97 22 L9.67 19.55 L8.31 18.99 L6.36 20.5 L3.5 17.64 L5.01 15.69 L4.45 14.33 L2 14.03 L2 9.97 L4.45 9.67 L5.01 8.31 L3.5 6.36 L6.36 3.5 L8.31 5.01 L9.67 4.45 L9.97 2 L14.03 2 L14.33 4.45 L15.69 5.01 L17.64 3.5 L20.5 6.36 L18.99 8.31Z" fill="#eceef2" stroke="#eceef2" stroke-width=".8" stroke-linejoin="round"/><path d="M3 13.2a9 9 0 0 0 18 0z" fill="#0a0a0b" fill-opacity=".18"/><circle cx="12" cy="12" r="4.6" fill="#111214"/><circle cx="12" cy="12" r="2.6" fill="#c42a38"/></svg>'

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
    padding: var(--dya-space-4);
}
.set-scroll > .dya-table {
    width: 100%;
}
.set-toggle {
    width: 1%;
}
.set-scroll .dya-table__prose {
    min-width: 20ch;
}
.set-needs {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--dya-space-2);
    max-width: 280px;
}
.set-log {
    max-height: 40%;
    overflow-y: auto;
    margin: 0 var(--dya-space-4) var(--dya-space-3);
}
.set-folders {
    position-area: bottom span-left;
    inset: auto;
    margin: var(--dya-space-2) 0 0;
    min-width: 280px;
}
.set-tips {
    display: contents;
}
`

/*
 * A plugin's name beside its icon, the face it wears on its key, its tile and its tabs. This is
 * the one screen that lists every plugin at once, so it is where a reader learns which face is
 * which. A plugin that is not loaded has shown no icon yet and is its name alone.
 */
function named(entry: PluginCatalogueEntry, tag: string, className: string): HTMLElement {
    const name = el(tag, className)
    const inner = el('span', 'dya-legend')
    if (entry.icon?.startsWith('<svg')) {
        const glyph = el('span', 'dya-glyph')
        glyph.innerHTML = ownIds(entry.icon)
        inner.append(glyph)
    }
    inner.append(entry.manifest.name)
    name.append(inner)
    return name
}

function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

export function activate(ctx: PluginContext): void {
    injectStyles(ctx.pluginId, STYLES)

    ctx.registerPanel(
        {
            id: 'settings',
            title: 'Setup',
            icon: GEAR_ICON,
            width: 560,
            maxWidth: 880
        },
        (container, handle) => {
        const root = el('div', 'set')

        const tips = el('div', 'set-tips')
        let tipSeq = 0
        const withTip = (control: HTMLElement, text: string): void => {
            const tip = el('div', 'dya-tip', text)
            tip.id = `set-tip-${++tipSeq}`
            tip.setAttribute('popover', 'hint')
            tips.append(tip)
            control.setAttribute('interestfor', tip.id)
        }

        const scroll = el('div', 'set-scroll')
        const log = el('pre', 'dya-log set-log')
        log.hidden = true

        /*
         * The panel's two actions sit in the tab row: restart, only while a choice is waiting for
         * it, and the folders this installation keeps, which are a click away rather than three
         * rows of absolute paths at the top of the panel.
         */
        const restart = el('button', 'dya-button dya-button--primary dya-button--sm', 'Restart to apply') as HTMLButtonElement
        restart.hidden = true

        const folders = el('button', 'dya-key')
        folders.innerHTML = glyph('folder')
        folders.setAttribute('aria-label', 'Folders')
        withTip(folders, 'Folders')
        const menu = el('div', 'dya-menu set-folders')
        menu.id = `set-folders-${handle.instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`
        menu.setAttribute('popover', 'auto')
        menu.setAttribute('role', 'menu')
        const anchor = `--${menu.id}`
        folders.style.setProperty('anchor-name', anchor)
        menu.style.setProperty('position-anchor', anchor)
        folders.setAttribute('popovertarget', menu.id)

        handle.toolbar.append(restart, folders, menu)
        root.append(scroll, log, tips)
        container.append(root)

        const wanted = new Set<string>()
        let optional: CatalogueEntry[] = []
        let loadedIds = new Set<string>()

        function say(line: string): void {
            log.hidden = false
            log.append(line + '\n')
            log.scrollTop = log.scrollHeight
        }

        function refreshRestart(): void {
            restart.hidden = !optional.some(
                (entry) => wanted.has(entry.manifest.id) !== loadedIds.has(entry.manifest.id)
            )
        }

        async function persist(): Promise<void> {
            await ctx.shell.enable([...wanted])
            refreshRestart()
        }

        /*
         * A requirement that says it comes with its plugin is fetched the moment the plugin is
         * turned on, with no Install key in between: turning it on is the decision.
         */
        function acquireWith(entry: CatalogueEntry): void {
            const requires = entry.manifest.requires ?? []
            if (!requires.some((requirement) => requirement.withPlugin)) return
            say(`installing what ${entry.manifest.name} needs`)
            void ctx.invoke('acquire', {
                pluginId: entry.manifest.id,
                directory: entry.directory,
                requires,
                withPlugin: true
            })
        }

        /*
         * What a plugin needs is said only when it is missing: a warning pill per missing thing,
         * its reason one hover away, and Install with its size when it can be fetched. A plugin
         * with everything it needs says nothing about needing it.
         */
        function renderNeeds(entry: CatalogueEntry, box: HTMLElement, statuses: Status[]): void {
            box.replaceChildren()
            const missing = statuses.filter((status) => !status.met)
            for (const status of missing) {
                const chip = el('span', 'dya-badge dya-badge--warning', status.label)
                withTip(chip, status.detail)
                box.append(chip)
            }
            if (missing.length === 0) return
            if (missing.every((status) => !status.acquirable)) return

            const install = el('button', 'dya-button dya-button--sm', 'Install') as HTMLButtonElement
            const size = (entry.manifest.requires ?? []).find((requirement) => requirement.note)?.note
            if (size) withTip(install, size)
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

        /*
         * Every plugin is one row: a switch when it is a choice, its face and name, what it is, and
         * on the right only what asks for attention: a change that waits for a restart, or
         * something it needs and does not have. The four plugins the application is made of have
         * no switch, because nobody is better off without a terminal.
         */
        function row(entry: CatalogueEntry): HTMLElement {
            const tr = el('tr', 'dya-row')
            const toggleCell = el('td', 'set-toggle')
            const end = el('td', 'dya-table__end')
            const needs = el('div', 'set-needs')
            end.append(needs)

            const pending = el('span', 'dya-badge dya-badge--warning', 'next launch')
            const paintPending = (): void => {
                pending.hidden = entry.core || wanted.has(entry.manifest.id) === loadedIds.has(entry.manifest.id)
            }

            if (!entry.core) {
                const tick = el('input', 'dya-checkbox') as HTMLInputElement
                tick.type = 'checkbox'
                tick.checked = wanted.has(entry.manifest.id)
                tick.setAttribute('aria-label', `Load ${entry.manifest.name}`)
                tick.addEventListener('change', () => {
                    if (tick.checked) wanted.add(entry.manifest.id)
                    else wanted.delete(entry.manifest.id)
                    if (tick.checked) acquireWith(entry)
                    paintPending()
                    void persist()
                })
                toggleCell.append(tick)
            }
            paintPending()

            tr.append(
                toggleCell,
                named(entry, 'td', 'dya-table__name'),
                el(
                    'td',
                    'dya-table__prose',
                    entry.manifest.description === entry.manifest.name ? '' : (entry.manifest.description ?? '')
                ),
                end
            )
            needs.append(pending)
            const status = el('div', 'set-needs')
            needs.append(status)

            if ((entry.manifest.requires ?? []).length > 0) {
                void ctx
                    .invoke('inspect', {
                        pluginId: entry.manifest.id,
                        requires: entry.manifest.requires ?? []
                    })
                    .then((statuses) => renderNeeds(entry, status, statuses as Status[]))
            }
            return tr
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

        async function draw(): Promise<void> {
            const [catalogue, paths] = (await Promise.all([
                ctx.shell.catalogue(),
                ctx.shell.paths()
            ])) as [Catalogue, Paths]
            const entries = catalogue.entries.filter((entry) => entry.manifest.id !== ctx.pluginId)
            optional = entries.filter((entry) => !entry.core)
            loadedIds = new Set(
                catalogue.entries.filter((entry) => entry.loaded).map((entry) => entry.manifest.id)
            )
            wanted.clear()
            for (const entry of optional) if (entry.enabled) wanted.add(entry.manifest.id)

            renderFolders(paths)

            const table = el('table', 'dya-table')
            const body = el('tbody')
            const ordered = [
                ...entries.filter((entry) => entry.core),
                ...optional
            ]
            for (const entry of ordered) body.append(row(entry))
            table.append(body)
            scroll.replaceChildren(table)
            refreshRestart()
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
