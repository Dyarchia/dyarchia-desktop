import type { PluginContext } from '@dyarchia/sdk'

interface DirEntry {
    name: string
    isDir: boolean
    path: string
}

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus'])

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov'])

const PLAYER_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>'

const STYLES = `
.player {
    display: flex;
    height: 100%;
    color: #ddd;
    font-size: 13px;
}
.player-tree {
    width: 230px;
    min-width: 160px;
    overflow-y: auto;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    padding: 6px 0;
}
.player-entry {
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
.player-entry:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.player-entry-dir { color: #7aa2c7; }
.player-entry-active { color: #fff; background: rgba(255, 255, 255, 0.08); }
.player-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 18px;
    min-width: 0;
}
.player-stage video {
    max-width: 100%;
    max-height: calc(100% - 40px);
    border-radius: 8px;
    background: #000;
    outline: none;
}
.player-stage audio {
    width: min(420px, 90%);
}
.player-title {
    color: #9a9aa2;
    font-size: 12px;
    max-width: 90%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.player-empty { color: #555; }
`

function ensureStyles(): void {
    if (document.getElementById('dyarchia-player-styles')) return
    const style = document.createElement('style')
    style.id = 'dyarchia-player-styles'
    style.textContent = STYLES
    document.head.appendChild(style)
}

function extensionOf(name: string): string {
    return name.slice(name.lastIndexOf('.')).toLowerCase()
}

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        { id: 'player', title: 'Player', icon: PLAYER_ICON, duplicable: true },
        (container) => {
            ensureStyles()

            const root = document.createElement('div')
            root.className = 'player'
            const tree = document.createElement('div')
            tree.className = 'player-tree'
            const stage = document.createElement('div')
            stage.className = 'player-stage'
            stage.innerHTML = '<div class="player-empty">Select a media file</div>'
            root.append(tree, stage)
            container.appendChild(root)

            let activeButton: HTMLButtonElement | null = null

            function play(entry: DirEntry, button: HTMLButtonElement): void {
                const ext = extensionOf(entry.name)
                const media = document.createElement(VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio')
                media.controls = true
                media.autoplay = true
                media.src = `dyarchia-media://local/${encodeURIComponent(entry.path)}`
                media.onerror = () => {
                    stage.innerHTML = '<div class="player-empty">Cannot play this file</div>'
                }
                const title = document.createElement('div')
                title.className = 'player-title'
                title.textContent = entry.name
                stage.replaceChildren(media, title)
                activeButton?.classList.remove('player-entry-active')
                activeButton = button
                button.classList.add('player-entry-active')
            }

            async function loadDir(dirPath: string): Promise<void> {
                const entries = (await ctx.invoke('list', dirPath)) as DirEntry[]
                tree.replaceChildren()
                const up = document.createElement('button')
                up.className = 'player-entry player-entry-dir'
                up.textContent = '..'
                up.onclick = () => {
                    let parent = dirPath.replace(/[\\/][^\\/]+$/, '')
                    if (/^[A-Za-z]:$/.test(parent)) parent += '\\'
                    if (parent && parent !== dirPath) void loadDir(parent)
                }
                tree.appendChild(up)
                for (const entry of entries) {
                    const ext = extensionOf(entry.name)
                    if (!entry.isDir && !AUDIO_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) {
                        continue
                    }
                    const btn = document.createElement('button')
                    btn.className = entry.isDir
                        ? 'player-entry player-entry-dir'
                        : 'player-entry'
                    btn.textContent = entry.isDir ? `${entry.name}/` : entry.name
                    btn.onclick = () => {
                        if (entry.isDir) void loadDir(entry.path)
                        else play(entry, btn)
                    }
                    tree.appendChild(btn)
                }
            }

            void ctx.invoke('home').then((home) => loadDir(home as string))

            return () => {
                container.replaceChildren()
            }
        }
    )
}
