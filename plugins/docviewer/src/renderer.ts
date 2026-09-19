import { marked } from 'marked'
import { injectStyles } from '@dyarchia/sdk'
import type { OpenRequest, PluginContext } from '@dyarchia/sdk'

interface OpenResult {
    canceled?: boolean
    error?: string
    name?: string
    markdown?: boolean
    content?: string
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
    border-bottom: var(--dya-border-width) dashed var(--dya-dashed);
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
.docviewer-open svg {
    display: block;
    width: 14px;
    height: 14px;
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
    border-top: var(--dya-border-width) solid var(--dya-hairline);
}
.docviewer-line {
    display: block;
    min-height: 1lh;
}
.docviewer-line--at {
    background: var(--dya-selected);
    box-shadow: -3px 0 0 var(--dya-accent);
}
`

const DOCS_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'

const EYE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
const PENCIL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'

const MODES = [
    { id: 'rendered', label: 'Rendered', icon: EYE_ICON },
    { id: 'source', label: 'Markdown source', icon: PENCIL_ICON }
] as const

type Mode = (typeof MODES)[number]['id']

/*
 * The kinds of file this panel answers for. It renders markdown and shows everything else as
 * source, which is worth having for any of these; a format it would only mangle is not listed.
 */
const OPENS = [
    '.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.css', '.html',
    '.xml', '.csv', '.log', '.ps1', '.py', '.cls', '.trigger', '.apex'
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
            note: 'Read markdown with its diagrams and its code, or the source behind it.',
            duplicable: true
        },
        (container) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = document.createElement('div')
            root.className = 'docviewer'

            /*
             * The bar stays. It used to hide itself whenever the panel had nothing open, which is
             * exactly when the only control that matters — open something — needs to be reachable,
             * and it is why the empty panel had to grow a button of its own in the middle of it.
             * The panel is simply empty now, with its bar where every other panel's bar is.
             */
            const header = document.createElement('div')
            header.className = 'docviewer-header'
            const name = document.createElement('span')
            name.className = 'dya-mono docviewer-name'
            const modes = document.createElement('div')
            modes.className = 'docviewer-modes'
            modes.hidden = true
            header.append(name, modes)

            const content = document.createElement('div')
            root.append(header, content)
            container.appendChild(root)

            let busy = false
            let diagram = 0
            let current: OpenResult | null = null
            let mode: Mode = 'rendered'
            let target: number | null = null

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
                    const active = MODES[index].id === mode
                    button.className = active ? 'dya-key dya-key--active' : 'dya-key'
                    button.setAttribute('aria-pressed', String(active))
                })
            }

            function setMode(next: Mode): void {
                if (mode === next) return
                mode = next
                syncModes()
                void renderCurrent()
            }

            /*
             * An empty panel is empty. It said "Read a document" over a sentence over a button, in
             * the middle of an otherwise blank panel, which is an advertisement for a panel the
             * reader has already opened. Only a failure has anything to say here.
             */
            function showEmpty(message?: string): void {
                current = null
                name.textContent = ''
                modes.hidden = true
                content.className = 'dya-text docviewer-content docviewer-content--empty'

                if (!message) {
                    content.replaceChildren()
                    return
                }

                const line = document.createElement('div')
                line.className = 'dya-empty dya-empty--inline dya-text--danger'
                line.textContent = message
                content.replaceChildren(line)
            }

            function openButton(): HTMLButtonElement {
                const button = document.createElement('button')
                button.className = 'dya-button dya-button--bare docviewer-open'
                button.title = 'Open document'
                button.setAttribute('aria-label', 'Open document')
                button.innerHTML = DOCS_ICON
                button.onclick = () => void openFile()
                return button
            }

            async function renderCurrent(): Promise<void> {
                if (!current) return
                content.className = 'dya-text docviewer-content'
                if (current.markdown && mode === 'rendered') {
                    const holder = document.createElement('div')
                    holder.innerHTML = await marked.parse(current.content ?? '')
                    for (const table of holder.querySelectorAll('table')) {
                        table.className = 'dya-table'
                    }
                    for (const row of holder.querySelectorAll('tbody tr')) {
                        row.className = 'dya-row'
                    }
                    content.replaceChildren(...holder.childNodes)
                    await renderDiagrams(content)
                } else {
                    const pre = document.createElement('pre')
                    /*
                     * One element per line, so a line can be pointed at. A plugin that found a
                     * passage knows which line it was on, and scrolling the reader to the top of
                     * a nine-hundred-line page is not showing it to anybody.
                     */
                    const lines = (current.content ?? '').split('\n')
                    for (const [index, line] of lines.entries()) {
                        const row = document.createElement('span')
                        row.className = 'docviewer-line'
                        row.dataset.line = String(index + 1)
                        if (index + 1 === target) row.classList.add('docviewer-line--at')
                        row.textContent = line
                        pre.append(row)
                    }
                    content.replaceChildren(pre)
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
                mode = line ? 'source' : 'rendered'
                name.textContent = result.name ?? ''
                header.hidden = false
                modes.hidden = !result.markdown
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
