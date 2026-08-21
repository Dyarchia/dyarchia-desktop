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
    color: var(--dya-text-2);
    font-size: var(--dya-size-label);
}
.player-tree {
    width: 230px;
    min-width: 160px;
    overflow-y: auto;
    padding: var(--dya-space-2) 0;
    border-right: var(--dya-border-width) solid var(--dya-line);
}
.player-entry {
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
.player-entry:hover {
    color: var(--dya-text);
    background: var(--dya-surface-2);
}
.player-entry-dir {
    color: var(--dya-text-2);
}
.player-entry-active {
    color: var(--dya-text);
    background: var(--dya-surface-2);
    border-left-color: var(--dya-accent);
}
.player-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--dya-space-3);
    padding: var(--dya-space-5);
    min-width: 0;
}
.player-stage video {
    max-width: 100%;
    max-height: calc(100% - 40px);
    border-radius: var(--dya-radius-media);
    background: var(--dya-surface-inverse);
    outline: none;
}
.player-stage audio {
    width: min(420px, 90%);
}
.player-title {
    max-width: 90%;
    color: var(--dya-text-3);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.player-empty {
    color: var(--dya-text-3);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
}
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
