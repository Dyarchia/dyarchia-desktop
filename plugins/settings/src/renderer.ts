import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

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
    padding: var(--dya-space-5) var(--dya-space-5) var(--dya-space-4);
    border-bottom: var(--dya-border-width) dashed var(--dya-dashed);
}
.set-lede {
    margin-top: var(--dya-space-2);
    max-width: 68ch;
}
.set-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-4) var(--dya-space-5) var(--dya-space-5);
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-5);
}
.set-section {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-3);
}
.set-section-head {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-3);
    flex-wrap: wrap;
}
.set-section-note {
    flex: 1;
    min-width: 24ch;
}
.set-item {
    display: flex;
    gap: var(--dya-space-4);
    align-items: flex-start;
    padding: var(--dya-space-4);
}
.set-tick {
    margin-top: 3px;
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
.set-title > .dya-badge {
    margin-inline-start: auto;
}
.set-needs {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
    margin-top: var(--dya-space-1);
}
.set-install {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    flex-wrap: wrap;
}
.set-where {
    font-size: var(--dya-size-mono-xs);
    cursor: help;
    overflow-wrap: anywhere;
}
.set-need {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-2);
    flex-wrap: wrap;
}
.set-need > * {
    min-width: 0;
    overflow-wrap: anywhere;
}
.set-needs > .dya-button {
    align-self: flex-start;
    margin-top: var(--dya-space-2);
}
.set-foot {
    display: flex;
    align-items: center;
    gap: var(--dya-space-3);
    padding: var(--dya-space-3) var(--dya-space-5);
    border-top: var(--dya-border-width) dashed var(--dya-dashed);
}
.set-foot-note {
    flex: 1;
    min-width: 0;
}
.set-log {
    max-height: 40%;
    overflow-y: auto;
    margin: 0 var(--dya-space-5) var(--dya-space-3);
}
.set-log[hidden] {
    display: none;
}
.set-detail {
    overflow-wrap: anywhere;
}
.set-tips {
    display: contents;
}
`

/* A path under the data home, in whatever separator the shell just handed back. */
function join(home: string, folder: string): string {
    return home.includes('\\') ? `${home}\\${folder}` : `${home}/${folder}`
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
            note: 'Choose what this installation loads, and see where it writes.'
        },
        (container) => {
        const root = el('div', 'set')

        const head = el('div', 'set-head')
        head.append(el('h1', 'dya-title', 'Setup'))
        const lede = el('p', 'dya-lede set-lede')
        head.append(lede)

        /*
         * Tips live in one holder under the panel root, so they leave with it. A detail that is a
         * whole command — crawlee declares a five-line Python program as the proof its environment
         * works — is collapsed to one line in the row and kept whole in the tip, because a row
         * that wraps a script across four lines is the loudest thing on a screen about something
         * else.
         */
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

        const foot = el('div', 'set-foot')
        const note = el('span', 'dya-text set-foot-note')
        const restart = el('button', 'dya-button dya-button--sm', 'Restart now') as HTMLButtonElement
        restart.hidden = true
        foot.append(note, restart)

        root.append(head, scroll, log, foot, tips)
        container.append(root)

        const wanted = new Set<string>()
        let optional: CatalogueEntry[] = []
        let home = ''

        function under(folder: string): string {
            return join(home, folder)
        }
        let loadedIds = new Set<string>()

        function say(line: string): void {
            log.hidden = false
            log.append(line + '\n')
            log.scrollTop = log.scrollHeight
        }

        function pendingRestart(): boolean {
            return optional.some(
                (entry) => wanted.has(entry.manifest.id) !== loadedIds.has(entry.manifest.id)
            )
        }

        function refreshFoot(): void {
            const changed = pendingRestart()
            restart.hidden = !changed
            note.textContent = changed
                ? 'A plugin only loads at startup, so these changes take effect on the next launch.'
                : `${wanted.size} of ${optional.length} optional plugins enabled.`
        }

        async function persist(): Promise<void> {
            await ctx.shell.enable([...wanted])
            refreshFoot()
        }

        function renderNeeds(entry: CatalogueEntry, box: HTMLElement, statuses: Status[]): void {
            box.replaceChildren()
            const requires = entry.manifest.requires ?? []
            if (requires.length === 0) return

            const strip = el('div', 'dya-pills')
            for (const status of statuses) {
                const chip = el(
                    'span',
                    `dya-badge ${status.met ? 'dya-badge--success' : 'dya-badge--warning'} dya-badge--soft`,
                    status.label
                )
                withTip(chip, `${status.met ? 'ready' : 'needed'} — ${status.detail.replace(/\s+/g, ' ').trim()}`)
                strip.append(chip)
            }
            box.append(strip)

            const missing = statuses.filter((status) => !status.met)
            if (missing.length === 0) return

            if (missing.every((status) => !status.acquirable)) {
                box.append(el('span', 'dya-badge dya-badge--warning dya-badge--soft', 'install it yourself'))
                return
            }

            const row = el('div', 'set-install')
            const install = el('button', 'dya-button dya-button--primary', 'Install') as HTMLButtonElement
            row.append(install)

            const hint = requires.find((requirement) => requirement.note)?.note
            /* The one number in that sentence is the part somebody decides on. The sentence is
             * the tip. */
            if (hint) {
                const size = /\d+(?:\.\d+)?\s*[GMK]B/i.exec(hint)?.[0]
                const tag = el('span', 'dya-tag', size ? size.toUpperCase() : 'what it needs')
                withTip(tag, hint)
                row.append(tag)
            }
            install.addEventListener('click', () => {
                install.disabled = true
                install.textContent = 'Installing…'
                void ctx.invoke('acquire', {
                    pluginId: entry.manifest.id,
                    directory: entry.directory,
                    requires: entry.manifest.requires ?? []
                })
            })
            box.append(row)
        }

        /*
         * One card per optional plugin: the tick, what it is, what state it is in, and the list of
         * things it needs before it can run. The badge says which of three states it is in —
         * loaded now, ticked for the next launch, or off — because "enabled" and "running" are
         * different answers and a panel that shows one of them is the reason somebody ticks a box
         * and then wonders why nothing happened.
         */
        function renderOptional(entry: CatalogueEntry): HTMLElement {
            const item = el('div', 'dya-card set-item')

            const tick = el('input', 'dya-checkbox set-tick') as HTMLInputElement
            tick.type = 'checkbox'
            tick.checked = wanted.has(entry.manifest.id)
            tick.setAttribute('aria-label', `Load ${entry.manifest.name}`)

            const body = el('div', 'set-body')
            const title = el('div', 'set-title')
            title.append(el('strong', 'dya-text', entry.manifest.name))
            title.append(el('span', 'dya-mono dya-text', `v${entry.manifest.version}`))

            const state = loadedIds.has(entry.manifest.id)
                ? { text: 'loaded', kind: 'dya-badge--success' }
                : wanted.has(entry.manifest.id)
                  ? { text: 'next launch', kind: 'dya-badge--warning' }
                  : { text: 'not loaded', kind: 'dya-badge--soft' }
            const badge = el('span', `dya-badge ${state.kind}`, state.text)
            title.append(badge)
            body.append(title)

            if (entry.manifest.description) {
                body.append(el('p', 'dya-text', entry.manifest.description))
            }

            if (entry.manifest.data && home) {
                const where = el('span', 'dya-mono dya-text set-where', under(entry.manifest.data))
                withTip(where, 'where what this plugin makes for you is kept')
                body.append(where)
            }

            const needs = el('div', 'set-needs')
            body.append(needs)

            tick.addEventListener('change', () => {
                if (tick.checked) wanted.add(entry.manifest.id)
                else wanted.delete(entry.manifest.id)
                badge.className = `dya-badge ${
                    loadedIds.has(entry.manifest.id)
                        ? 'dya-badge--success'
                        : tick.checked
                          ? 'dya-badge--warning'
                          : 'dya-badge--soft'
                }`
                badge.textContent = loadedIds.has(entry.manifest.id)
                    ? 'loaded'
                    : tick.checked
                      ? 'next launch'
                      : 'not loaded'
                void persist()
            })

            item.append(tick, body)

            void ctx
                .invoke('inspect', {
                    pluginId: entry.manifest.id,
                    requires: entry.manifest.requires ?? []
                })
                .then((statuses) => renderNeeds(entry, needs, statuses as Status[]))

            return item
        }

        function section(title: string, hint: string): HTMLElement {
            const box = el('section', 'set-section')
            const header = el('div', 'set-section-head')
            header.append(el('span', 'dya-eyebrow', title))
            if (hint) header.append(el('span', 'dya-text set-section-note', hint))
            box.append(header)
            return box
        }

        function renderPaths(paths: Paths): HTMLElement {
            const box = section('Where things go', '')
            const table = el('table', 'dya-table')
            const body = el('tbody')

            const rows: [string, string, boolean][] = [
                ['Your files', paths.dataHome, true],
                ['This installation', paths.application, false],
                ['Settings and state', paths.userData, false]
            ]
            for (const [label, value, openable] of rows) {
                const row = el('tr', 'dya-row')
                row.append(el('td', 'dya-table__key', label), el('td', undefined, value))
                const last = el('td', 'dya-table__end')
                if (openable) {
                    const open = el('button', 'dya-button dya-button--sm', 'Open')
                    open.addEventListener('click', () => void ctx.shell.reveal(value))
                    last.append(open)
                }
                row.append(last)
                body.append(row)
            }
            table.append(body)
            box.append(table)
            return box
        }

        async function draw(): Promise<void> {
            const [catalogue, paths] = (await Promise.all([
                ctx.shell.catalogue(),
                ctx.shell.paths()
            ])) as [Catalogue, Paths]
            home = paths.dataHome
            const entries = catalogue.entries.filter((entry) => entry.manifest.id !== ctx.pluginId)
            optional = entries.filter((entry) => !entry.core)
            const core = entries.filter((entry) => entry.core)
            loadedIds = new Set(
                catalogue.entries.filter((entry) => entry.loaded).map((entry) => entry.manifest.id)
            )
            wanted.clear()
            for (const entry of optional) if (entry.enabled) wanted.add(entry.manifest.id)

            lede.textContent = 'These two need something Dyarchia cannot carry. The rest always loads.'

            scroll.replaceChildren()

            const choices = section('Optional', '')
            for (const entry of optional) choices.append(renderOptional(entry))
            scroll.append(choices)

            if (core.length > 0) {
                const included = section('Included', '')
                const table = el('table', 'dya-table')
                const body = el('tbody')
                for (const entry of core) {
                    const row = el('tr', 'dya-row')
                    row.append(
                        el('td', 'dya-table__name', entry.manifest.name),
                        el('td', undefined, entry.manifest.description ?? '')
                    )
                    body.append(row)
                }
                table.append(body)
                included.append(table)
                scroll.append(included)
            }

            scroll.append(renderPaths(paths))

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
