import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { glyph, highlight, highlightLines, injectStyles } from '@dyarchia/sdk'
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
    gap: var(--dya-space-3);
    padding: var(--dya-space-2) var(--dya-space-3);
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
.docviewer-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.docviewer-content {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    padding: var(--dya-space-5) var(--dya-space-6);
}
.docviewer-invite {
    max-width: 420px;
    margin: auto;
    padding: 0;
}
.docviewer-tile {
    width: 100%;
}
.docviewer-tile .dya-tile__icon {
    width: 22px;
    height: 22px;
}
.docviewer-content--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}
.docviewer-editor {
    height: 100%;
}
.docviewer-save[hidden],
.docviewer-dirty[hidden] {
    display: none;
}
`

const DOCS_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'

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
    { id: 'rendered', label: 'Rendered', icon: EYE_ICON, markdownOnly: true },
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


export function activate(ctx: PluginContext): void {
    /*
     * The opener is declared now, not when a panel mounts, because a plugin that has never been
     * opened still answers for what it can render — otherwise the offer to open a file appears
     * only after the reader has already been opened by hand, which is backwards.
     *
     * The shell shows the panel and then hands the request over, and mounting is not synchronous,
     * so a request that arrives before there is anything to show it in waits here and the panel
     * collects it as it mounts.
     */
    let deliver: ((request: OpenRequest) => Promise<void>) | null = null
    let waiting: OpenRequest | null = null

    ctx.registerOpener({ panelId: 'docviewer', extensions: OPENS }, async (request) => {
        if (deliver) {
            await deliver(request)
            return
        }
        waiting = request
    })

    ctx.registerPanel(
        {
            id: 'docviewer',
            title: 'Docs',
            icon: DOCS_ICON,
            duplicable: true
        },
        (container) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = document.createElement('div')
            root.className = 'docviewer'

            /*
             * The bar names what is open, so it is there once something is. With nothing open the
             * tile in the middle of the panel is the way in, and a bar repeating it is noise.
             */
            const header = document.createElement('div')
            header.className = 'docviewer-header'
            const name = document.createElement('span')
            name.className = 'dya-mono docviewer-name'
            const modes = document.createElement('div')
            modes.className = 'docviewer-modes'
            modes.hidden = true

            const unsaved = document.createElement('span')
            unsaved.className = 'dya-badge dya-badge--warning docviewer-dirty'
            unsaved.textContent = 'unsaved'
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
            save.className = 'dya-key docviewer-save'
            save.innerHTML = glyph('save')
            save.title = 'Save'
            save.setAttribute('aria-label', 'Save')
            save.hidden = true

            header.append(name, unsaved, problem, modes, save)

            const content = document.createElement('div')
            root.append(header, content)
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
                        say('changed on disk')
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
                    say('Cannot save that file')
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
                save.textContent = overwrite ? 'Overwrite' : 'Save'
                unsaved.hidden = !dirty
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
             * A panel with nothing in it offers what to put in it.
             *
             * It used to be blank, on the reasoning that an offer in the middle of a panel is an
             * advertisement for a panel the reader has already opened. That reasoning holds for a
             * sentence and loses to what it produces: at a window's width it is a black rectangle
             * nine hundred pixels tall with one word in a corner, which reads as a thing that does
             * not work. The offer is a tile — the same pressable card the launcher is built from —
             * so the panel says what it is for by giving the reader the way in.
             */
            function showEmpty(message?: string): void {
                current = null
                name.textContent = ''
                modes.hidden = true
                header.hidden = true
                saved = ''
                overwrite = false
                dirty = false
                say()
                syncModes()
                content.className = 'dya-text docviewer-content docviewer-content--empty'

                const invite = document.createElement('div')
                invite.className = 'dya-empty docviewer-invite'

                const tile = document.createElement('button')
                tile.className = 'dya-tile docviewer-tile'
                tile.type = 'button'
                tile.innerHTML =
                    `<span class="dya-tile__icon">${DOCS_ICON}</span>` +
                    '<span class="dya-tile__name">Unfold a page</span>' +
                    '<span class="dya-tile__note">Write, read, rename or delete pages. ' +
                    'Markdown with its diagrams, JSON, YAML, code, plain text</span>'
                tile.onclick = () => openLibrary()

                if (message) {
                    const line = document.createElement('span')
                    line.className = 'dya-text--danger'
                    line.textContent = message
                    invite.append(line)
                }

                invite.append(tile)
                content.replaceChildren(invite)
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

            function when(mtime: number): string {
                const at = new Date(mtime)
                const pad = (value: number): string => String(value).padStart(2, '0')
                return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
                    `${pad(at.getHours())}:${pad(at.getMinutes())}`
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
                    list.replaceChildren()
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
                        cell('dya-table__num dya-table__fit', size(page.size)),
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
                    complain('Cannot list the pages')
                }
                draw()
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
                    complain('Cannot open that file')
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
                        name.textContent = result.name
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
                    complain('Cannot delete that file')
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

            async function renderCurrent(): Promise<void> {
                if (!current) return
                content.className = 'dya-text docviewer-content'
                if (mode === 'edit') {
                    content.replaceChildren(editor())
                    return
                }
                if (current.markdown && mode === 'rendered') {
                    /*
                     * A markdown file is somebody else's HTML. marked passes raw HTML through,
                     * and this panel draws into the shell's own document, where window.dyarchia
                     * can spawn a terminal: an `<img onerror>` in a downloaded README ran code
                     * the moment it was opened. Everything marked produces is sanitised first.
                     */
                    const holder = document.createElement('div')
                    holder.innerHTML = DOMPurify.sanitize(await marked.parse(current.content ?? ''))
                    for (const table of holder.querySelectorAll('table')) {
                        table.className = 'dya-table'
                    }
                    for (const row of holder.querySelectorAll('tbody tr')) {
                        row.className = 'dya-row'
                        row.firstElementChild?.classList.add('dya-table__subject')
                    }
                    colourBlocks(holder)
                    content.classList.add('dya-prose')
                    content.replaceChildren(...holder.childNodes)
                    await renderDiagrams(content)
                } else {
                    content.replaceChildren(sourceLines())
                }
                content.scrollTop = 0
                if (target !== null) {
                    const at = content.querySelector('.dya-code__line--at')
                    at?.scrollIntoView({ block: 'center' })
                }
            }

            async function present(result: OpenResult, line?: number, start?: Mode): Promise<void> {
                current = result
                target = line ?? null
                /*
                 * A document asked for at a line opens on its source, because that is the only
                 * view where a line number means anything: the rendered view is HTML and has no
                 * lines to point at. The mode buttons are right there when the reader wants prose.
                 */
                mode = start ?? (line || !result.markdown ? 'source' : 'rendered')
                name.textContent = result.name ?? ''
                header.hidden = false
                /*
                 * The bar used to appear for markdown alone, because reading the source of a
                 * file that is already source says nothing. Editing does, and it is offered for
                 * everything this panel opens.
                 */
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
                        background: ctx.token('surface-1'),
                        mainBkg: ctx.token('raised'),
                        primaryColor: ctx.token('raised'),
                        primaryTextColor: ctx.token('text'),
                        primaryBorderColor: ctx.token('border-strong'),
                        secondaryColor: ctx.token('surface-2'),
                        tertiaryColor: ctx.token('surface-2'),
                        nodeBorder: ctx.token('border-strong'),
                        clusterBkg: ctx.token('surface-2'),
                        clusterBorder: ctx.token('border'),
                        edgeLabelBackground: ctx.token('surface-1'),
                        lineColor: ctx.token('text-4'),
                        textColor: ctx.token('text-2'),
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
                if (busy || !leave()) return
                closeLibrary()
                busy = true
                try {
                    const result = (await ctx.invoke('read', request.path)) as OpenResult
                    if (result.error) {
                        showEmpty(result.error)
                        return
                    }
                    await present(result, request.line)
                } catch {
                    showEmpty('Cannot open that file')
                } finally {
                    busy = false
                }
            }

            deliver = accept
            if (waiting) {
                const request = waiting
                waiting = null
                void accept(request)
            }

            return () => {
                if (deliver === accept) deliver = null
                container.replaceChildren()
            }
        }
    )
}
