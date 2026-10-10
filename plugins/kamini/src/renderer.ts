import { glyph, injectStyles, tips } from '@dyarchia/sdk'
import type { GlyphName, PluginContext } from '@dyarchia/sdk'
import { intro, sections } from './help.js'
import { CAPABILITIES, EFFORTS, KINDS, NAME, TARGETS, TRANSPORTS, carries, fieldsOf, hookEvents, hookFields, hookTypes, serverFields } from './targets.js'
import type { Field, Kind, Target } from './targets.js'
import type { Agent, Compiled, Definition, Found, Hook, Listing, Note, Placement, Plugin, Server, Skill, Value, Written } from './types.js'

/*
 * Kamini: every definition an agent CLI reads, for every CLI that reads it, in one place.
 *
 * The list takes the whole panel and what is open takes its place, so nothing is ever cut to fit a
 * column. The list has three faces: the Workbench, what is being made here, the Library, what was
 * marked done, and Installed, what each CLI already
 * has, in folders by CLI and by where it came from, a plugin's parts inside that plugin. A
 * definition is edited in tabs and kept the moment it changes; a new one is a
 * draft until its first change, so opening and closing one leaves nothing. What is open closes
 * with its X or with Escape. Nothing reaches a CLI until Export, which writes only what each CLI
 * can carry and never a file somebody else wrote or changed since.
 */

const ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="fill:none;stroke:var(--dya-text)"><path d="M2.5 7.5h15c2 0 3.5-.6 4-1.5v3c-1.2 1.6-3.3 2.5-5.5 2.5h-.5v1.5l-2 1.8V17h2.5v2.5h-9V17H9v-2.2l-2-1.8v-1.5c-2.6 0-4.5-1.7-4.5-4Z"/></svg>'

const STYLES = `
.kamini {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    outline: none;
}
.kamini[data-view='list'] > .kamini-editor,
.kamini[data-view='editor'] > .kamini-list {
    display: none;
}
.kamini-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--dya-space-5);
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-4);
}
.kamini-list .kamini-fold-body {
    padding-bottom: var(--dya-space-2);
}
.kamini-menu {
    position-area: bottom span-left;
    margin: var(--dya-space-1) 0 0;
    min-width: 12rem;
}
.kamini-menu .dya-menu__item > svg {
    width: 15px;
    height: 15px;
    flex: none;
}
.kamini-section {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
}
.kamini-section__head {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-height: var(--dya-size-control);
}
.kamini-rows {
    width: max-content;
    max-width: 100%;
}
.kamini-group {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
}
.kamini-group + .kamini-group {
    padding-top: var(--dya-space-3);
}
.kamini-editor {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
}
.kamini-head {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    padding: var(--dya-space-4) var(--dya-space-4) 0;
}
.kamini-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--dya-space-5);
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-5) var(--dya-space-4) var(--dya-space-4);
}
.kamini-form--text {
    flex: 1 0 auto;
    grid-template-columns: max-content minmax(0, 1fr);
    grid-template-rows: var(--kamini-rows);
}
.kamini-form--text > :not(.dya-label, .kamini-text__editor) {
    max-width: 560px;
}
.kamini-text__editor {
    align-self: stretch;
    min-height: 240px;
    margin-top: calc((var(--dya-size-control) - 1lh) / 2);
    font-size: var(--dya-size-mono-xs);
    line-height: var(--dya-leading-body);
}
@container pane (min-width: 1200px) {
    .kamini-form--text {
        grid-template-columns: max-content minmax(0, 560px) minmax(0, 1fr);
    }
    .kamini-form--text > .kamini-text__label {
        grid-column: 3;
        grid-row: 1;
        margin-inline-start: var(--dya-space-6);
    }
    .kamini-form--text > .kamini-text__editor {
        grid-column: 3;
        grid-row: 2 / -1;
        margin-inline-start: var(--dya-space-6);
    }
}
@container pane (max-width: 399.98px) {
    .kamini-form--text {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: none;
    }
}
.kamini-body > .dya-stack,
.kamini-body > .dya-field,
.kamini-body > details {
    max-width: 760px;
}
.kamini-checks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--kamini-check), 1fr));
    gap: 0 var(--dya-space-4);
}
.kamini-checks--mono {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-sm);
}
.kamini-check {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-height: var(--dya-size-control);
}
.kamini-cli {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dya-space-2);
}
.kamini-cli--flat {
    min-height: var(--dya-size-control);
    padding-inline-start: calc(14px + var(--dya-space-2));
}
.kamini-cli__name {
    width: 13ch;
}
.kamini-cli__where {
    flex: 1 1 280px;
    max-width: 480px;
}
.kamini-fold-body {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    padding: var(--dya-space-3) 0 var(--dya-space-4) var(--dya-space-5);
}
.kamini-fold-head > .dya-key {
    margin-left: auto;
}
.kamini-out {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-3);
}
.kamini-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dya-space-2) var(--dya-space-3);
}
.kamini-out .dya-code {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.kamini-help {
    overflow-y: auto;
}
.kamini-help .dya-table {
    width: 100%;
}
.kamini-help td {
    vertical-align: top;
}
`

type Plan = [string, Compiled][]
type Face = 'workbench' | 'library' | 'installed'

const TABS: Record<Kind, string[]> = {
    agent: ['Agent', 'Tools', 'Skills', 'Hooks', 'MCP', 'CLIs', 'Output'],
    skill: ['Skill', 'Files', 'CLIs', 'Output'],
    command: ['Command', 'CLIs', 'Output'],
    prompt: ['Prompt', 'CLIs', 'Output'],
    memory: ['Memory', 'CLIs', 'Output'],
    rule: ['Rule', 'CLIs', 'Output'],
    plugin: ['Plugin', 'Members', 'Hooks', 'MCP', 'CLIs', 'Output']
}

/*
 * Kamini's own marks, drawn on the SDK's grid and stroke so they sit beside its glyphs, and Greek
 * because the app is: a Corinthian helmet for an agent, a scroll for a skill, a spear for a
 * command, a herald's staff for a prompt, a wax tablet for memory, a column for a rule, an amphora
 * for a plugin, and Athena's owl for help. None of them means anything else anywhere in the app.
 */
const SINGULAR: Record<Kind, string> = {
    agent: 'Agent',
    skill: 'Skill',
    command: 'Command',
    prompt: 'Prompt',
    memory: 'Memory',
    rule: 'Rule',
    plugin: 'Plugin'
}

