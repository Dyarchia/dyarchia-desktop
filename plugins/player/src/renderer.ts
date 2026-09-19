import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

interface OpenResult {
    canceled?: boolean
    name?: string
    kind?: 'audio' | 'video'
    src?: string
}

const PLAYER_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>'

const STYLES = `
.player {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.player-header {
    display: flex;
    align-items: center;
    gap: var(--dya-space-3);
    padding: var(--dya-space-2) var(--dya-space-3);
    border-bottom: var(--dya-border-width) dashed var(--dya-dashed);
}
.player-header[hidden] {
    display: none;
}
.player-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.player-open svg {
    display: block;
    width: 14px;
    height: 14px;
}
.player-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--dya-space-5);
}
.player-stage audio,
.player-stage video {
    color-scheme: var(--dya-scheme);
}
.player-stage video {
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--dya-radius-media);
    background: var(--dya-sunken);
    outline: none;
}
.player-stage audio {
    width: min(420px, 90%);
}
`


export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        {
            id: 'player',
            title: 'Player',
            icon: PLAYER_ICON,
            note: 'Play audio and video from this machine, without leaving the window.',
            duplicable: true
        },
        (container) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = document.createElement('div')
            root.className = 'player'

            const header = document.createElement('div')
            header.className = 'player-header'
            header.hidden = true
            const name = document.createElement('span')
            name.className = 'dya-mono player-name'
            header.append(name)

            const stage = document.createElement('div')
            stage.className = 'player-stage'
            root.append(header, stage)
            container.appendChild(root)

            let busy = false

            function openButton(): HTMLButtonElement {
                const button = document.createElement('button')
                button.className = 'dya-button dya-button--bare player-open'
                button.title = 'Open media'
                button.setAttribute('aria-label', 'Open media')
                button.innerHTML = PLAYER_ICON
                button.onclick = () => void openMedia()
                return button
            }

            /*
             * The same shape as every other empty panel in this application: what it is for, one
             * line, and the action. It used to be an unlabelled icon in the middle of the stage.
             */
            function showEmpty(message?: string): void {
                header.hidden = true

                const empty = document.createElement('div')
                empty.className = 'dya-empty'

                const title = document.createElement('span')
                title.className = 'dya-title'
                title.textContent = 'Play something'
                empty.append(title)

                const line = document.createElement('span')
                line.className = message ? 'dya-text dya-text--danger' : 'dya-text'
                line.textContent = message ?? 'Audio or video from this machine, in this window.'
                empty.append(line)

                const actions = document.createElement('div')
                actions.className = 'dya-empty__actions'
                const open = document.createElement('button')
                open.className = 'dya-button dya-button--primary'
                open.textContent = 'Open a file'
                open.onclick = () => void openMedia()
                actions.append(open)
                empty.append(actions)

                stage.replaceChildren(empty)
            }

            async function openMedia(): Promise<void> {
                if (busy) return
                busy = true
                try {
                    const result = (await ctx.invoke('open')) as OpenResult
                    if (result.canceled || !result.src) return
                    const media = document.createElement(
                        result.kind === 'video' ? 'video' : 'audio'
                    )
                    media.controls = true
                    media.autoplay = true
                    media.src = result.src
                    media.onerror = () => showEmpty('Cannot play that file')
                    name.textContent = result.name ?? ''
                    header.hidden = false
                    stage.replaceChildren(media)
                } catch {
                    showEmpty('Cannot open that file')
                } finally {
                    busy = false
                }
            }

            header.append(openButton())
            showEmpty()

            return () => {
                container.replaceChildren()
            }
        }
    )
}
