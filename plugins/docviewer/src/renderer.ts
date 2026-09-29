import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { glyph, highlight, highlightLines, injectStyles, when } from '@dyarchia/sdk'
import type { GlyphName, OpenRequest, PluginContext } from '@dyarchia/sdk'

interface OpenResult {
    canceled?: boolean
    error?: string
    name?: string
    path?: string
    markdown?: boolean
    mtime?: number
    content?: string
}

interface DeleteResult {
    error?: string
}

interface Page {
    name: string
    path: string
    size: number
    mtime: number
}

interface RenameResult {
    error?: string
    path?: string
    name?: string
}

interface WriteResult {
    error?: string
    stale?: boolean
    mtime?: number
}

const STYLES = `
.docviewer {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
}
.docviewer-library-head {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.docviewer-library-head .dya-field {
    flex: 1;
    min-width: 0;
}
.docviewer-library-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
.docviewer-library-list .dya-table {
    width: 100%;
}
.docviewer-library-list .dya-row {
    cursor: pointer;
}
.docviewer-library-list .dya-table td:first-child {
    padding-inline-start: calc(var(--dya-space-3) + var(--dya-border-width));
}
.docviewer-library-list .dya-table td:last-child {
    padding-inline-end: 0;
}
.docviewer-row-keys {
    display: inline-flex;
    gap: var(--dya-space-2);
}
.docviewer-header {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.docviewer-modes {
    display: flex;
    gap: var(--dya-space-1);
}
.docviewer-modes[hidden] {
    display: none;
}
.docviewer-mode svg {
    display: block;
    width: 13px;
    height: 13px;
}
.docviewer-content {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    padding: var(--dya-space-5) var(--dya-space-6);
}
.docviewer-content--empty {
    padding: var(--dya-space-4);
}
.docviewer-editor {
    height: 100%;
}
.docviewer-save[hidden],
.docviewer-dirty[hidden] {
    display: none;
}
`

/*
 * The panel's mark, one of a set in black and white and nothing else, each a thing of Sparta:
 * a stele, the Great Rhetra, the written law of Lycurgus.
 * Solid shapes rather than hairlines, so it reads as a key at 18px.
 */
const DOCS_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 1.6 20.4 6.6H3.6z" fill="#eceef2"/><circle cx="3.6" cy="6" r="1.1" fill="#eceef2"/><circle cx="20.4" cy="6" r="1.1" fill="#eceef2"/><rect x="4.6" y="7.8" width="14.8" height="12.6" fill="#eceef2"/><rect x="3" y="20.4" width="18" height="2.2" rx=".4" fill="#eceef2"/><text x="12" y="11.9" text-anchor="middle" font-family="Spectral, Georgia, serif" font-weight="500" font-size="3.6" fill="#0a0a0b">RETRA</text><path d="M7 14.4h10M7 16.6h10M7 18.8h6.4" stroke="#0a0a0b" stroke-width=".9" stroke-linecap="round"/></svg>'

const EYE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
const PENCIL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'

const CODE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'

/*
 * The pencil used to mean "show me the markdown", which is not what a pencil means anywhere
 * else, and the first thing anybody did with it was try to type. It edits now, and reading the
 * source got the glyph that means source. `rendered` belongs to markdown alone; everything else
 * this panel opens is already its own source.
 */
const MODES = [
    { id: 'rendered', label: 'Read', icon: EYE_ICON, markdownOnly: true },
    { id: 'source', label: 'Source', icon: CODE_ICON, markdownOnly: false },
    { id: 'edit', label: 'Edit', icon: PENCIL_ICON, markdownOnly: false }
] as const

type Mode = (typeof MODES)[number]['id']

/*
 * The grammar to colour a file with is its extension, which is the only thing the reader knows
 * about a file it was handed. A fenced block in markdown says its own language instead.
 */