const MARK = (paths: string): string =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const MARKS: Record<Kind | 'help' | 'import', string> = {
    agent: MARK('<path d="M5 21v-9a7 7 0 0 1 14 0v9"/><path d="M8 12.5h8"/><path d="M12 12.5V21"/><path d="M12 2v3"/>'),
    skill: MARK('<path d="M18 17V5a2 2 0 0 0-2-2H5"/><path d="M8 21h11a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2h4"/><path d="M10 8h5"/><path d="M10 12h5"/>'),
    command: MARK('<path d="M3 21 13 11"/><path d="M13 11c0-4 2.5-6.5 8-8-1.5 5.5-4 8-8 8z"/><path d="m5 17 2 2"/>'),
    prompt: MARK('<path d="M12 6v16"/><circle cx="12" cy="4" r="2"/><path d="M10 7C7 5 4.5 5 3 6c1.5 2 4 3 7 3"/><path d="M14 7c3-2 5.5-2 7-1-1.5 2-4 3-7 3"/><path d="M9 11c0 2 6 2 6 4s-6 2-6 4"/><path d="M15 11c0 2-6 2-6 4s6 2 6 4"/>'),
    memory: MARK('<rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/><path d="M5.5 9h3"/><path d="M5.5 13h3"/><path d="M15.5 9h3"/><path d="M15.5 13h3"/>'),
    rule: MARK('<path d="M4 3h16"/><path d="m6 3 1 3h10l1-3"/><path d="M8 6v13"/><path d="M12 6v13"/><path d="M16 6v13"/><path d="M5 19h14"/><path d="M4 22h16"/>'),
    plugin: MARK('<path d="M9 2h6"/><path d="M10 2v4c-3 1-5 4-5 8 0 3.5 3 6 7 8 4-2 7-4.5 7-8 0-4-2-7-5-8V2"/><path d="M10 5C7 5 6 7 7 10"/><path d="M14 5c3 0 4 2 3 5"/>'),
    help: MARK('<path d="M4 4l3 2.5a9 9 0 0 1 10 0L20 4v10a8 8 0 0 1-16 0z"/><circle cx="8.5" cy="11.5" r="2.5"/><circle cx="15.5" cy="11.5" r="2.5"/><path d="m11 15 1 2 1-2"/>'),
    import: MARK('<path d="M12 3v11"/><path d="m8 10 4 4 4-4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>')
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

function label(text: string, mono = false): HTMLElement {
    return el('span', mono ? 'dya-label dya-mono' : 'dya-label', text)
}

function empty(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === 'object') return Object.keys(value as object).length === 0
    return false
}

