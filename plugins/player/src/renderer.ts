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
.player-open {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.player-open svg {
    display: block;
    width: 13px;
    height: 13px;
}
.player-invite {
    max-width: 420px;
    padding: 0;
}
.player-tile {
    width: 100%;
}
.player-tile .dya-tile__icon {
    width: 22px;
    height: 22px;
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
    border-radius: var(--dya-radius-card);
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

            /*
             * The bar names what is open, so it is there once something is. With nothing open the
             * offer is the panel itself and a bar holding one control and a rule is a fragment of
             * an interface above a void.
             */
            const header = document.createElement('div')
            header.className = 'player-header'
            const name = document.createElement('span')
            name.className = 'dya-mono player-name'
            header.append(name)

            const stage = document.createElement('div')
            stage.className = 'player-stage'
            root.append(header, stage)
            container.appendChild(root)

            let busy = false

            /*
             * A word, not a bare icon, for the same reason as the reader's: an empty panel says
             * nothing, so its bar is the only thing left telling a reader what the panel is for.
             */
            function openButton(): HTMLButtonElement {
                const button = document.createElement('button')
                button.className = 'dya-button dya-button--quiet dya-button--sm player-open'
                button.innerHTML = `${PLAYER_ICON}<span>Open</span>`
                button.onclick = () => void openMedia()
                return button
            }

            /*
             * A panel with nothing in it offers what to put in it. It used to be empty on the
             * reasoning that its bar already carries the one control that matters, and at a
             * window's width that reasoning produces a black rectangle nine hundred pixels tall
             * with a word in the corner — which is what a reader opens once and never again.
             * A failure is said here too, under the same offer, because the offer is still what
             * to do next.
             */
            function showEmpty(message?: string): void {
                name.textContent = ''
                header.hidden = true

                const invite = document.createElement('div')
                invite.className = 'dya-empty player-invite'

                const tile = document.createElement('button')
                tile.className = 'dya-tile player-tile'
                tile.type = 'button'
                tile.innerHTML =
                    `<span class="dya-tile__icon">${PLAYER_ICON}</span>` +
                    '<span class="dya-tile__name">Play something</span>' +
                    '<span class="dya-tile__note">Video or audio this machine already holds. ' +
                    'It plays here, in the panel, and the dock keeps it where you put it.</span>'
                tile.onclick = () => void openMedia()

                if (message) {
                    const line = document.createElement('span')
                    line.className = 'dya-text--danger'
                    line.textContent = message
                    invite.append(line)
                }

                invite.append(tile)
                stage.replaceChildren(invite)
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
