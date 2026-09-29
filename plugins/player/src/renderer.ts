import { glyph, injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

interface OpenResult {
    canceled?: boolean
    name?: string
    kind?: 'audio' | 'video'
    src?: string
}

/*
 * The panel's mark, one of a set in black and white and nothing else, each a thing of Sparta:
 * an aulos, the double pipe the phalanx marched to.
 * Solid shapes rather than hairlines, so it reads as a key at 18px.
 */
const PLAYER_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="rotate(18 5 20)"><path d="M4.1 20 4.4 6.4 3.2 3.2H6.8L5.6 6.4 5.9 20z" fill="#eceef2"/><circle cx="5" cy="10.4" r=".55" fill="#0a0a0b"/><circle cx="5" cy="13" r=".55" fill="#0a0a0b"/><circle cx="5" cy="15.6" r=".55" fill="#0a0a0b"/></g><g transform="rotate(48 5 20)"><path d="M4.1 20 4.4 6.4 3.2 3.2H6.8L5.6 6.4 5.9 20z" fill="#eceef2"/><circle cx="5" cy="10.4" r=".55" fill="#0a0a0b"/><circle cx="5" cy="13" r=".55" fill="#0a0a0b"/><circle cx="5" cy="15.6" r=".55" fill="#0a0a0b"/></g><rect x="3.2" y="18.4" width="3.8" height="2.6" rx=".6" fill="#eceef2" transform="rotate(33 5 20)"/><path d="M3.4 21.4 1.8 23" stroke="#eceef2" stroke-width="1.6" stroke-linecap="round"/></svg>'

const STYLES = `
.player {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.player-stage.player-stage--empty {
    display: block;
    padding: var(--dya-space-4);
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
             * A failure is said here too, over the same offer, because the offer is still what
             * to do next. The offer starts at the top left, where every gallery of tiles starts.
             */
            function showEmpty(message?: string): void {
                handle.setTitle(null)
                open.hidden = true

                const invite = document.createElement('div')
                invite.className = 'dya-grid'

                if (message) {
                    const line = document.createElement('span')
                    line.className = 'dya-empty dya-text--danger'
                    line.textContent = message
                    invite.append(line)
                }

                const tile = document.createElement('button')
                tile.className = 'dya-tile'
                tile.type = 'button'
                tile.innerHTML =
                    `<span class="dya-tile__icon">${PLAYER_ICON}</span>` +
                    '<span class="dya-tile__name">Cue a file</span>'
                tile.onclick = () => void openMedia()

                invite.append(tile)
                stage.classList.add('player-stage--empty')
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
                    stage.classList.remove('player-stage--empty')
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
