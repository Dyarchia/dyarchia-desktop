import { glyph, injectStyles, tips } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'
import { CONVERTIBLE, MIME_TYPES } from './media.js'

interface Media {
    path: string
    name: string
    kind: 'audio' | 'video'
    src: string
    convert: boolean
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
.player-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: var(--dya-space-4);
    overflow-y: auto;
}
.player-stage audio,
.player-stage video {
    color-scheme: var(--dya-scheme);
}
/*
 * The video takes the whole stage and the picture is fitted inside it: contain scales it up or
 * down to the largest size that keeps its proportion, and whatever the panel's shape leaves over
 * is bare glass on the two short sides rather than a stretched frame. Audio has no picture, so its
 * controls stand at the top left, where the gallery's first tile stood, never an island mid-pane.
 */
.player-stage--video {
    padding: var(--dya-space-3);
    overflow: hidden;
}
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
    width: min(420px, 100%);
}
.player-wait {
    display: flex;
    align-items: center;
    gap: var(--dya-space-3);
}
`

export function activate(ctx: PluginContext): void {
    const opener = (extensions: string[]): void =>
        ctx.registerOpener(
            {
                panelId: 'player',
                extensions,
                route: () => [...instances.entries()].find(([, instance]) => instance.idle())?.[0] ?? null
            },
            async (request) => {
                const target = request.instanceId ?? [...instances.keys()][0]
                const instance = target ? instances.get(target) : undefined
                if (instance) await instance.play(request.path)
                else waiting.set(target ?? '', request.path)
            }
        )
    opener(Object.keys(MIME_TYPES))
    const convertible = ctx.invoke('ffmpeg') as Promise<boolean>
    void convertible.then((has) => {
        if (has) opener(CONVERTIBLE)
    })

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
            const stage = document.createElement('div')
            stage.className = 'player-stage'
            const tipHolder = document.createElement('div')
            const withTip = tips(tipHolder)
            root.append(stage, tipHolder)
            container.appendChild(root)

            let busy = false
            let playing = false
            let disposed = false
            let gallery: HTMLElement | null = null
            let failure: string | undefined

            /*
             * What is playing is the tab's title, and the one key in the tab row takes the panel
             * back to its gallery. Open lives in the gallery and in the palette.
             */
            const back = document.createElement('button')
            back.type = 'button'
            back.className = 'dya-key'
            back.innerHTML = glyph('grid')
            back.setAttribute('aria-label', 'Library')
            withTip(back, 'Library')
            back.onclick = () => {
                void ctx.invoke('release', handle.instanceId)
                showEmpty()
            }
            back.hidden = true
            handle.toolbar.append(back)

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

            /*
             * A panel with nothing in it shows what it can play, as a gallery from the top left:
             * Open, and nothing it has played: the player keeps no history.
             * A failure is said over the same gallery, because the gallery is still what to do.
             */
            function paintGallery(): void {
                if (!gallery || disposed || playing) return
                const cards: HTMLElement[] = []
                if (failure) {
                    const line = document.createElement('span')
                    line.className = 'dya-empty dya-text--danger'
                    line.textContent = failure
                    cards.push(line)
                }
                cards.push(tile(glyph('folder'), 'Open', () => void pick()))
                gallery.replaceChildren(...cards)
            }

            function showEmpty(message?: string): void {
                playing = false
                failure = message
                handle.setTitle(null)
                back.hidden = true
                gallery = document.createElement('div')
                gallery.className = 'dya-grid'
                stage.className = 'player-stage'
                stage.replaceChildren(gallery)
                paintGallery()
            }

            /*
             * A file Chromium cannot play is converted first: the ring fills as FFmpeg goes, the tab
             * already carries the name, and the converted copy plays when it is whole. A file that
             * looked playable and is not gets the same second chance on its first error.
             */
            async function convert(media: Media): Promise<Media> {
                const ring = document.createElement('span')
                ring.className = 'dya-ring dya-ring--current'
                ring.style.setProperty('--dya-ring-n', '20')
                const figure = document.createElement('span')
                figure.className = 'dya-meta'
                figure.textContent = '0%'
                const wait = document.createElement('div')
                wait.className = 'player-wait'
                wait.append(ring, figure)
                stage.className = 'player-stage'
                stage.replaceChildren(wait)
                handle.setTitle(media.name)
                back.hidden = false
                const off = ctx.on('progress', (instance: unknown, percent: unknown) => {
                    if (instance !== handle.instanceId) return
                    ring.style.setProperty('--dya-ring-done', String(Math.floor(Number(percent) / 5)))
                    figure.textContent = `${Number(percent)}%`
                })
                try {
                    return (await ctx.invoke('prepare', media.path, handle.instanceId)) as Media
                } finally {
                    off()
                }
            }

            function mount(media: Media, retry: boolean): void {
                const element = document.createElement(media.kind === 'video' ? 'video' : 'audio')
                element.controls = true
                element.autoplay = true
                element.src = media.src
                element.onerror = () => {
                    if (!retry || disposed) return showEmpty('Cannot play')
                    void convertible.then(async (has) => {
                        if (!has) return showEmpty('Cannot play')
                        try {
                            mount(await convert(media), false)
                        } catch (error) {
                            if (!disposed && (error as Error).message !== 'Stopped') showEmpty('Cannot play')
                        }
                    })
                }
                playing = true
                gallery = null
                handle.setTitle(media.name)
                back.hidden = false
                stage.className = media.kind === 'video' ? 'player-stage player-stage--video' : 'player-stage'
                stage.replaceChildren(element)
            }

            async function play(path: string): Promise<void> {
                if (busy) return
                busy = true
                try {
                    await ctx.invoke('release', handle.instanceId)
                    let media = (await ctx.invoke('media', path)) as Media
                    if (disposed) return
                    const converted = media.convert
                    if (converted) {
                        playing = true
                        gallery = null
                        media = await convert(media)
                        if (disposed) return
                    }
                    mount(media, !converted)
                } catch (error) {
                    if (!disposed && (error as Error).message !== 'Stopped') showEmpty('Cannot open')
                } finally {
                    busy = false
                }
            }

            async function pick(): Promise<void> {
                const path = (await ctx.invoke('pick')) as string | null
                if (path) await play(path)
            }

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
                void ctx.invoke('release', handle.instanceId)
                instances.delete(handle.instanceId)
                container.replaceChildren()
            }
        }
    )
}