function languageOf(name: string): string {
    const dot = name.lastIndexOf('.')
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/*
 * The kinds of file this panel answers for. It renders markdown and shows everything else as
 * source, which is worth having for any of these; a format it would only mangle is not listed.
 */
const OPENS = [
    '.md', '.txt', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.js', '.mjs', '.jsx', '.ts',
    '.tsx', '.css', '.html', '.xml', '.csv', '.log', '.ps1', '.sh', '.sql', '.py', '.cls',
    '.trigger', '.apex'
]

function samePath(a: string, b: string): boolean {
    return a.replaceAll('\\', '/').toLowerCase() === b.replaceAll('\\', '/').toLowerCase()
}

interface Reader {
    held(): string | null
    busy(): boolean
    accept(request: OpenRequest): Promise<void>
}

export function activate(ctx: PluginContext): void {
    const readers = new Map<string, Reader>()
    const waiting = new Map<string, OpenRequest>()
    const fresh = new Set<string>()

    function route(request: OpenRequest): string | null {
        let idle: string | null = null
        for (const [id, reader] of readers) {
            const held = reader.held()
            if (held && samePath(held, request.path)) return id
            if (!held && !reader.busy() && idle === null) idle = id
        }
        return idle
    }

    ctx.registerOpener({ panelId: 'docviewer', extensions: OPENS, route }, async (request) => {
        const key = request.instanceId ?? ''
        const reader = readers.get(key) ?? (request.instanceId ? undefined : [...readers.values()].at(-1))
        if (reader) {
            await reader.accept(request)
            return
        }
        waiting.set(key, request)
    })

    ctx.registerCommand({
        id: 'new-page',
        title: 'New page',
        run: async () => {
            const result = (await ctx.invoke('create')) as OpenResult
            if (!result.path) return
            fresh.add(result.path)
            await ctx.shell.open({ path: result.path })
        }
    })

    ctx.registerCommand({
        id: 'open',
        title: 'Open file',
        run: async () => {
            const result = (await ctx.invoke('open')) as OpenResult
            if (result.path) await ctx.shell.open({ path: result.path })
        }
    })

    ctx.registerPanel(
        {
            id: 'docviewer',
            title: 'Docs',
            icon: DOCS_ICON,
            duplicable: true
        },
        (container, handle) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = document.createElement('div')
            root.className = 'docviewer'

            /*
             * The file's name is the tab's title, and what can be done to it sits in the tab row:
             * the views, save, and the pages. With nothing open the tile in the middle of the
             * panel is the way in, and the row is empty.
             */
            const header = document.createElement('div')
            header.className = 'docviewer-header'
            const modes = document.createElement('div')
            modes.className = 'docviewer-modes'
            modes.hidden = true

            const unsaved = document.createElement('span')
            unsaved.className = 'dya-badge dya-badge--warning docviewer-dirty'
            unsaved.textContent = 'Unsaved'
            unsaved.hidden = true

            /*
             * A save that fails says so beside the control that failed, and leaves the document
             * where it is. Putting it in the body would replace what somebody has been typing
             * with the reason they cannot keep it, which is the worst moment to lose it.
             */
            const problem = document.createElement('span')
            problem.className = 'dya-text--danger docviewer-dirty'
            problem.hidden = true

            const save = document.createElement('button')
            save.type = 'button'
            save.hidden = true

            header.append(unsaved, problem, modes, save)

            const content = document.createElement('div')
            handle.toolbar.append(header)
            root.append(content)
            container.appendChild(root)

            let busy = false
            let diagram = 0
            let current: OpenResult | null = null
            let mode: Mode = 'rendered'
            let target: number | null = null
            let dirty = false
            let overwrite = false
            let saved = ''

            function say(message?: string): void {
                problem.textContent = message ?? ''
                problem.hidden = !message
            }

            /*
             * A file that changed underneath is not saved over. The refusal turns the control
             * into `Overwrite`, so losing somebody else's work takes a second deliberate click
             * and never happens because a button was where a button used to be.
             */
            async function saveNow(): Promise<void> {
                if (!current?.path || !dirty || busy) return
                busy = true
                say()
                try {
                    const result = (await ctx.invoke('write', {
                        path: current.path,
                        content: current.content ?? '',
                        mtime: current.mtime,
                        force: overwrite
                    })) as WriteResult
                    if (result.stale) {
                        overwrite = true
                        syncModes()
                        return
                    }
                    if (result.error) {
                        say(result.error)
                        return
                    }
                    current.mtime = result.mtime
                    saved = current.content ?? ''
                    markDirty(false)
                } catch {
                    say('Cannot save')
                } finally {
                    busy = false
                }
            }

            save.onclick = () => void saveNow()

            const modeButtons = MODES.map((entry) => {
                const button = document.createElement('button')
                button.title = entry.label
                button.setAttribute('aria-label', entry.label)
                button.innerHTML = `<span class="docviewer-mode">${entry.icon}</span>`
                button.onclick = () => setMode(entry.id)
                return button
            })
            modes.append(...modeButtons)

            function syncModes(): void {
                modeButtons.forEach((button, index) => {
                    const entry = MODES[index]
                    const active = entry.id === mode
                    button.hidden = entry.markdownOnly && !current?.markdown
                    button.className = active ? 'dya-key dya-key--active' : 'dya-key'
                    button.setAttribute('aria-pressed', String(active))
                })
                save.hidden = mode !== 'edit'
                save.disabled = !dirty
                paintSave()
                unsaved.hidden = !dirty || overwrite
            }

            let saveShows: boolean | null = null

            function paintSave(): void {
                if (saveShows === overwrite) return
                saveShows = overwrite
                if (overwrite) {
                    save.className = 'dya-button dya-button--resolve docviewer-save'
                    save.removeAttribute('title')
                    save.setAttribute('aria-label', 'Overwrite')
                    const state = document.createElement('span')
                    state.className = 'dya-button__state'
                    state.textContent = 'Changed on disk'
                    const answer = document.createElement('span')
                    answer.className = 'dya-button__answer'
                    answer.textContent = 'Overwrite'
                    save.replaceChildren(state, answer)
                    return
                }
                save.className = 'dya-key docviewer-save'
                save.innerHTML = glyph('save')
                save.title = 'Save'
                save.setAttribute('aria-label', 'Save')
            }

            function setMode(next: Mode): void {
                if (mode === next) return
                mode = next
                syncModes()
                void renderCurrent()
            }

            function markDirty(next: boolean): void {
                if (dirty === next) return
                dirty = next
                if (!next) overwrite = false
                syncModes()
            }

            /*
             * A panel with no page open shows the pages, as a gallery from the top left: a new
             * page and a file from elsewhere first, then every page, newest first, each opened by
             * a click. One tile in the middle of the pane was an island that told the reader
             * nothing about what was already written.
             */
            let gallery: HTMLElement | null = null
            let galleryNote: string | undefined

            function tile(className: string, icon: string, name: string, act: () => void): HTMLButtonElement {
                const card = document.createElement('button')
                card.type = 'button'
                card.className = className
                card.innerHTML = `<span class="dya-tile__icon">${icon}</span>`
                const label = document.createElement('span')
                label.className = 'dya-tile__name'
                label.textContent = name
                card.append(label)
                card.onclick = act
                return card
            }

            function paintGallery(): void {
                if (!gallery) return
                const cards: HTMLElement[] = []
                if (galleryNote) {
                    const line = document.createElement('span')
                    line.className = 'dya-empty dya-text--danger'
                    line.textContent = galleryNote
                    cards.push(line)
                }
                cards.push(
                    tile('dya-tile dya-tile--new', glyph('add'), 'New page', () => openLibrary()),
                    tile('dya-tile', glyph('folder'), 'Browse', () => void browse())
                )
                for (const page of pages) {
                    const card = document.createElement('button')
                    card.type = 'button'
                    card.className = 'dya-tile dya-tile--dense'
                    const head = document.createElement('div')
                    head.className = 'dya-tile__head'
                    const name = document.createElement('span')
                    name.className = 'dya-tile__name'
                    name.textContent = page.name
                    head.append(name)
                    const facts = document.createElement('span')
                    facts.className = 'dya-meta'
                    facts.textContent = page.size > 0 ? `${when(page.mtime)} - ${size(page.size)}` : when(page.mtime)
                    card.append(head, facts)
                    card.onclick = () => void openPage(page.path)
                    cards.push(card)
                }
                gallery.replaceChildren(...cards)
            }

            function showEmpty(message?: string): void {
                current = null
                handle.setTitle(null)
                modes.hidden = true
                header.hidden = true
                saved = ''
                overwrite = false
                dirty = false
                say()
                syncModes()
                content.className = 'dya-text docviewer-content docviewer-content--empty'
                gallery = document.createElement('div')
                gallery.className = 'dya-grid'
                galleryNote = message
                content.replaceChildren(gallery)
                paintGallery()
                void refresh()
            }

            function barKey(icon: GlyphName, label: string, act: () => void): HTMLButtonElement {
                const button = document.createElement('button')
                button.type = 'button'
                button.className = 'dya-key'
                button.innerHTML = glyph(icon)
                button.title = label
                button.setAttribute('aria-label', label)
                button.onclick = (event) => {
                    event.stopPropagation()
                    act()
                }
                return button
            }

            /*
             * The pages: every file in the data home's docs folder, in a sheet over the panel.
             * It is the whole of what can be done to a page. The one field finds a page as it is
             * typed and makes one of that name on Enter when none matches, a row opens on a click,
             * and each row carries its rename and its delete. Browse is the way to a file kept
             * anywhere else. The sheet covers, so it is modal: a scrim, the rest inert, Escape out.
             */
            const scrim = document.createElement('div')
            scrim.className = 'dya-scrim'
            scrim.hidden = true

            const library = document.createElement('aside')
            library.className = 'dya-sheet dya-sheet--modal dya-pane docviewer-library'
            library.setAttribute('role', 'dialog')
            library.setAttribute('aria-modal', 'true')
            library.setAttribute('aria-label', 'Pages')
            library.hidden = true

            const find = document.createElement('input')
            find.className = 'dya-field'
            find.placeholder = 'Find or name a page'
            find.setAttribute('aria-label', 'Find or name a page')
            find.spellcheck = false

            const libraryHead = document.createElement('div')
            libraryHead.className = 'docviewer-library-head'
            libraryHead.append(
                find,
                barKey('new-file', 'New', () => void makePage()),
                barKey('folder', 'Browse', () => void browse()),
                barKey('close', 'Close', closeLibrary)
            )

            const complaint = document.createElement('span')
            complaint.className = 'dya-problem'
            complaint.hidden = true

            const list = document.createElement('div')
            list.className = 'docviewer-library-list'

            library.append(libraryHead, complaint, list)

            let pages: Page[] = []
            let opener: HTMLElement | null = null

            function complain(message?: string): void {
                complaint.textContent = message ?? ''
                complaint.hidden = !message
            }

            function size(bytes: number): string {
                if (bytes < 1024) return `${bytes} B`
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
                return `${(bytes / 1024 / 1024).toFixed(1)} MB`
            }

            function cell(className: string, text: string): HTMLTableCellElement {
                const td = document.createElement('td')
                td.className = className
                td.textContent = text
                return td
            }

            function draw(): void {
                const wanted = find.value.trim().toLowerCase()
                const shown = pages.filter((page) => page.name.toLowerCase().includes(wanted))
                if (shown.length === 0) {
                    if (pages.length === 0 && !wanted) {
                        list.replaceChildren()
                        return
                    }
                    const none = document.createElement('div')
                    none.className = 'dya-empty'
                    const word = document.createElement('span')
                    word.textContent = 'No match'
                    none.append(word)
                    list.replaceChildren(none)
                    return
                }
                const table = document.createElement('table')
                table.className = 'dya-table'
                const body = document.createElement('tbody')
                for (const page of shown) {
                    const row = document.createElement('tr')
                    row.className = 'dya-row'
                    const title = cell('dya-table__subject', page.name)
                    const end = document.createElement('td')
                    end.className = 'dya-table__end'
                    const keys = document.createElement('span')
                    keys.className = 'docviewer-row-keys'
                    keys.append(
                        barKey('rename', 'Rename', () => renameRow(page, title)),
                        barKey('delete', 'Delete', () => void deletePage(page))
                    )
                    end.append(keys)
                    row.append(
                        title,
                        cell('dya-table__fit', when(page.mtime)),
                        cell('dya-table__num dya-table__fit', page.size > 0 ? size(page.size) : ''),
                        end
                    )
                    row.onclick = () => void openPage(page.path)
                    body.append(row)
                }
                table.append(body)
                list.replaceChildren(table)
            }

            async function refresh(): Promise<void> {
                try {
                    pages = (await ctx.invoke('list')) as Page[]
                } catch {
                    pages = []
                    complain('Cannot list pages')
                }
                draw()
                if (!current) paintGallery()
            }

            function openLibrary(): void {
                if (!library.hidden) return
                opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
                header.inert = true
                content.inert = true
                scrim.hidden = false
                library.hidden = false
                find.value = ''
                complain()
                void refresh()
                find.focus()
            }

            function closeLibrary(): void {
                if (library.hidden) return
                library.hidden = true
                scrim.hidden = true
                header.inert = false
                content.inert = false
                opener?.focus()
                opener = null
            }

            /*
             * Leaving a page with unsaved changes is the one thing here that loses work without
             * a trace, so it alone asks.
             */
            function leave(): boolean {
                return !dirty || window.confirm(`Discard changes to ${current?.name}?`)
            }

            async function shift(load: () => Promise<OpenResult>, start?: Mode): Promise<void> {
                if (busy || !leave()) return
                busy = true
                complain()
                try {
                    const result = await load()
                    if (result.canceled) return
                    if (result.error) {
                        complain(result.error)
                        return
                    }
                    closeLibrary()
                    await present(result, undefined, start)
                } catch {
                    complain('Cannot open')
                } finally {
                    busy = false
                }
            }

            function openPage(path: string): Promise<void> {
                return shift(() => ctx.invoke('read', path) as Promise<OpenResult>)
            }

            function browse(): Promise<void> {
                return shift(() => ctx.invoke('open') as Promise<OpenResult>)
            }

            async function makePage(): Promise<void> {
                const wanted = find.value.trim()
                if (!wanted) {
                    find.focus()
                    return
                }
                await shift(() => ctx.invoke('create', wanted) as Promise<OpenResult>, 'edit')
            }

            find.oninput = () => {
                complain()
                draw()
            }

            find.onkeydown = (event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                const wanted = find.value.trim()
                const match = pages.find((page) => page.name === wanted || page.name === `${wanted}.md`)
                void (match ? openPage(match.path) : makePage())
            }

            /*
             * A rename is the name cell turned into a field. Enter or clicking away keeps the new
             * name, Escape keeps the old one.
             */
            function renameRow(page: Page, title: HTMLTableCellElement): void {
                const field = document.createElement('input')
                field.className = 'dya-field dya-field--sm'
                field.value = page.name
                field.spellcheck = false
                field.setAttribute('aria-label', `Rename ${page.name}`)
                field.onclick = (event) => event.stopPropagation()
                let settled = false

                const commit = async (): Promise<void> => {
                    if (settled) return
                    settled = true
                    const next = field.value.trim()
                    if (!next || next === page.name) {
                        draw()
                        return
                    }
                    const result = (await ctx.invoke('rename', {
                        path: page.path,
                        name: next
                    })) as RenameResult
                    if (result.error) {
                        complain(result.error)
                        draw()
                        return
                    }
                    if (current?.path === page.path && result.path && result.name) {
                        current.path = result.path
                        current.name = result.name
                        current.markdown = result.name.toLowerCase().endsWith('.md')
                        handle.setTitle(result.name)
                        if (!current.markdown && mode === 'rendered') mode = 'source'
                        syncModes()
                        void renderCurrent()
                    }
                    complain()
                    await refresh()
                }

                field.onkeydown = (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault()
                        void commit()
                    } else if (event.key === 'Escape') {
                        event.preventDefault()
                        event.stopPropagation()
                        settled = true
                        draw()
                    }
                }
                field.onblur = () => void commit()

                title.replaceChildren(field)
                field.focus()
                const dot = page.name.lastIndexOf('.')
                field.setSelectionRange(0, dot > 0 ? dot : page.name.length)
            }

            async function deletePage(page: Page): Promise<void> {
                if (!window.confirm(`Delete ${page.name}?`)) return
                complain()
                try {
                    const result = (await ctx.invoke('delete', page.path)) as DeleteResult
                    if (result.error) {
                        complain(result.error)
                        return
                    }
                    if (current?.path === page.path) showEmpty()
                } catch {
                    complain('Cannot delete')
                }
                await refresh()
            }

            scrim.onclick = closeLibrary
            root.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape' || library.hidden || event.defaultPrevented) return
                event.preventDefault()
                closeLibrary()
            })

            /*
             * Every fenced block in a rendered document, coloured by the language it declares.
             * The classes come from kanon, which has carried six measured syntax hues and the
             * six classes that use them all along; nothing here invents a colour.
             */
            function colourBlocks(host: HTMLElement): void {
                for (const code of host.querySelectorAll('pre > code')) {
                    const declared = [...code.classList]
                        .find((name) => name.startsWith('language-'))
                        ?.slice('language-'.length)
                    if (declared === 'mermaid') continue
                    code.parentElement?.classList.add('dya-code')
                    code.innerHTML = highlight(code.textContent ?? '', declared ?? '')
                }
            }

            function sourceLines(): HTMLPreElement {
                const pre = document.createElement('pre')
                pre.className = 'dya-code'
                /*
                 * One element per line, so a line can be pointed at. A plugin that found a
                 * passage knows which line it was on, and scrolling the reader to the top of
                 * a nine-hundred-line page is not showing it to anybody.
                 */
                const language = languageOf(current?.name ?? '')
                const lines = highlightLines(current?.content ?? '', language)
                for (const [index, line] of lines.entries()) {
                    const row = document.createElement('span')
                    row.className = 'dya-code__line'
                    row.dataset.line = String(index + 1)
                    if (index + 1 === target) row.classList.add('dya-code__line--at')
                    row.innerHTML = line
                    pre.append(row)
                }
                return pre
            }

            function editor(): HTMLElement {
                const language = languageOf(current?.name ?? '')
                const frame = document.createElement('div')
                frame.className = 'dya-editor docviewer-editor'
                const behind = document.createElement('pre')
                behind.className = 'dya-code'
                const field = document.createElement('textarea')
                field.value = current?.content ?? ''
                field.setAttribute('aria-label', `Editing ${current?.name ?? 'document'}`)

                const repaint = (): void => {
                    /*
                     * A trailing newline collapses in a pre and the backdrop comes up one line
                     * short, which slides every glyph out of register from that point on.
                     */
                    behind.innerHTML = highlight(`${field.value}\n`, language)
                    field.style.height = `${Math.max(behind.scrollHeight, frame.clientHeight)}px`
                }

                field.oninput = () => {
                    current = { ...current, content: field.value }
                    repaint()
                    markDirty(field.value !== saved)
                }
                field.onkeydown = (event) => {
                    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
                    event.preventDefault()
                    void saveNow()
                }

                frame.append(behind, field)
                /*
                 * The height of the backdrop is not known until the frame is in the document, so
                 * the first paint happens once it is, and again whenever the panel is resized.
                 */
                queueMicrotask(() => {
                    repaint()
                    field.focus()
                })
                new ResizeObserver(repaint).observe(frame)
                return frame
            }

            function prose(source: string): HTMLElement {
                const article = document.createElement('article')
                article.className = 'dya-prose'
                const tokens = marked.lexer(source)
                let line = 1
                for (const token of tokens) {
                    const html = marked.parser(Object.assign([token], { links: tokens.links }))
                    const part = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true })
                    const first = part.firstElementChild
                    if (first instanceof HTMLElement) first.dataset.sourceLine = String(line)
                    article.append(part)
                    line += token.raw.split('\n').length - 1
                }
                for (const table of article.querySelectorAll('table')) {
                    table.className = 'dya-table'
                }
                for (const row of article.querySelectorAll('tbody tr')) {
                    row.className = 'dya-row'
                    row.firstElementChild?.classList.add('dya-table__subject')
                }
                colourBlocks(article)
                return article
            }

            function reveal(): void {
                if (target === null) return
                if (mode === 'source') {
                    content.querySelector('.dya-code__line--at')?.scrollIntoView({ block: 'center' })
                    return
                }
                let nearest: HTMLElement | null = null
                for (const block of content.querySelectorAll<HTMLElement>('.dya-prose > [data-source-line]')) {
                    if (Number(block.dataset.sourceLine) > target) break
                    nearest = block
                }
                nearest?.scrollIntoView({ block: 'start' })
            }

            async function renderCurrent(): Promise<void> {
                if (!current) return
                content.className = 'dya-text docviewer-content'
                if (mode === 'edit') {
                    content.replaceChildren(editor())
                    return
                }
                if (current.markdown && mode === 'rendered') {
                    const article = prose(current.content ?? '')
                    content.replaceChildren(article)
                    await renderDiagrams(article)
                } else {
                    content.replaceChildren(sourceLines())
                }
                content.scrollTop = 0
                reveal()
            }

            async function present(result: OpenResult, line?: number, start?: Mode): Promise<void> {
                current = result
                target = line ?? null
                mode = start ?? (result.markdown ? 'rendered' : 'source')
                handle.setTitle(result.name ?? null)
                header.hidden = false
                modes.hidden = false
                saved = result.content ?? ''
                dirty = false
                overwrite = false
                say()
                syncModes()
                await renderCurrent()
            }

            async function renderDiagrams(host: HTMLElement): Promise<void> {
                const blocks = [...host.querySelectorAll('pre > code.language-mermaid')]
                if (blocks.length === 0) return
                const { default: mermaid } = await import('mermaid')
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: 'strict',
                    theme: 'base',
                    fontFamily: ctx.token('font-mono'),
                    themeVariables: {
                        background: ctx.token('panel'),
                        mainBkg: ctx.token('panel'),
                        primaryColor: ctx.token('panel'),
                        primaryTextColor: ctx.token('text'),
                        primaryBorderColor: ctx.token('border-strong'),
                        secondaryColor: ctx.token('field'),
                        tertiaryColor: ctx.token('field'),
                        nodeBorder: ctx.token('border-strong'),
                        clusterBkg: ctx.token('field'),
                        clusterBorder: ctx.token('border'),
                        edgeLabelBackground: ctx.token('panel'),
                        lineColor: ctx.token('text-muted'),
                        textColor: ctx.token('text'),
                        titleColor: ctx.token('text'),
                        fontSize: '11px'
                    }
                })
                for (const block of blocks) {
                    const pre = block.parentElement
                    if (!pre) continue
                    try {
                        const { svg } = await mermaid.render(
                            `dya-mermaid-${diagram++}`,
                            block.textContent ?? ''
                        )
                        const figure = document.createElement('div')
                        figure.className = 'dya-prose__figure'
                        if (pre.dataset.sourceLine) figure.dataset.sourceLine = pre.dataset.sourceLine
                        figure.innerHTML = svg
                        pre.replaceWith(figure)
                    } catch {
                        continue
                    }
                }
            }

            header.append(barKey('file', 'Pages', openLibrary))
            root.append(scrim, library)
            showEmpty()

            async function accept(request: OpenRequest): Promise<void> {
                const again = current?.path !== undefined && samePath(current.path, request.path)
                const start = fresh.delete(request.path) ? 'edit' : again && mode === 'edit' ? 'edit' : undefined
                if (again && (dirty || mode === 'edit')) {
                    target = request.line ?? null
                    if (mode !== 'edit') reveal()
                    return
                }
                if (busy || (!again && !leave())) return
                closeLibrary()
                busy = true
                try {
                    const result = (await ctx.invoke('read', request.path)) as OpenResult
                    if (result.error) {
                        showEmpty(result.error)
                        return
                    }
                    await present(result, request.line, start ?? (again ? mode : undefined))
                } catch {
                    showEmpty('Cannot open')
                } finally {
                    busy = false
                }
            }

            const reader: Reader = {
                held: () => current?.path ?? null,
                busy: () => busy,
                accept
            }
            readers.set(handle.instanceId, reader)
            const key = waiting.has(handle.instanceId) ? handle.instanceId : ''
            const pending = waiting.get(key)
            waiting.delete(key)
            if (pending) void accept(pending)

            return () => {
                if (readers.get(handle.instanceId) === reader) readers.delete(handle.instanceId)
                container.replaceChildren()
            }
        }
    )
}
