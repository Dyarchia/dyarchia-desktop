import { marked } from 'marked'
import type { PluginContext } from '@dyarchia/sdk'

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
    font-family: var(--dya-font-mono);
    font-weight: var(--dya-weight);
    line-height: var(--dya-leading-tight);
    text-transform: uppercase;
    color: var(--dya-text-2);
}
.docviewer-content h2 {
    font-size: var(--dya-size-mono-sm);
    letter-spacing: var(--dya-tracking-label);
}
.docviewer-content h3 {
    font-size: var(--dya-size-label);
    letter-spacing: var(--dya-tracking-data);
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
`

const DOCS_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'

function ensureStyles(): void {
    if (document.getElementById('dyarchia-docviewer-styles')) return
    const style = document.createElement('style')
    style.id = 'dyarchia-docviewer-styles'
    style.textContent = STYLES
    document.head.appendChild(style)
}

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        { id: 'docviewer', title: 'Docs', icon: DOCS_ICON, duplicable: true },
        (container) => {
            ensureStyles()

            const root = document.createElement('div')
            root.className = 'docviewer'

            const header = document.createElement('div')
            header.className = 'docviewer-header'
            header.hidden = true
            const name = document.createElement('span')
            name.className = 'dya-mono docviewer-name'
            header.append(name)

            const content = document.createElement('div')
            root.append(header, content)
            container.appendChild(root)

            let busy = false
            let diagram = 0

            function showEmpty(message?: string): void {
                header.hidden = true
                content.className = 'dya-text docviewer-content docviewer-content--empty'
                const empty = document.createElement('div')
                empty.className = 'dya-empty'
                empty.append(openButton('dya-button'))
                if (message) {
                    const label = document.createElement('span')
                    label.textContent = message
                    empty.append(label)
                }
                content.replaceChildren(empty)
            }

            function openButton(className: string): HTMLButtonElement {
                const button = document.createElement('button')
                button.className = `${className} docviewer-open`
                button.title = 'Open document'
                button.setAttribute('aria-label', 'Open document')
                button.innerHTML = DOCS_ICON
                button.onclick = () => void openFile()
                return button
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
                    name.textContent = result.name ?? ''
                    header.hidden = false
                    content.className = 'dya-text docviewer-content'
                    if (result.markdown) {
                        const holder = document.createElement('div')
                        holder.innerHTML = await marked.parse(result.content ?? '')
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
                        pre.textContent = result.content ?? ''
                        content.replaceChildren(pre)
                    }
                    content.scrollTop = 0
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

            header.append(openButton('dya-button dya-button--sm'))
            showEmpty()

            return () => {
                container.replaceChildren()
            }
        }
    )
}
