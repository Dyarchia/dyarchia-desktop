import { marked } from 'marked'
import type { PluginContext } from '@dyarchia/sdk'

interface DirEntry {
    name: string
    isDir: boolean
    path: string
}

const STYLES = `
.docviewer {
    display: flex;
    height: 100%;
    color: var(--dya-text-2);
    font-size: var(--dya-size-label);
}
.docviewer-tree {
    width: 230px;
    min-width: 160px;
    overflow-y: auto;
    padding: var(--dya-space-2) 0;
    border-right: var(--dya-border-width) solid var(--dya-line);
}
.docviewer-entry {
    display: block;
    width: 100%;
    padding: 3px var(--dya-space-3);
    border: none;
    border-left: 2px solid transparent;
    background: none;
    color: var(--dya-text-3);
    text-align: left;
    cursor: pointer;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color var(--dya-dur-fast) var(--dya-ease);
}
.docviewer-entry:hover {
    color: var(--dya-text);
    background: var(--dya-surface-2);
}
.docviewer-entry-dir {
    color: var(--dya-text-2);
}
.docviewer-entry-active {
    color: var(--dya-text);
    background: var(--dya-surface-2);
    border-left-color: var(--dya-accent);
}
.docviewer-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--dya-space-5) var(--dya-space-6);
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-body-sm);
    line-height: var(--dya-leading-body);
    color: var(--dya-text-2);
}
.docviewer-content h1,
.docviewer-content h2,
.docviewer-content h3 {
    margin: var(--dya-space-5) 0 var(--dya-space-2);
    color: var(--dya-text);
    font-weight: 400;
    line-height: var(--dya-leading-heading);
}
.docviewer-content h1 { font-size: var(--dya-size-h3); letter-spacing: var(--dya-tracking-h3); }
.docviewer-content h2 { font-size: var(--dya-size-body); }
.docviewer-content h3 { font-size: var(--dya-size-body-sm); }
.docviewer-content p {
    margin: var(--dya-space-2) 0;
}
.docviewer-content pre {
    margin: var(--dya-space-3) 0;
    padding: var(--dya-space-3);
    background: var(--dya-surface-2);
    border: var(--dya-border-width) solid var(--dya-border-card);
    border-radius: var(--dya-radius);
    overflow-x: auto;
}
.docviewer-content code {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
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
    color: var(--dya-text-3);
}
.docviewer-content hr {
    margin: var(--dya-space-5) 0;
    border: none;
    border-top: var(--dya-border-width) solid var(--dya-line);
}
.docviewer-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--dya-text-3);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
}
`

const TEXT_EXTENSIONS = new Set([
    '.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.css', '.html',
    '.xml', '.csv', '.log', '.ps1', '.py', '.cls', '.trigger', '.apex'
])

function ensureStyles(): void {
    if (document.getElementById('dyarchia-docviewer-styles')) return
    const style = document.createElement('style')
    style.id = 'dyarchia-docviewer-styles'
    style.textContent = STYLES
    document.head.appendChild(style)
}

const DOCS_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        { id: 'docviewer', title: 'Docs', icon: DOCS_ICON, duplicable: true },
        (container) => {
        ensureStyles()

        const root = document.createElement('div')
        root.className = 'docviewer'
        const tree = document.createElement('div')
        tree.className = 'docviewer-tree'
        const content = document.createElement('div')
        content.className = 'docviewer-content'
        content.innerHTML = '<div class="docviewer-empty">Select a file</div>'
        root.append(tree, content)
        container.appendChild(root)

        let activeEntry: HTMLButtonElement | null = null

        async function openFile(entry: DirEntry, button: HTMLButtonElement): Promise<void> {
            activeEntry?.classList.remove('docviewer-entry-active')
            activeEntry = button
            button.classList.add('docviewer-entry-active')
            const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
            const result = (await ctx.invoke('read', entry.path)) as {
                content?: string
                error?: string
            }
            if (result.error) {
                content.innerHTML = `<div class="docviewer-empty">${result.error}</div>`
                return
            }
            if (ext === '.md') {
                content.innerHTML = await marked.parse(result.content ?? '')
            } else {
                const pre = document.createElement('pre')
                pre.textContent = result.content ?? ''
                content.replaceChildren(pre)
            }
        }

        async function loadDir(dirPath: string): Promise<void> {
            const entries = (await ctx.invoke('list', dirPath)) as DirEntry[]
            activeEntry = null
            tree.replaceChildren()
            const up = document.createElement('button')
            up.className = 'docviewer-entry docviewer-entry-dir'
            up.textContent = '..'
            up.onclick = () => {
                let parent = dirPath.replace(/[\\/][^\\/]+$/, '')
                if (/^[A-Za-z]:$/.test(parent)) parent += '\\'
                if (parent && parent !== dirPath) void loadDir(parent)
            }
            tree.appendChild(up)
            for (const entry of entries) {
                if (!entry.isDir) {
                    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
                    if (!TEXT_EXTENSIONS.has(ext)) continue
                }
                const btn = document.createElement('button')
                btn.className = entry.isDir
                    ? 'docviewer-entry docviewer-entry-dir'
                    : 'docviewer-entry'
                btn.textContent = entry.isDir ? `${entry.name}/` : entry.name
                btn.onclick = () => {
                    if (entry.isDir) void loadDir(entry.path)
                    else void openFile(entry, btn)
                }
                tree.appendChild(btn)
            }
        }

        void ctx.invoke('home').then((home) => loadDir(home as string))

        return () => {
            container.replaceChildren()
        }
    })
}