function pairs(text: string, separator: '=' | ':'): Record<string, string> {
    const doc: Record<string, string> = {}
    for (const line of text.split(/\r?\n/)) {
        const at = line.indexOf(separator)
        if (at > 0) doc[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
    return doc
}

function unpairs(doc: Record<string, string>, separator: '=' | ':'): string {
    return Object.entries(doc)
        .map(([key, value]) => `${key}${separator === '=' ? '=' : ': '}${value}`)
        .join('\n')
}

function names(ids: string[]): string {
    return ids.map((id) => TARGETS.find((each) => each.id === id)?.name ?? id).join(', ')
}

export function activate(ctx: PluginContext): void {
    ctx.registerPanel({ id: 'kamini', title: 'Kamini', icon: ICON }, (container, handle) => {
        injectStyles(ctx.pluginId, STYLES)
        const tipHolder = el('div')
        const tip = tips(tipHolder)

        const root = el('div', 'kamini')
        root.tabIndex = -1
        root.dataset.view = 'list'
        const list = el('nav', 'kamini-list')
        const editor = el('section', 'kamini-editor')
        const scrim = el('div', 'dya-scrim')
        scrim.hidden = true
        const sheet = el('aside', 'dya-sheet dya-sheet--modal dya-pane kamini-help')
        sheet.setAttribute('role', 'dialog')
        sheet.setAttribute('aria-modal', 'true')
        sheet.setAttribute('aria-label', 'Help')
        sheet.hidden = true
        root.append(list, editor, scrim, sheet, tipHolder)
        container.append(root)

        let listing = Object.fromEntries(KINDS.map(({ kind }) => [kind, []])) as unknown as Listing
        let face: Face = 'workbench'
        let current: Definition | null = null
        let draft = false
        let found: Found[] = []
        let viewing: Found | null = null
        let project = ''
        let tab = ''
        let home = ''
        let saving: Promise<void> = Promise.resolve()
        let timer: number | undefined
        let relist = false
        let results: Written[] = []
        let opened = -1
        const unfolded = new Set<string>()
        let disposed = false

        function key(name: GlyphName | keyof typeof MARKS, words: string, act: () => void): HTMLButtonElement {
            const button = el('button', 'dya-key')
            button.type = 'button'
            button.innerHTML = name in MARKS ? MARKS[name as keyof typeof MARKS] : glyph(name as GlyphName)
            button.setAttribute('aria-label', words)
            tip(button, words)
            button.addEventListener('click', (event) => {
                event.stopPropagation()
                act()
            })
            return button
        }

        function button(words: string, act: () => void): HTMLButtonElement {
            const node = el('button', 'dya-button', words)
            node.type = 'button'
            node.addEventListener('click', act)
            return node
        }

        /*
         * The tab row: help for what is on screen, the importer, the bin for what is open, its
         * close, Done or Reopen, which moves a definition between the Workbench and the Library,
         * and the view's one primary: Export for a definition, Copy for one installed.
         */
        const helpKey = key('help', 'Help', () => openHelp())
        const importKey = key('import', 'Import', () => void importFiles())
        const removeKey = key('delete', 'Delete', () => void removeCurrent())
        const exportButton = key('open', 'Export', () => void exportCurrent())
        exportButton.classList.add('dya-key--primary')
        const copyButton = key('add', 'Copy', () => void adopt())
        copyButton.classList.add('dya-key--primary')
        const doneButton = key('check', 'Done', () => toggleDone())
        /*
         * Making something starts at one key: the plus opens the seven kinds, anchored under it,
         * and the one chosen opens its editor a level in.
         */
        const anchor = `--kamini-make-${handle.instanceId.replace(/\W/g, '')}`
        const makeMenu = el('div', 'dya-menu kamini-menu')
        makeMenu.popover = 'auto'
        makeMenu.setAttribute('role', 'menu')
        makeMenu.style.setProperty('position-anchor', anchor)
        for (const { kind } of KINDS) {
            const item = el('button', 'dya-menu__item')
            item.type = 'button'
            item.setAttribute('role', 'menuitem')
            item.innerHTML = MARKS[kind]
            item.append(el('span', '', SINGULAR[kind]))
            item.addEventListener('click', () => {
                makeMenu.hidePopover()
                void create(kind)
            })
            makeMenu.append(item)
        }
        const makeKey = key('add', 'New', () => makeMenu.togglePopover())
        makeKey.style.setProperty('anchor-name', anchor)
        root.append(makeMenu)
        const strip = el('div', 'dya-toolbar')
        strip.append(makeKey, helpKey, importKey, removeKey)
        handle.toolbar.append(strip, doneButton, exportButton, copyButton)

        function toggleDone(): void {
            if (!current) return
            current.done = !current.done
            face = current.done ? 'library' : 'workbench'
            changed(true)
            void closeCurrent()
        }

        function paintBar(): void {
            const editing = root.dataset.view === 'editor'
            handle.navigate({
                back: editing ? () => void closeCurrent() : trail.length ? () => void switchFace(trail.pop()!, false) : null,
                home:
                    editing || face !== 'workbench'
                        ? () => {
                              trail.length = 0
                              void closeCurrent().then(() => switchFace('workbench', false))
                          }
                        : null
            })
            removeKey.hidden = !(current && !draft && editing)
            exportButton.hidden = !(current && editing)
            copyButton.hidden = !(viewing && editing)
            importKey.hidden = editing || face !== 'workbench'
            makeKey.hidden = editing
            doneButton.hidden = !(current && editing)
            doneButton.setAttribute('aria-pressed', String(Boolean(current?.done)))
            doneButton.setAttribute('aria-label', current?.done ? 'Reopen' : 'Done')
        }

        /*
         * Every change is kept a moment after the last keystroke, in order: a rename changes the
         * id the next save is keyed by, so saves never overlap. The first change of a draft is
         * the one that makes it exist.
         */
        function changed(repaintList = false): void {
            relist ||= repaintList || draft
            draft = false
            paintBar()
            window.clearTimeout(timer)
            timer = window.setTimeout(flush, 350)
        }

        function flush(): Promise<void> {
            if (timer !== undefined) {
                window.clearTimeout(timer)
                timer = undefined
                const repaintList = relist
                relist = false
                saving = saving.then(() => persist(repaintList)).catch(() => undefined)
            }
            return saving
        }

        async function persist(repaintList: boolean): Promise<void> {
            if (!current) return
            const item = current
            const previous = item.id
            const saved = (await ctx.invoke('save', item, previous)) as Definition
            item.id = saved.id
            if (repaintList || item.id !== previous) await refreshList()
        }

        async function refreshList(): Promise<void> {
            listing = (await ctx.invoke('list')) as Listing
            if (!disposed) paintList()
        }

        function faces(): HTMLElement {
            const tabs = el('div', 'dya-tabs')
            tabs.setAttribute('role', 'tablist')
            for (const [id, words] of [['workbench', 'Workbench'], ['library', 'Library'], ['installed', 'Installed']] as const) {
                const node = el('button', 'dya-tab', words)
                node.type = 'button'
                node.setAttribute('role', 'tab')
                node.setAttribute('aria-selected', String(face === id))
                node.addEventListener('click', () => void switchFace(id))
                tabs.append(node)
            }
            return tabs
        }

        /*
         * The faces visited are a trail, so back returns to the one before as it does anywhere.
         */
        const trail: Face[] = []

        async function switchFace(next: Face, going = true): Promise<void> {
            if (next === face) return
            await closeCurrent()
            if (going) trail.push(face)
            face = next
            if (face === 'installed') await discover()
            paintList()
            paintEditor()
        }

        function row(kind: Kind, words: string, selected: boolean, open: () => void): HTMLLIElement {
            const item = el('li')
            const node = el('button', 'dya-file')
            node.type = 'button'
            node.innerHTML = MARKS[kind]
            node.append(el('span', 'dya-file__name', words))
            node.setAttribute('aria-current', String(selected))
            node.addEventListener('click', open)
            item.append(node)
            return item
        }

        /*
         * A list is one column of rows as wide as its longest name: never cut, and never a pointer
         * ground stretched across the whole panel.
         */
        function rows(entries: { kind: Kind; words: string; selected: boolean; open: () => void }[]): HTMLElement {
            const list = el('ul', 'dya-files kamini-rows')
            for (const entry of entries) list.append(row(entry.kind, entry.words, entry.selected, entry.open))
            return list
        }

        function folder(id: string, title: string, meta: string, fill: (body: HTMLElement) => void): HTMLElement {
            const fold = foldOf(title, meta, unfolded.has(id))
            fold.node.addEventListener('toggle', () => {
                if (fold.node.open) unfolded.add(id)
                else unfolded.delete(id)
            })
            fill(fold.body)
            return fold.node
        }

        function foundRows(entries: Found[]): HTMLElement {
            const words = (entry: Found): string => (entry.kind === 'plugin' ? entry.path.split(/[\\/]/).pop()! : entry.name)
            return rows(entries.map((entry) => ({ kind: entry.kind, words: words(entry), selected: viewing?.path === entry.path, open: () => void view(entry) })))
        }

        /*
         * What the CLIs have, kind by kind, in a folder per CLI and, inside it, the home's and the
         * project's apart. A definition several CLIs read from one shared place is one folder
         * naming all of them. What a plugin brings is not loose among the rest: it is inside that
         * plugin, under Plugins, beside the manifest that installed it.
         */
        function paintInstalled(sectionsList: HTMLElement[]): void {
            const form = el('div', 'dya-form kamini-project')
            const join = el('div', 'dya-join')
            const field = el('input', 'dya-field dya-field--code')
            field.value = project
            field.setAttribute('aria-label', 'Project')
            field.addEventListener('change', () => void setProject(field.value.trim()))
            join.append(
                field,
                key('folder', 'Choose folder', async () => {
                    const chosen = (await ctx.invoke('folder')) as string | null
                    if (chosen) await setProject(chosen)
                })
            )
            form.append(label('Project'), join)
            sectionsList.push(form)
            for (const { kind, title } of KINDS) {
                const own = found.filter((entry) => entry.kind === kind && entry.scope !== 'plugin')
                const packages = kind === 'plugin' ? found.filter((entry) => entry.kind === 'plugin' && entry.plugin) : []
                if (!own.length && !packages.length) continue
                const node = el('div', 'kamini-section')
                const head = el('div', 'kamini-section__head')
                head.append(el('span', 'dya-eyebrow', title))
                node.append(head)
                const first = (entry: Found): number => Math.min(...entry.targets.map((id) => TARGETS.findIndex((each) => each.id === id)))
                own.sort((a, b) => first(a) - first(b) || a.targets.length - b.targets.length)
                packages.sort((a, b) => first(a) - first(b) || a.name.localeCompare(b.name))
                const byCli = new Map<string, Found[]>()
                for (const entry of own) byCli.set(names(entry.targets), [...(byCli.get(names(entry.targets)) ?? []), entry])
                for (const [clis, entries] of byCli) {
                    node.append(
                        folder(`${kind}:${clis}`, clis, String(entries.length), (body) => {
                            if (entries.every((entry) => entry.scope === 'user')) {
                                body.append(foundRows(entries))
                                return
                            }
                            for (const scope of ['user', 'project'] as const) {
                                const part = entries.filter((entry) => entry.scope === scope)
                                if (!part.length) continue
                                const group = el('div', 'kamini-group')
                                group.append(el('span', 'dya-label', scope === 'user' ? 'User' : 'Project'), foundRows(part))
                                body.append(group)
                            }
                        })
                    )
                }
                const byOwner = new Map<string, Found[]>()
                for (const entry of packages) byOwner.set(names(entry.targets), [...(byOwner.get(names(entry.targets)) ?? []), entry])
                for (const [clis, manifests] of byOwner) {
                    node.append(
                        folder(`plugins:${clis}`, clis, String(manifests.length), (body) => {
                            for (const manifest of manifests) {
                                const inside = found.filter((entry) => entry.plugin?.root === manifest.plugin!.root)
                                body.append(
                                    folder(`plugin:${manifest.plugin!.root}`, manifest.name, manifest.plugin!.version, (parts) => {
                                        const rank = (entry: Found): number => (entry.kind === 'plugin' ? -1 : KINDS.findIndex((each) => each.kind === entry.kind))
                                        parts.append(foundRows(inside.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))))
                                    })
                                )
                            }
                        })
                    )
                }
                sectionsList.push(node)
            }
        }

        function paintList(): void {
            const sectionsList: HTMLElement[] = [faces()]
            if (face === 'installed') paintInstalled(sectionsList)
            else {
                /*
                 * One section per kind, one under another as on the Installed face. On the
                 * Workbench a kind with nothing in it is only its head and the key that makes one;
                 * the Library shows only the kinds it holds, and nothing is made there.
                 */
                const done = face === 'library'
                for (const { kind, title } of KINDS) {
                    const entries = listing[kind].filter((entry) => entry.done === done)
                    if (!entries.length) continue
                    const node = el('div', 'kamini-section')
                    const head = el('div', 'kamini-section__head')
                    head.append(el('span', 'dya-eyebrow', title))
                    node.append(head, rows(entries.map((entry) => ({ kind, words: entry.name, selected: false, open: () => void select(kind, entry.id) }))))
                    sectionsList.push(node)
                }
                /*
                 * An empty Workbench is not a blank: it offers the seven kinds as rows, from the top
                 * left like every list, each opening its editor.
                 */
                if (!done && sectionsList.length === 1) {
                    sectionsList.push(rows(KINDS.map(({ kind }) => ({ kind, words: SINGULAR[kind], selected: false, open: () => void create(kind) }))))
                }
            }
            list.replaceChildren(...sectionsList)
            settle()
        }

        async function setProject(next: string): Promise<void> {
            project = next
            await ctx.invoke('state', { project })
            await discover()
            paintList()
        }

        async function discover(): Promise<void> {
            found = (await ctx.invoke('installed', project)) as Found[]
            if (viewing && !found.some((entry) => entry.path === viewing!.path)) viewing = null
        }

        async function select(kind: Kind, id: string): Promise<void> {
            await flush()
            const data = (await ctx.invoke('get', kind, id)) as Definition | null
            if (!data || disposed) return
            open(data, false)
        }

        /*
         * After what is open changes, the keys that were pressed may be gone from the document, and
         * the focus with them; the panel takes it so Escape still reaches it.
         */
        function settle(): void {
            const active = document.activeElement
            if (!active || active === document.body) root.focus({ preventScroll: true })
        }

        function open(data: Definition, isDraft: boolean): void {
            current = data
            draft = isDraft
            viewing = null
            tab = TABS[data.kind][0]!
            results = []
            root.dataset.view = 'editor'
            paintList()
            paintEditor()
            settle()
        }

        async function create(kind: Kind): Promise<void> {
            await flush()
            if (face !== 'workbench') {
                trail.push(face)
                face = 'workbench'
            }
            open((await ctx.invoke('blank', kind)) as Definition, true)
        }

        /*
         * Closing what is open: a draft nobody touched is simply forgotten, anything else has
         * already been kept, and the pane goes back to the list.
         */
        async function closeCurrent(): Promise<void> {
            await flush()
            current = null
            draft = false
            viewing = null
            root.dataset.view = 'list'
            paintList()
            paintEditor()
            settle()
        }

        async function removeCurrent(): Promise<void> {
            if (!current || draft) return
            if (!window.confirm(`Delete '${current.name}'? Exported files stay.`)) return
            window.clearTimeout(timer)
            timer = undefined
            await saving
            listing = (await ctx.invoke('remove', current.kind, current.id)) as Listing
            current = null
            root.dataset.view = 'list'
            paintList()
            paintEditor()
            settle()
        }

        async function importFiles(): Promise<void> {
            await flush()
            const fresh = (await ctx.invoke('import')) as Listing | null
            if (!fresh) return
            listing = fresh
            paintList()
        }

        async function exportCurrent(replace: string[] = []): Promise<void> {
            if (!current) return
            if (draft) changed(true)
            await flush()
            const outcome = (await ctx.invoke('export', current.kind, current.id, replace)) as { written: Written[]; problems: string[] }
            results = outcome.written
            tab = 'Output'
            paintEditor()
        }

        async function view(entry: Found): Promise<void> {
            await flush()
            current = null
            draft = false
            viewing = entry
            root.dataset.view = 'editor'
            paintList()
            paintEditor()
            settle()
        }

        async function adopt(): Promise<void> {
            if (!viewing) return
            const made = (await ctx.invoke('adopt', viewing.path)) as Definition | null
            if (!made) return
            face = 'workbench'
            await refreshList()
            open(made, false)
        }

        /*
         * Help for what is on screen, in a sheet over the panel: what the tab is for, then each of
         * its fields with what it does, who reads it, its default and the page that documents it.
         */
        function openHelp(): void {
            const kind = current?.kind ?? 'agent'
            const topic = current ? tab : viewing || face === 'installed' ? 'Installed' : face === 'library' ? 'Library' : 'Workbench'
            const on = (each: Target): boolean => !current || (current.targets[each.id]?.on ?? false)
            const head = el('div', 'dya-sheet__head')
            head.append(el('span', 'dya-title', topic))
            const end = el('div', 'dya-sheet__end')
            end.append(key('close', 'Close', closeHelp))
            head.append(end)
            const body = el('div', 'dya-stack')
            const words = intro(topic)
            if (words) body.append(el('p', 'dya-text', words))
            for (const section of current ? sections(kind, tab, on) : []) {
                if (!section.lines.length) continue
                if (section.title !== topic) body.append(el('span', 'dya-eyebrow', section.title))
                const table = el('table', 'dya-table')
                const tbody = el('tbody')
                table.append(tbody)
                for (const line of section.lines) {
                    const tr = el('tr')
                    const name = el('td', 'dya-table__fit')
                    name.append(el('span', 'dya-mono', line.key))
                    const note = el('td', 'dya-table__prose')
                    note.append(el('span', 'dya-text', line.note))
                    const meta = [line.who, line.fallback === undefined ? '' : `default ${line.fallback}`].filter(Boolean).join(' - ')
                    if (meta) note.append(el('div', 'dya-meta dya-meta--wrap', meta))
                    const link = el('td', 'dya-table__end')
                    if (line.url) {
                        const anchor = el('a', 'dya-link', 'Docs')
                        anchor.href = line.url
                        link.append(anchor)
                    }
                    tr.append(name, note, link)
                    tbody.append(tr)
                }
                body.append(table)
            }
            sheet.replaceChildren(head, body)
            for (const node of [list, editor]) node.inert = true
            scrim.hidden = false
            sheet.hidden = false
            end.querySelector('button')?.focus()
        }

        function closeHelp(): void {
            sheet.hidden = true
            scrim.hidden = true
            for (const node of [list, editor]) node.inert = false
            root.focus({ preventScroll: true })
        }

        scrim.addEventListener('click', closeHelp)
        root.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            const typing = event.target instanceof HTMLElement && event.target.matches('textarea, input, select')
            if (sheet.hidden && !typing && !current && !viewing) return
            event.preventDefault()
            if (!sheet.hidden) closeHelp()
            else if (typing) root.focus({ preventScroll: true })
            else void closeCurrent()
        })

        /*
         * One control per field, whatever the CLI: a choice where the values are known, a set of
         * ticks for a list of known names, lines for a free list, JSON for a table, and a field
         * otherwise. Blank is never written, so the CLI's own default is the blank choice.
         */
        function control(field: Field, value: Value | undefined, set: (next: Value | undefined) => void): HTMLElement {
            const placeholder = field.default === undefined || (field.type === 'int' && typeof field.default !== 'number') ? '' : String(field.default)
            if (field.type === 'bool' || field.type === 'enum') {
                const options = field.type === 'bool' ? ['true', 'false'] : (field.values ?? [])
                return choose(field.key, value === undefined ? '' : String(value), ['', ...options], placeholder, (next) => {
                    set(next === '' ? undefined : field.type === 'bool' ? next === 'true' : next)
                })
            }
            if (field.type === 'list' && field.values?.length) {
                const chosen = new Set(Array.isArray(value) ? value : [])
                const box = checks(field.values, true)
                for (const option of field.values) {
                    box.append(
                        check(option, chosen.has(option), (on) => {
                            if (on) chosen.add(option)
                            else chosen.delete(option)
                            set([...chosen])
                        }, true)
                    )
                }
                return box
            }
            if (field.type === 'list' || field.type === 'text') {
                const area = el('textarea', field.type === 'text' ? 'dya-field dya-field--prose' : 'dya-field dya-field--code')
                if (field.type === 'text') area.rows = 3
                area.value = Array.isArray(value) ? value.join('\n') : value === undefined ? '' : String(value)
                area.setAttribute('aria-label', field.key)
                area.addEventListener('input', () => {
                    if (field.type === 'text') set(area.value || undefined)
                    else set(area.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
                })
                return area
            }
            if (field.type === 'object' || field.type === 'map') {
                const stack = el('div', 'dya-form__stack')
                const area = el('textarea', 'dya-field dya-field--code')
                area.placeholder = '{ }'
                area.setAttribute('aria-label', field.key)
                area.value = value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
                const problem = el('span', 'dya-problem', 'Not JSON')
                problem.hidden = true
                area.addEventListener('input', () => {
                    const text = area.value.trim()
                    if (!text) {
                        problem.hidden = true
                        set(undefined)
                        return
                    }
                    try {
                        set(JSON.parse(text) as Value)
                        problem.hidden = true
                    } catch {
                        if (/^[\w.:/-]+$/.test(text)) {
                            set(text)
                            problem.hidden = true
                        } else problem.hidden = false
                    }
                })
                stack.append(area, problem)
                return stack
            }
            const input = el('input', 'dya-field dya-field--code')
            input.type = field.type === 'int' ? 'number' : 'text'
            input.placeholder = placeholder
            input.value = value === undefined ? '' : String(value)
            input.setAttribute('aria-label', field.key)
            input.addEventListener('input', () => {
                const text = input.value.trim()
                set(text === '' ? undefined : field.type === 'int' ? Number(text) : input.value)
            })
            return input
        }

        function choose(what: string, value: string, options: string[], fallback: string, apply: (next: string) => void, words: Record<string, string> = {}): HTMLElement {
            const wrap = el('span', 'dya-select')
            const select = el('select', 'dya-field')
            select.setAttribute('aria-label', what)
            const shown = el('button')
            shown.type = 'button'
            shown.append(document.createElement('selectedcontent'))
            select.append(shown)
            for (const option of options) {
                const node = el('option')
                node.value = option
                node.textContent = words[option] ?? (option === '' ? 'Default' : option)
                if (option === '' && fallback) node.append(el('span', 'dya-select__note', fallback))
                node.selected = option === value
                select.append(node)
            }
            select.addEventListener('change', () => apply(select.value))
            wrap.append(select)
            return wrap
        }

        /*
         * Ticks stand in a grid whose columns are as wide as the longest name among them, so they
         * line up in columns however many there are and no name is cut.
         */
        function checks(words: string[], mono: boolean): HTMLElement {
            const box = el('div', mono ? 'kamini-checks kamini-checks--mono' : 'kamini-checks')
            const longest = Math.max(8, ...words.map((each) => each.length))
            box.style.setProperty('--kamini-check', `calc(${longest}ch + 16px + 2 * var(--dya-space-2))`)
            return box
        }

        function check(text: string, on: boolean, apply: (on: boolean) => void, mono = false): HTMLElement {
            const holder = el('label', 'kamini-check')
            const box = el('input', 'dya-checkbox')
            box.type = 'checkbox'
            box.checked = on
            box.addEventListener('change', () => apply(box.checked))
            holder.append(box, el('span', mono ? 'dya-mono' : 'dya-label', text))
            return holder
        }

        function textField(value: string, apply: (next: string) => void, style: 'plain' | 'prose' | 'code' = 'code', multiline = false): HTMLInputElement | HTMLTextAreaElement {
            const className = style === 'plain' ? 'dya-field' : `dya-field dya-field--${style}`
            const node = multiline ? el('textarea', className) : el('input', className)
            if (style === 'prose' && node instanceof HTMLTextAreaElement) node.rows = 3
            node.value = value
            node.addEventListener('input', () => apply(node.value))
            return node
        }

        /*
         * A CLI's own fields in one form, those that share a dotted head gathered into a fold under
         * it, so Codex's two hundred keys read as its tables rather than one column.
         */
        function fieldsForm(fields: Field[], values: Record<string, Value>, filter: string): HTMLElement {
            const wanted = filter.trim().toLowerCase()
            const shown = fields.filter((field) => !wanted || field.key.toLowerCase().includes(wanted))
            const heads = new Map<string, Field[]>()
            for (const field of shown) {
                const dot = field.key.indexOf('.')
                const head = dot > 0 ? field.key.slice(0, dot) : ''
                heads.set(head, [...(heads.get(head) ?? []), field])
            }
            const holder = el('div', 'dya-stack')
            const add = (form: HTMLElement, field: Field, prefix: string): void => {
                form.append(
                    label(field.key.slice(prefix.length), true),
                    control(field, values[field.key], (next) => {
                        if (next === undefined || empty(next)) delete values[field.key]
                        else values[field.key] = next
                        changed()
                    })
                )
            }
            const top = el('div', 'dya-form')
            for (const [head, group] of heads) if (!head || group.length === 1) for (const field of group) add(top, field, '')
            if (top.childElementCount) holder.append(top)
            for (const [head, group] of heads) {
                if (!head || group.length === 1) continue
                const set = group.filter((field) => !empty(values[field.key])).length
                const fold = foldOf(head.replace(/^openai:/, 'openai.yaml '), set ? `${set} set` : '', Boolean(wanted))
                const form = el('div', 'dya-form')
                for (const field of group) add(form, field, `${head}.`)
                fold.body.append(form)
                holder.append(fold.node)
            }
            return holder
        }

        /*
         * What only some CLIs read, one fold per CLI switched on that reads any of it, so a field
         * is always seen beside the CLI it is for. A key two CLIs share is one value under both.
         */
        function perCli(values: Record<string, Value>, fieldsOf: (each: Target) => Field[], targets: Record<string, Placement>): HTMLElement[] {
            return TARGETS.flatMap((each) => {
                const fields = fieldsOf(each)
                if (!fields.length || !targets[each.id]?.on) return []
                const set = fields.filter((field) => !empty(values[field.key])).length
                const fold = foldOf(each.name, set ? `${set} set` : '', false)
                fold.body.append(fieldsForm(fields, values, ''))
                return [fold.node]
            })
        }

        function foldOf(title: string, meta: string, open: boolean, end?: HTMLElement): { node: HTMLDetailsElement; body: HTMLElement } {
            const node = el('details', 'dya-fold')
            node.open = open
            const head = el('summary', 'dya-fold__head kamini-fold-head')
            const mark = el('span', 'dya-fold__mark')
            mark.innerHTML = glyph('chevron')
            head.append(mark, el('span', 'dya-mono', title))
            if (meta) head.append(el('span', 'dya-meta', meta))
            if (end) head.append(end)
            const body = el('div', 'kamini-fold-body')
            node.append(head, body)
            return { node, body }
        }

        /*
         * One fold per CLI that can take this kind. Its head is where the definition goes: the
         * tick, the scope and the project, or a plugin's folder; its body is every field that CLI
         * alone reads, so a field is always seen beside the CLI it is for. A CLI with no place for
         * the kind is not listed, a scope it lacks is not offered, and one switched off or with
         * nothing of its own to set is a row, not a fold.
         */
        function clis(item: Definition, filter = ''): HTMLElement {
            const holder = el('div', 'dya-stack')
            const wanted = filter.trim()
            for (const each of TARGETS) {
                const spec = item.kind === 'agent' || item.kind === 'skill' || item.kind === 'plugin' ? null : each.files[item.kind]
                if (item.kind !== 'agent' && item.kind !== 'skill' && item.kind !== 'plugin' && !spec) continue
                if (item.kind === 'plugin' && !each.plugin) continue
                const place = item.targets[each.id]!
                const values = item.kind === 'agent' ? item.targets[each.id]!.fields : item.fields
                const all = place.on ? fieldsOf(item.kind, each) : []
                const fields = wanted ? all.filter((field) => field.key.toLowerCase().includes(wanted.toLowerCase())) : all
                if (wanted && !fields.length) continue
                const id = `cli:${each.id}`
                const node = el(fields.length ? 'details' : 'div', 'dya-fold')
                const head = el(fields.length ? 'summary' : 'div', fields.length ? 'dya-fold__head kamini-cli' : 'kamini-cli kamini-cli--flat')
                if (fields.length) {
                    const mark = el('span', 'dya-fold__mark')
                    mark.innerHTML = glyph('chevron')
                    head.append(mark)
                    ;(node as HTMLDetailsElement).open = Boolean(wanted) || unfolded.has(id)
                    node.addEventListener('toggle', () => {
                        if (wanted) return
                        if ((node as HTMLDetailsElement).open) unfolded.add(id)
                        else unfolded.delete(id)
                    })
                }
                const box = el('input', 'dya-checkbox')
                box.type = 'checkbox'
                box.checked = place.on
                box.setAttribute('aria-label', each.name)
                box.addEventListener('change', () => {
                    place.on = box.checked
                    changed()
                    paintEditor()
                })
                head.append(box, el('span', 'dya-mono kamini-cli__name', each.name))
                const scopes = spec ? (['user', 'project'] as const).filter((scope) => Boolean(spec[scope])) : (['user', 'project'] as const)
                if (spec && !scopes.includes(place.scope)) place.scope = scopes[0]!
                if (item.kind !== 'plugin' && scopes.length > 1) {
                    head.append(
                        choose('Scope', place.scope, [...scopes], '', (next) => {
                            place.scope = next === 'project' ? 'project' : 'user'
                            changed()
                            paintEditor()
                        }, { user: 'User', project: 'Project' })
                    )
                } else if (item.kind !== 'plugin') head.append(el('span', 'dya-label', place.scope === 'user' ? 'User' : 'Project'))
                if (item.kind !== 'plugin' && place.scope === 'project') {
                    const join = where('Project', place.project, (next) => {
                        place.project = next
                    })
                    join.classList.add('kamini-cli__where')
                    head.append(join)
                }
                const set = all.filter((field) => !empty(values[field.key])).length
                if (set) head.append(el('span', 'dya-meta', `${set} set`))
                node.append(head)
                if (fields.length) {
                    const body = el('div', 'kamini-fold-body')
                    body.append(fieldsForm(fields, values, ''))
                    node.append(body)
                }
                holder.append(node)
            }
            return holder
        }

        /*
         * The CLIs tab of every kind. An agent's CLIs carry hundreds of keys between them, so its
         * tab also has a filter, which opens every fold with a key that matches.
         */
        function where(words: string, value: string, apply: (next: string) => void): HTMLElement {
            const join = el('div', 'dya-join')
            const field = el('input', 'dya-field dya-field--code')
            field.value = value
            field.placeholder = words
            field.setAttribute('aria-label', words)
            field.addEventListener('input', () => {
                apply(field.value.trim())
                changed()
            })
            join.append(
                field,
                key('folder', 'Choose folder', async () => {
                    const chosen = (await ctx.invoke('folder')) as string | null
                    if (!chosen) return
                    apply(chosen)
                    field.value = chosen
                    changed()
                })
            )
            return join
        }

        /*
         * A plugin is written into one folder, a tree per CLI inside it, so the folder is asked
         * once, above the CLIs, and kept on each of them.
         */
        function clisTab(item: Definition, body: HTMLElement): void {
            if (item.kind === 'plugin') {
                const form = el('div', 'dya-form')
                const shared = TARGETS.map((each) => item.targets[each.id]?.project ?? '').find(Boolean) ?? ''
                form.append(
                    label('Folder'),
                    where('Folder', shared, (next) => {
                        for (const each of TARGETS) item.targets[each.id]!.project = next
                    })
                )
                body.append(form)
            }
            const folds = el('div')
            folds.append(clis(item))
            if (item.kind === 'agent' && TARGETS.some((each) => item.targets[each.id]!.on)) {
                const filter = el('input', 'dya-field')
                filter.placeholder = 'Filter'
                filter.setAttribute('aria-label', 'Filter')
                filter.addEventListener('input', () => folds.replaceChildren(clis(item, filter.value)))
                body.append(filter)
            }
            body.append(folds)
        }

        /*
         * The text a definition carries, under its fields and as tall as the room left: the prompt
         * of an agent, the body of everything else.
         */
        function text(form: HTMLElement, words: string, value: string, apply: (next: string) => void): HTMLElement {
            form.classList.add('kamini-form--text')
            const rows = form.querySelectorAll(':scope > .dya-label').length
            form.style.setProperty('--kamini-rows', `repeat(${rows}, auto) minmax(240px, 1fr)`)
            const head = label(words)
            head.classList.add('kamini-text__label')
            const editor = bodyEditor(value, words, apply)
            editor.classList.add('dya-editor--field', 'kamini-text__editor')
            form.append(head, editor)
            return form
        }

        function bodyEditor(value: string, words: string, apply: (next: string) => void): HTMLElement {
            const frame = el('div', 'dya-editor')
            const behind = el('pre', 'dya-code')
            const area = el('textarea')
            area.value = value
            area.spellcheck = false
            area.setAttribute('aria-label', words)
            const repaint = (): void => {
                behind.innerHTML = ctx.highlight(`${area.value}\n`, 'markdown')
                area.style.height = `${Math.max(behind.scrollHeight, frame.clientHeight)}px`
            }
            area.addEventListener('input', () => {
                apply(area.value)
                repaint()
            })
            frame.append(behind, area)
            queueMicrotask(repaint)
            new ResizeObserver(repaint).observe(frame)
            return frame
        }

        function nameField(item: Definition, title: HTMLElement): HTMLElement {
            const problem = el('span', 'dya-problem', 'a-z, 0-9 and -, 3 to 50')
            problem.hidden = NAME.test(item.name)
            const stack = el('div', 'dya-form__stack')
            stack.append(
                textField(item.name, (next) => {
                    item.name = next
                    title.textContent = next || item.id
                    problem.hidden = NAME.test(next.trim())
                    changed(true)
                }),
                problem
            )
            return stack
        }

        function descriptionField(item: { description: string }): HTMLElement {
            return textField(item.description, (next) => {
                item.description = next
                changed()
            }, 'prose', true)
        }

        function adder(act: () => void): HTMLElement {
            const holder = el('div')
            holder.append(key('add', 'Add', act))
            return holder
        }

        function hookFold(holder: { hooks: Hook[] }, hook: Hook, index: number): HTMLElement {
            const remove = key('delete', 'Delete', () => {
                holder.hooks.splice(index, 1)
                changed()
                paintEditor()
            })
            const who = names(TARGETS.filter((each) => each.hooks && carries(each, hook.event) && Boolean(each.catalogue.hookFields[hook.type]?.length)).map((each) => each.id))
            const fold = foldOf(hook.matcher ? `${hook.event} - ${hook.matcher}` : hook.event, who, opened === index, remove)
            const form = el('div', 'dya-form')
            form.append(
                label('Event'),
                choose('Event', hook.event, hookEvents().map((event) => event.name), '', (next) => {
                    hook.event = next
                    changed()
                    paintEditor(index)
                }),
                label('Matcher'),
                textField(hook.matcher, (next) => {
                    hook.matcher = next
                    changed()
                }),
                label('Type'),
                choose('Type', hook.type, hookTypes(), '', (next) => {
                    hook.type = next
                    changed()
                    paintEditor(index)
                })
            )
            for (const field of hookFields(hook.type)) {
                form.append(
                    label(field.key, true),
                    control(field, hook.fields[field.key], (next) => {
                        if (next === undefined || empty(next)) delete hook.fields[field.key]
                        else hook.fields[field.key] = next
                        changed()
                    })
                )
            }
            fold.body.append(form)
            return fold.node
        }

        function serverFold(holder: { servers: Server[]; targets: Record<string, Placement> }, server: Server, index: number): HTMLElement {
            const remove = key('delete', 'Delete', () => {
                holder.servers.splice(index, 1)
                changed()
                paintEditor()
            })
            const fold = foldOf(server.name, server.transport, opened === index, remove)
            const form = el('div', 'dya-form')
            const text = (words: string, value: string, apply: (next: string) => void, multiline = false): void => {
                form.append(label(words), textField(value, apply, 'code', multiline))
            }
            form.append(label('Name'))
            form.append(
                textField(server.name, (next) => {
                    server.name = next.trim()
                    changed()
                })
            )
            form.append(
                label('Transport'),
                choose('Transport', server.transport, [...TRANSPORTS], '', (next) => {
                    server.transport = next as Server['transport']
                    changed()
                    paintEditor(index)
                })
            )
            if (server.transport === 'stdio') {
                text('Command', server.command, (next) => {
                    server.command = next.trim()
                    changed()
                })
                text('Args', server.args.join('\n'), (next) => {
                    server.args = next.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
                    changed()
                }, true)
                text('Env', unpairs(server.env, '='), (next) => {
                    server.env = pairs(next, '=')
                    changed()
                }, true)
            } else {
                text('URL', server.url, (next) => {
                    server.url = next.trim()
                    changed()
                })
                text('Headers', unpairs(server.headers, ':'), (next) => {
                    server.headers = pairs(next, ':')
                    changed()
                }, true)
            }
            const readers = el('div')
            readers.append(...perCli(server.fields, (each) => serverFields(server.transport, [each]), holder.targets))
            fold.body.append(form, readers)
            return fold.node
        }

        function hooksTab(holder: { hooks: Hook[] }, body: HTMLElement): void {
            holder.hooks.forEach((hook, index) => body.append(hookFold(holder, hook, index)))
            body.append(
                adder(() => {
                    holder.hooks.push({ event: 'PreToolUse', matcher: '', type: 'command', fields: {} })
                    changed()
                    paintEditor(holder.hooks.length - 1)
                })
            )
        }

        function serversTab(holder: { servers: Server[]; targets: Record<string, Placement> }, body: HTMLElement): void {
            holder.servers.forEach((server, index) => body.append(serverFold(holder, server, index)))
            body.append(
                adder(() => {
                    holder.servers.push({ name: `server-${holder.servers.length + 1}`, transport: 'stdio', command: '', args: [], env: {}, url: '', headers: {}, fields: {} })
                    changed()
                    paintEditor(holder.servers.length - 1)
                })
            )
        }

        function picks(title: string, kind: Kind, chosen: string[], apply: (next: string[]) => void): HTMLElement[] {
            const rows = listing[kind]
            if (!rows.length) return []
            const set = new Set(chosen)
            const box = checks(rows.map((entry) => entry.name), true)
            for (const entry of rows) {
                box.append(
                    check(entry.name, set.has(entry.id), (on) => {
                        if (on) set.add(entry.id)
                        else set.delete(entry.id)
                        apply(rows.map((each) => each.id).filter((id) => set.has(id)))
                    }, true)
                )
            }
            return [label(title), box]
        }

        function agentTab(agent: Agent, body: HTMLElement, title: HTMLElement): void {
            if (tab === 'Agent') {
                const form = el('div', 'dya-form')
                const roles = el('div', 'dya-form__value')
                roles.append(
                    check('Main', agent.main, (on) => {
                        agent.main = on
                        changed()
                    }),
                    check('Subagent', agent.sub, (on) => {
                        agent.sub = on
                        changed()
                    })
                )
                form.append(
                    label('Name'),
                    nameField(agent, title),
                    label('Description'),
                    descriptionField(agent),
                    label('Role'),
                    roles,
                    label('Effort'),
                    choose('Effort', agent.effort, ['', ...EFFORTS], '', (next) => {
                        agent.effort = next
                        changed()
                    })
                )
                body.append(text(form, 'Prompt', agent.prompt, (next) => {
                    agent.prompt = next
                    changed()
                }))
            } else if (tab === 'Tools') {
                const chosen = new Set(agent.tools)
                const box = checks(CAPABILITIES.map(([, words]) => words), false)
                for (const [capability, words] of CAPABILITIES) {
                    box.append(
                        check(words, chosen.has(capability), (on) => {
                            if (on) chosen.add(capability)
                            else chosen.delete(capability)
                            agent.tools = CAPABILITIES.map(([id]) => id).filter((id) => chosen.has(id))
                            changed()
                        })
                    )
                }
                const form = el('div', 'dya-form')
                form.append(label('Allowed'), box)
                body.append(form)
            } else if (tab === 'Skills') {
                const form = el('div', 'dya-form')
                form.append(...picks('Preload', 'skill', agent.skills, (next) => {
                    agent.skills = next
                    changed()
                }))
                if (!form.childElementCount) form.append(label('Preload'), adder(() => void create('skill')))
                body.append(form)
            } else if (tab === 'Hooks') hooksTab(agent, body)
            else if (tab === 'MCP') serversTab(agent, body)
            else if (tab === 'CLIs') clisTab(agent, body)
            else body.append(output())
        }

        function skillTab(skill: Skill, body: HTMLElement, title: HTMLElement): void {
            if (tab === 'Skill') {
                const form = el('div', 'dya-form')
                form.append(label('Name'), nameField(skill, title), label('Description'), descriptionField(skill))
                body.append(text(form, 'Body', skill.body, (next) => {
                    skill.body = next
                    changed()
                }))
            } else if (tab === 'Files') {
                const files = el('ul', 'dya-files')
                for (const file of skill.files) {
                    const item = el('li', 'dya-reveals')
                    const node = el('div', 'dya-file')
                    node.innerHTML = glyph('file')
                    node.append(el('span', 'dya-file__name', file))
                    const remove = key('delete', 'Delete', async () => {
                        const fresh = (await ctx.invoke('removeFile', skill.id, file)) as Skill
                        skill.files = fresh.files
                        paintEditor()
                    })
                    remove.classList.add('dya-reveal')
                    node.append(remove)
                    item.append(node)
                    files.append(item)
                }
                if (skill.files.length) body.append(files)
                const keys = el('div', 'dya-toolbar')
                keys.append(
                    key('add', 'Add files', async () => {
                        if (draft) changed(true)
                        await flush()
                        const fresh = (await ctx.invoke('addFiles', skill.id)) as Skill
                        skill.files = fresh.files
                        paintEditor()
                    }),
                    key('folder', 'Show folder', async () => {
                        if (draft) changed(true)
                        await flush()
                        await ctx.shell.reveal((await ctx.invoke('skillFolder', skill.id)) as string)
                    })
                )
                body.append(keys)
            } else if (tab === 'CLIs') clisTab(skill, body)
            else body.append(output())
        }

        function noteTab(note: Note, body: HTMLElement, title: HTMLElement): void {
            if (tab === 'CLIs') clisTab(note, body)
            else if (tab === 'Output') body.append(output())
            else {
                const form = el('div', 'dya-form')
                form.append(label('Name'), nameField(note, title))
                if (note.kind !== 'memory') form.append(label('Description'), descriptionField(note))
                body.append(text(form, 'Body', note.body, (next) => {
                    note.body = next
                    changed()
                }))
            }
        }

        function pluginTab(plugin: Plugin, body: HTMLElement, title: HTMLElement): void {
            if (tab === 'Plugin') {
                const form = el('div', 'dya-form')
                form.append(
                    label('Name'),
                    nameField(plugin, title),
                    label('Description'),
                    descriptionField(plugin),
                    label('Version'),
                    textField(plugin.version, (next) => {
                        plugin.version = next.trim()
                        changed()
                    })
                )
                body.append(form)
            } else if (tab === 'Members') {
                const form = el('div', 'dya-form')
                for (const { kind, title: words } of KINDS) {
                    if (kind === 'memory' || kind === 'plugin') continue
                    const member = kind as keyof Plugin['members']
                    form.append(...picks(words, kind, plugin.members[member], (next) => {
                        plugin.members[member] = next
                        changed()
                    }))
                }
                body.append(form)
            } else if (tab === 'Hooks') hooksTab(plugin, body)
            else if (tab === 'MCP') serversTab(plugin, body)
            else if (tab === 'CLIs') clisTab(plugin, body)
            else body.append(output())
        }

        /*
         * What Export writes, file by file, exactly as it will be written, for every CLI switched
         * on: what that CLI's file cannot carry, what stops it being written, and after an export
         * what became of each path, with Replace on a file that is not Kamini's to overwrite.
         */
        function output(): HTMLElement {
            const holder = el('div', 'kamini-out')
            if (results.some((each) => each.state === 'conflict')) holder.append(report())
            const plans = el('div', 'kamini-out')
            holder.append(plans)
            if (!current) return holder
            const item = current
            void (async () => {
                if (draft) return
                await flush()
                const plan = (await ctx.invoke('plan', item.kind, item.id)) as Plan
                if (disposed || current !== item || tab !== 'Output') return
                for (const [targetId, compiled] of plan) {
                    if (!compiled.outputs.length && !compiled.problems.length && !compiled.dropped.length) continue
                    const section = el('div', 'kamini-out')
                    const head = el('div', 'dya-stack')
                    head.append(el('span', 'dya-eyebrow', TARGETS.find((each) => each.id === targetId)?.name ?? targetId))
                    if (compiled.dropped.length) {
                        const pills = el('div', 'dya-pills')
                        for (const word of compiled.dropped) pills.append(el('span', 'dya-badge dya-badge--warning', `No ${word}`))
                        head.append(pills)
                    }
                    for (const problem of compiled.problems) head.append(el('span', 'dya-problem', problem))
                    section.append(head)
                    for (const file of compiled.outputs) {
                        const readers = file.target.split(',')
                        section.append(fileLine(file.path, `${shorten(file.path)}${readers.length > 1 ? ` - ${names(readers)}` : ''}`))
                        if (file.source) continue
                        const code = el('pre', 'dya-code')
                        code.innerHTML = paint(file.path, file.content)
                        section.append(code)
                    }
                    plans.append(section)
                }
            })()
            return holder
        }

        function shorten(path: string): string {
            const plain = path.replace(/\\/g, '/')
            const own = home.replace(/\\/g, '/')
            return own && plain.toLowerCase().startsWith(own.toLowerCase()) ? `~${plain.slice(own.length)}` : plain
        }

        function paint(path: string, content: string): string {
            if (path.endsWith('.toml')) return ctx.highlight(content, 'ini')
            if (path.endsWith('.yaml')) return ctx.highlight(content, 'yaml')
            if (path.endsWith('.json')) return ctx.highlight(content, 'json')
            const match = /^---\n([\s\S]*?)---\n([\s\S]*)$/.exec(content)
            if (!match) return ctx.highlight(content, 'markdown')
            return `---\n${ctx.highlight(match[1]!, 'yaml')}---\n${ctx.highlight(match[2]!, 'markdown')}`
        }

        function report(): HTMLElement {
            const box = el('div')
            const conflicts = results.filter((each) => each.state === 'conflict').map((each) => each.path)
            if (conflicts.length > 1) box.append(button('Replace all', () => void exportCurrent(conflicts)))
            return box
        }

        /*
         * A file Export writes, by its path, and after an export what became of it: written, the
         * same as before, or not Kamini's to overwrite, with Replace beside it.
         */
        function fileLine(path: string, words: string): HTMLElement {
            const line = el('div', 'kamini-line')
            const result = results.find((each) => each.path === path)
            if (result) {
                const [className, state] =
                    result.state === 'conflict' ? ['dya-badge dya-badge--danger', 'Not ours'] : result.state === 'written' ? ['dya-badge dya-badge--success', 'Written'] : ['dya-tag', 'Same']
                line.append(el('span', className, state))
            }
            line.append(el('span', 'dya-meta', words))
            if (result?.state === 'conflict') line.append(button('Replace', () => void exportCurrent([path])))
            return line
        }

        function paintFound(entry: Found): void {
            const head = el('header', 'kamini-head')
            head.append(el('h2', 'dya-title', entry.name))
            const facts = el('div', 'dya-stack')
            const pills = el('div', 'dya-pills')
            pills.append(el('span', 'dya-tag', entry.kind), ...entry.targets.map((id) => el('span', 'dya-tag', names([id]))))
            if (entry.plugin) pills.append(el('span', 'dya-tag', [entry.plugin.name, entry.plugin.version].filter(Boolean).join(' ')))
            facts.append(pills, el('span', 'dya-meta dya-meta--wrap', shorten(entry.path)))
            head.append(facts)
            const body = el('div', 'kamini-body')
            const code = el('pre', 'dya-code')
            body.append(code)
            editor.replaceChildren(head, body)
            void (ctx.invoke('read', entry.path) as Promise<string>).then((text) => {
                if (viewing === entry) code.innerHTML = paint(entry.path, text)
            })
        }

        function paintEditor(open = -1): void {
            opened = open
            paintBar()
            if (viewing) {
                paintFound(viewing)
                return
            }
            if (!current) {
                editor.replaceChildren()
                return
            }
            const head = el('header', 'kamini-head')
            const title = el('h2', 'dya-title', current.name || current.id)
            const tabs = el('div', 'dya-tabs')
            tabs.setAttribute('role', 'tablist')
            for (const name of TABS[current.kind]) {
                const node = el('button', 'dya-tab', name)
                node.type = 'button'
                node.setAttribute('role', 'tab')
                node.setAttribute('aria-selected', String(name === tab))
                node.addEventListener('click', () => {
                    tab = name
                    paintEditor()
                })
                tabs.append(node)
            }
            head.append(title, tabs)
            const body = el('div', 'kamini-body')
            if (current.kind === 'agent') agentTab(current, body, title)
            else if (current.kind === 'skill') skillTab(current, body, title)
            else if (current.kind === 'plugin') pluginTab(current, body, title)
            else noteTab(current, body, title)
            editor.replaceChildren(head, body)
            settle()
        }

        void (async () => {
            home = (await ctx.invoke('home')) as string
            project = String(((await ctx.invoke('state')) as { project?: string }).project ?? '')
            await refreshList()
            paintEditor()
        })()

        return () => {
            void flush()
            disposed = true
            container.replaceChildren()
        }
    })
}
