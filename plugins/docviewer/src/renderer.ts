import { marked } from 'marked'
import { highlight, highlightLines, injectStyles } from '@dyarchia/sdk'
import type { OpenRequest, PluginContext } from '@dyarchia/sdk'

interface OpenResult {
    canceled?: boolean
    error?: string
    name?: string
    path?: string
    markdown?: boolean
    mtime?: number
    content?: string
}

interface WriteResult {
    error?: string
    stale?: boolean
    mtime?: number
}

const STYLES = `
.docviewer {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.docviewer-header {
    display: flex;
    align-items: center;
    gap: var(--dya-space-3);
    padding: var(--dya-space-2) var(--dya-space-3);
}
.docviewer-header[hidden] {
    display: none;
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
.docviewer-open {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.docviewer-open svg {
    display: block;
    width: 13px;
    height: 13px;
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
.docviewer-content h1 {
    margin: var(--dya-space-5) 0 var(--dya-space-2);
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-h2);
    font-weight: var(--dya-weight-light);
    letter-spacing: var(--dya-tracking-h2);
    line-height: var(--dya-leading-heading);
    color: var(--dya-text);
}
.docviewer-content h2,
.docviewer-content h3 {
    margin: var(--dya-space-5) 0 var(--dya-space-2);
    font-family: var(--dya-font-sans);
    line-height: var(--dya-leading-heading);
    color: var(--dya-text);
}
.docviewer-content h2 {
    font-size: var(--dya-size-h3);
    font-weight: var(--dya-weight);
    letter-spacing: var(--dya-tracking-h3);
}
.docviewer-content h3 {
    font-size: var(--dya-size-h4);
    font-weight: var(--dya-weight-medium);
}
.docviewer-content p {
    margin: var(--dya-space-2) 0;
}
.docviewer-content pre {
    margin: var(--dya-space-3) 0;
    padding: var(--dya-space-3);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    background: var(--dya-surface-2);
    border: var(--dya-border-width) solid var(--dya-border);
    border-radius: var(--dya-radius);
    overflow-x: auto;
}
.docviewer-diagram {
    margin: var(--dya-space-3) 0;
    padding: var(--dya-space-3);
    background: var(--dya-surface-2);
    border: var(--dya-border-width) solid var(--dya-border);
    border-radius: var(--dya-radius);
    overflow-x: auto;
    text-align: center;
}
.docviewer-diagram svg {
    max-width: 100%;
    height: auto;
}
.docviewer-content code {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
}
.docviewer-content ul,
.docviewer-content ol {
    margin: var(--dya-space-2) 0;
    padding-left: var(--dya-space-5);
}
.docviewer-content a {
    color: var(--dya-text);
    text-decoration: underline;
    text-decoration-color: var(--dya-accent);
    text-underline-offset: 3px;
}
.docviewer-content blockquote {
    margin: var(--dya-space-3) 0;
    padding-left: var(--dya-space-3);
    border-left: 2px solid var(--dya-border);
    color: var(--dya-text-4);
}
.docviewer-content hr {
    margin: var(--dya-space-5) 0;
    border: none;
    border-top: var(--dya-border-width) solid var(--dya-border);
}
.docviewer-line {
    display: block;
    min-height: 1lh;
}
.docviewer-line--at {
    background: var(--dya-selected);
    box-shadow: -3px 0 0 var(--dya-accent);
}
/*
 * The editor is a textarea with no colour of its own lying exactly on top of the same text,
 * highlighted, in a pre behind it. Both have to agree on every metric that decides where a
 * glyph lands, so the two rules below are one rule written twice and neither may drift.
 */
.docviewer-editor {
    position: relative;
    height: 100%;
    overflow: auto;
}
.docviewer-editor > pre,
.docviewer-editor > textarea {
    margin: 0;
    padding: 0;
    border: none;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    line-height: var(--dya-leading-body);
    letter-spacing: var(--dya-tracking-mono);
    tab-size: 4;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: break-word;
}
.docviewer-editor > pre {
    min-height: 100%;
    pointer-events: none;
}
/*
 * The textarea is as tall as the text it holds, never a window onto it, so it never scrolls on
 * its own and there are not two scroll positions to keep in step. The frame scrolls, and the
 * browser keeps the caret in view because the caret is inside it.
 */
.docviewer-editor > textarea {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    resize: none;
    background: transparent;
    color: transparent;
    caret-color: var(--dya-accent);
    outline: none;
    overflow: hidden;
}
.docviewer-editor > textarea::selection {
    background: var(--dya-selected);
    color: transparent;
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
            note: 'Read markdown with its diagrams, or edit any text file, in colour.',
            duplicable: true
        },
        (container) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = document.createElement('div')
            root.className = 'docviewer'

            /*
             * The bar names what is open, so it is there once something is. With nothing open the
             * offer is the panel itself and a bar holding one control and a rule is a fragment of
             * an interface above a void.
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
            save.className = 'dya-button dya-button--quiet dya-button--sm docviewer-save'
            save.textContent = 'Save'
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
                        say('changed on disk since it was opened')
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
                    '<span class="dya-tile__name">Open a document</span>' +
                    '<span class="dya-tile__note">Markdown renders, everything else is coloured ' +
                    'as code, and both can be edited and saved here.</span>'
                tile.onclick = () => void openFile()

                if (message) {
                    const line = document.createElement('span')
                    line.className = 'dya-text--danger'
                    line.textContent = message
                    invite.append(line)
                }

                invite.append(tile)
                content.replaceChildren(invite)
            }

            /*
             * A word, not a bare icon. An empty panel says nothing, which leaves its bar as the
             * only thing on the screen telling a reader what to do with it — and a 14px glyph in
             * the far corner of an otherwise blank rectangle tells nobody anything. The bare
             * variant is for a control beside something that already has a name.
             */
            function openButton(): HTMLButtonElement {
                const button = document.createElement('button')
                button.className = 'dya-button dya-button--quiet dya-button--sm docviewer-open'
                button.innerHTML = `${DOCS_ICON}<span>Open</span>`
                button.onclick = () => void openFile()
                return button
            }

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
                    row.className = 'docviewer-line'
                    row.dataset.line = String(index + 1)
                    if (index + 1 === target) row.classList.add('docviewer-line--at')
                    row.innerHTML = line
                    pre.append(row)
                }
                return pre
            }

            function editor(): HTMLElement {
                const language = languageOf(current?.name ?? '')
                const frame = document.createElement('div')
                frame.className = 'docviewer-editor'
                const behind = document.createElement('pre')
                behind.className = 'dya-code'
                const field = document.createElement('textarea')
                field.spellcheck = false
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
                    const holder = document.createElement('div')
                    holder.innerHTML = await marked.parse(current.content ?? '')
                    for (const table of holder.querySelectorAll('table')) {
                        table.className = 'dya-table'
                    }
                    for (const row of holder.querySelectorAll('tbody tr')) {
                        row.className = 'dya-row'
                        row.firstElementChild?.classList.add('dya-table__subject')
                    }
                    colourBlocks(holder)
                    content.replaceChildren(...holder.childNodes)
                    await renderDiagrams(content)
                } else {
                    content.replaceChildren(sourceLines())
                }
                content.scrollTop = 0
                if (target !== null) {
                    const at = content.querySelector('.docviewer-line--at')
                    at?.scrollIntoView({ block: 'center' })
                }
            }

            async function present(result: OpenResult, line?: number): Promise<void> {
                current = result
                target = line ?? null
                /*
                 * A document asked for at a line opens on its source, because that is the only
                 * view where a line number means anything: the rendered view is HTML and has no
                 * lines to point at. The mode buttons are right there when the reader wants prose.
                 */
                mode = line || !result.markdown ? 'source' : 'rendered'
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

            async function openFile(): Promise<void> {
                if (busy) return
                busy = true
                try {
                    const result = (await ctx.invoke('open')) as OpenResult
                    if (result.canceled) return
                    if (result.error) {
                        showEmpty(result.error)
                        return
                    }
                    await present(result)
                } catch {
                    showEmpty('Cannot open that file')
                } finally {
                    busy = false
                }
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
                        figure.className = 'docviewer-diagram'
                        figure.innerHTML = svg
                        pre.replaceWith(figure)
                    } catch {
                        continue
                    }
                }
            }

            header.append(openButton())
            showEmpty()

            async function accept(request: OpenRequest): Promise<void> {
                if (busy) return
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
