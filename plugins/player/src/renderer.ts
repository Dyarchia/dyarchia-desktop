import { glyph, injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'
import { MIME_TYPES } from './media.js'

interface Media {
    path: string
    name: string
    kind: 'audio' | 'video'
    src: string
}

interface Recent {
    path: string
    name: string
    at: number
}

interface Instance {
    idle(): boolean
    play(path: string): Promise<void>
}

/*
 * Every mounted player, so a file another plugin opens reaches one: the one showing nothing if
 * there is one, otherwise a new tab. A request for a tab that has not mounted yet waits here and
 * is played the moment it does.
 */
const instances = new Map<string, Instance>()
const waiting = new Map<string, string>()

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
    ctx.registerOpener(
        {
            panelId: 'player',
            extensions: Object.keys(MIME_TYPES),
            route: () => [...instances.entries()].find(([, instance]) => instance.idle())?.[0] ?? null
        },
        async (request) => {
            const target = request.instanceId ?? [...instances.keys()][0]
            const instance = target ? instances.get(target) : undefined
            if (instance) await instance.play(request.path)
            else waiting.set(target ?? '', request.path)
        }
    )

    ctx.registerCommand({
        id: 'player.open',
        title: 'Open media',
        icon: PLAYER_ICON,
        run: async () => {
            const path = (await ctx.invoke('pick')) as string | null
            if (path) await ctx.shell.open({ path })
        }
    })

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
             * row once something is open. With nothing open the gallery is the way in.
             */
            const stage = document.createElement('div')
            stage.className = 'player-stage'
            root.append(stage)
            container.appendChild(root)

            let busy = false
            let playing = false
            let disposed = false

            function openButton(): HTMLButtonElement {
                const button = document.createElement('button')
                button.className = 'dya-key'
                button.innerHTML = glyph('folder')
                button.title = 'Open'
                button.setAttribute('aria-label', 'Open')
                button.onclick = () => void pick()
                return button
            }

            function tile(icon: string, name: string, act: () => void): HTMLButtonElement {
                const card = document.createElement('button')
                card.type = 'button'
                card.className = 'dya-tile'
                card.innerHTML = `<span class="dya-tile__icon">${icon}</span>`
                const label = document.createElement('span')
                label.className = 'dya-tile__name'
                label.textContent = name
                card.append(label)
                card.onclick = act
                return card
            }

            function recentTile(item: Recent): HTMLButtonElement {
                const card = document.createElement('button')
                card.type = 'button'
                card.className = 'dya-tile dya-tile--dense'
                card.title = item.path
                const top = document.createElement('div')
                top.className = 'dya-tile__head'
                const name = document.createElement('span')
                name.className = 'dya-tile__name'
                name.textContent = item.name
                top.append(name)
                const facts = document.createElement('span')
                facts.className = 'dya-meta'
                facts.textContent = ctx.when(item.at)
                card.append(top, facts)
                card.onclick = () => void play(item.path)
                return card
            }

            /*
             * A panel with nothing in it shows what it can play, as a gallery from the top left,
             * the way the reader shows its pages: Open first, then what played last, newest first,
             * each a click from playing again. A failure is said over the same gallery, because
             * the gallery is still what to do next.
             */
            function showEmpty(message?: string): void {
                playing = false
                handle.setTitle(null)
                open.hidden = true

                const gallery = document.createElement('div')
                gallery.className = 'dya-grid'
                const head: HTMLElement[] = []
                if (message) {
                    const line = document.createElement('span')
                    line.className = 'dya-empty dya-text--danger'
                    line.textContent = message
                    head.push(line)
                }
                head.push(tile(glyph('folder'), 'Open', () => void pick()))
                gallery.replaceChildren(...head)
                stage.classList.add('player-stage--empty')
                stage.replaceChildren(gallery)

                void (ctx.invoke('recent') as Promise<Recent[]>).then((recent) => {
                    if (disposed || playing || !gallery.isConnected) return
                    gallery.replaceChildren(...head, ...recent.map(recentTile))
                })
            }

            async function play(path: string): Promise<void> {
                if (busy) return
                busy = true
                try {
                    const media = (await ctx.invoke('media', path)) as Media
                    if (disposed) return
                    const element = document.createElement(media.kind === 'video' ? 'video' : 'audio')
                    element.controls = true
                    element.autoplay = true
                    element.src = media.src
                    element.onerror = () => showEmpty('Cannot play that file')
                    playing = true
                    handle.setTitle(media.name)
                    open.hidden = false
                    stage.classList.remove('player-stage--empty')
                    stage.replaceChildren(element)
                } catch {
                    showEmpty('Cannot open that file')
                } finally {
                    busy = false
                }
            }

            async function pick(): Promise<void> {
                const path = (await ctx.invoke('pick')) as string | null
                if (path) await play(path)
            }

            const open = openButton()
            handle.toolbar.append(open)
            showEmpty()

            instances.set(handle.instanceId, { idle: () => !playing && !busy, play })
            const queued = waiting.get(handle.instanceId) ?? waiting.get('')
            if (queued) {
                waiting.delete(handle.instanceId)
                waiting.delete('')
                void play(queued)
            }

            return () => {
                disposed = true
                instances.delete(handle.instanceId)
                container.replaceChildren()
            }
        }
    )
}
