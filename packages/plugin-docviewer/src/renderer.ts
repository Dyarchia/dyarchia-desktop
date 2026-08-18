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
    background: transparent;
    color: #ddd;
    font-size: 13px;
}
.docviewer-tree {
    width: 230px;
    min-width: 160px;
    overflow-y: auto;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    padding: 6px 0;
}
.docviewer-entry {
    display: block;
    width: 100%;
    padding: 3px 12px;
    border: none;
    background: none;
    color: #bbb;
    text-align: left;
    cursor: pointer;
    font: inherit;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.docviewer-entry:hover { background: #222; color: #fff; }
.docviewer-entry-dir { color: #7aa2c7; }
.docviewer-content {
    flex: 1;
    overflow-y: auto;
    padding: 18px 26px;
    line-height: 1.55;
}
.docviewer-content h1, .docviewer-content h2, .docviewer-content h3 {
    margin: 0.8em 0 0.4em;
    color: #f0f0f0;
}
.docviewer-content p { margin: 0.5em 0; }
.docviewer-content pre {
    background: rgba(0, 0, 0, 0.32);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 10px 12px;
    overflow-x: auto;
}
.docviewer-content code {
    font-family: 'Cascadia Mono', Consolas, monospace;
    font-size: 12px;
}
.docviewer-content ul, .docviewer-content ol { padding-left: 1.6em; margin: 0.5em 0; }
.docviewer-content a { color: #7aa2c7; }
.docviewer-content blockquote {
    border-left: 3px solid #3a4a5a;
    margin: 0.6em 0;
    padding-left: 12px;
    color: #999;
}
.docviewer-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #555;
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

        async function openFile(entry: DirEntry): Promise<void> {
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
                    else void openFile(entry)
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
