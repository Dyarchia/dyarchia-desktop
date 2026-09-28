import { glyph, injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

interface OpenResult {
    canceled?: boolean
    name?: string
    kind?: 'audio' | 'video'
    src?: string
}

/*
 * The panel's mark: drawn for this application in flat layers, a metal body, a shadow on its lower
 * half and one colour of the palette, so it reads as a thing to press at 16px and as the panel's
 * face on its tile. Flat fills and no gradients, because the same mark is drawn several times at
 * once and a gradient is found by id.
 */
const PLAYER_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#f07a35"/><path d="M2 12a10 10 0 0 0 20 0z" fill="#0a0a0b" fill-opacity=".18"/><path d="M5 7.5a8.4 8.4 0 0 1 14 0" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/><path d="M10 8v8l6.3-4z" fill="#fff" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>'

const STYLES = `
.player {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.player-invite {
    max-width: 420px;
    padding: 0;
}
.player-tile {
    width: 100%;
}
.player-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--dya-space-3);
}
.player-stage audio,
.player-stage video {
    color-scheme: var(--dya-scheme);
}
/*
 * The video takes the whole stage and the picture is fitted inside it: contain scales it up or
 * down to the largest size that keeps its proportion, and whatever the panel's shape leaves over
 * is bare glass on the two short sides rather than a stretched frame. Only a card with a radius
 * of its own would show where the letterbox ends, so the element has none.
 */
.player-stage video {
    flex: 1;
    min-height: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: transparent;
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
            duplicable: true
        },
        (container, handle) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = document.createElement('div')
            root.className = 'player'

            /*
             * What is playing is the tab's title, and the key that opens another sits in the tab
             * row once something is open. With nothing open the tile in the panel is the way in.
             */
            const stage = document.createElement('div')
            stage.className = 'player-stage'
            root.append(stage)
            container.appendChild(root)

            let busy = false

            /*
             * Opening is an icon key in the bar, as in the reader: the empty panel's tile is what
             * says what the panel is for.
             */
            function openButton(): HTMLButtonElement {
                const button = document.createElement('button')
                button.className = 'dya-key'
                button.innerHTML = glyph('folder')
                button.title = 'Open'
                button.setAttribute('aria-label', 'Open a file')
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
                handle.setTitle(null)
                open.hidden = true

                const invite = document.createElement('div')
                invite.className = 'dya-empty player-invite'

                const tile = document.createElement('button')
                tile.className = 'dya-tile player-tile'
                tile.type = 'button'
                tile.innerHTML =
                    `<span class="dya-tile__icon">${PLAYER_ICON}</span>` +
                    '<span class="dya-tile__name">Cue a file</span>' +
                    '<span class="dya-tile__note">Sound or film from this machine</span>'
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
                    handle.setTitle(result.name ?? null)
                    open.hidden = false
                    stage.replaceChildren(media)
                } catch {
                    showEmpty('Cannot open that file')
                } finally {
                    busy = false
                }
            }

            const open = openButton()
            handle.toolbar.append(open)
            showEmpty()

            return () => {
                container.replaceChildren()
            }
        }
    )
}
