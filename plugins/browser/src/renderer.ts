import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'
import type { WebviewTag } from 'electron'

interface Bookmark {
    url: string
    title: string
}

const PARTITION = 'persist:dyarchia-browser'
const HOME = 'https://www.google.com/'
const SEARCH = 'https://www.google.com/search?q='

const svg = (body: string): string =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const GLOBE_ICON = svg(
    '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
)
const BACK_ICON = svg('<path d="m15 18-6-6 6-6"/>')
const FORWARD_ICON = svg('<path d="m9 18 6-6-6-6"/>')
const RELOAD_ICON = svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>')
const STOP_ICON = svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>')
const HOME_ICON = svg('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>')
const STAR_ICON = svg(
    '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>'
)
const EXTERNAL_ICON = svg(
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
)

const STYLES = `
.brw {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
}
.brw-bar {
    flex: none;
    min-height: 0;
    padding: var(--dya-space-2) var(--dya-space-3);
}
.brw-address {
    flex: 1;
    min-width: 0;
}
.brw-marks {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--dya-space-2);
    padding: 0 var(--dya-space-3) var(--dya-space-2);
}
.brw-marks[hidden] {
    display: none;
}
.brw-view {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
}
.brw-view webview {
    flex: 1;
    border: none;
}
.brw-fail {
    position: absolute;
    inset: 0;
    background: var(--dya-chassis);
}
.brw-fail[hidden] {
    display: none;
}
`

/*
 * What was typed, as somewhere to go. A scheme is taken at its word; something shaped like a host
 * gets https in front of it; anything else is a question, and the question goes to the search
 * the home page belongs to.
 */
function destination(typed: string): string {
    const text = typed.trim()
    if (!text) return HOME
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text
    if (!/\s/.test(text) && /^[^/]+\.[a-z]{2,}(?::\d+)?(\/.*)?$/i.test(text)) return `https://${text}`
    if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return `http://${text}`
    return SEARCH + encodeURIComponent(text)
}

function hostOf(url: string): string {
    try {
        return new URL(url).host.replace(/^www\./, '')
    } catch {
        return url
    }
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        {
            id: 'browser',
            title: 'Browser',
            icon: GLOBE_ICON,
            note: 'Browse the web in a panel, with bookmarks and a way out to your own browser.',
            duplicable: true,
            keepAlive: true
        },
        (container, handle) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = el('div', 'brw')
            const tips = el('div')
            tips.style.display = 'contents'
            let tipSeq = 0
            const tipId = `brw-${handle.instanceId.replace(/[^\w-]/g, '')}`

            function key(icon: string, label: string, onClick: () => void): HTMLButtonElement {
                const button = el('button', 'dya-key')
                button.type = 'button'
                button.innerHTML = icon
                button.setAttribute('aria-label', label)
                const tip = el('div', 'dya-tip', label)
                tip.id = `${tipId}-${++tipSeq}`
                tip.setAttribute('popover', 'hint')
                tips.append(tip)
                button.setAttribute('interestfor', tip.id)
                button.addEventListener('click', onClick)
                return button
            }

            const bar = el('div', 'dya-bar brw-bar')
            const back = key(BACK_ICON, 'Back', () => view.goBack())
            const forward = key(FORWARD_ICON, 'Forward', () => view.goForward())
            const reload = key(RELOAD_ICON, 'Reload', () => (loading ? view.stop() : view.reload()))
            const home = key(HOME_ICON, 'Home', () => go(HOME))
            const address = el('input', 'dya-field brw-address')
            address.type = 'text'
            address.spellcheck = false
            address.setAttribute('aria-label', 'Address')
            address.placeholder = 'Search Google or type an address'
            const star = key(STAR_ICON, 'Bookmark this page', () => void toggleBookmark())
            const external = key(EXTERNAL_ICON, 'Open in your browser', () => {
                if (ready) void ctx.invoke('external', view.getURL())
            })
            bar.append(back, forward, reload, home, address, star, external)

            const marks = el('div', 'brw-marks')
            marks.hidden = true

            const stage = el('div', 'brw-view')
            const remembered = `dyarchia-browser:${handle.instanceId}`
            let start = HOME
            try {
                start = localStorage.getItem(remembered) ?? HOME
            } catch {}
            const view = document.createElement('webview') as WebviewTag
            view.setAttribute('partition', PARTITION)
            view.setAttribute('allowpopups', '')
            view.src = start

            const fail = el('div', 'dya-empty brw-fail')
            fail.hidden = true
            stage.append(view, fail)

            root.append(bar, marks, stage, tips)
            container.append(root)

            let loading = false
            let ready = false
            let bookmarks: Bookmark[] = []

            function go(url: string): void {
                fail.hidden = true
                void view.loadURL(url)
            }

            /*
             * A webview answers nothing about its page until its first dom-ready, and asking
             * throws, so every read waits for that.
             */
            function sync(): void {
                if (!ready) return
                const url = view.getURL()
                if (document.activeElement !== address) address.value = url
                back.disabled = !view.canGoBack()
                forward.disabled = !view.canGoForward()
                const marked = bookmarks.some((entry) => entry.url === url)
                star.classList.toggle('dya-key--active', marked)
                star.setAttribute('aria-label', marked ? 'Remove this bookmark' : 'Bookmark this page')
                handle.setTitle(hostOf(url) || null)
                try {
                    localStorage.setItem(remembered, url)
                } catch {}
            }

            function setLoading(next: boolean): void {
                loading = next
                reload.innerHTML = next ? STOP_ICON : RELOAD_ICON
                reload.setAttribute('aria-label', next ? 'Stop' : 'Reload')
            }

            /*
             * Bookmarks are keys, because each one goes somewhere when pressed, and they carry
             * the title the page gave itself when it was saved. The row is absent until there is
             * something in it: a strip announcing that nothing is bookmarked is a strip of nothing.
             */
            function drawMarks(): void {
                marks.replaceChildren(
                    ...bookmarks.map((entry) => {
                        const mark = el('button', 'dya-chip', entry.title)
                        mark.type = 'button'
                        mark.addEventListener('click', () => go(entry.url))
                        return mark
                    })
                )
                marks.hidden = bookmarks.length === 0
            }

            async function toggleBookmark(): Promise<void> {
                if (!ready) return
                bookmarks = (await ctx.invoke('toggle', {
                    url: view.getURL(),
                    title: view.getTitle()
                })) as Bookmark[]
                drawMarks()
                sync()
            }

            address.addEventListener('focus', () => address.select())
            address.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    go(destination(address.value))
                    view.focus()
                } else if (event.key === 'Escape') {
                    address.value = view.getURL()
                    address.blur()
                }
            })

            root.addEventListener('keydown', (event) => {
                if (event.ctrlKey && event.key.toLowerCase() === 'l') {
                    event.preventDefault()
                    address.focus()
                }
            })

            view.addEventListener('dom-ready', () => {
                ready = true
                sync()
            })
            view.addEventListener('did-start-loading', () => {
                fail.hidden = true
                setLoading(true)
            })
            view.addEventListener('did-stop-loading', () => {
                setLoading(false)
                sync()
            })
            view.addEventListener('did-navigate', sync)
            view.addEventListener('did-navigate-in-page', sync)
            view.addEventListener('page-title-updated', sync)

            /*
             * An error the page could not paint itself. A navigation that was replaced by another
             * reports -3 and is not a failure, so it is left alone.
             */
            view.addEventListener('did-fail-load', (event) => {
                if (!event.isMainFrame || event.errorCode === -3) return
                const retry = el('button', 'dya-button', 'Try again')
                retry.type = 'button'
                retry.addEventListener('click', () => go(event.validatedURL))
                const actions = el('div', 'dya-empty__actions')
                actions.append(retry)
                fail.replaceChildren(
                    el('span', 'dya-title', `${hostOf(event.validatedURL)} did not answer`),
                    el('span', 'dya-mono', event.errorDescription),
                    actions
                )
                fail.hidden = false
            })

            const offMarks = ctx.on('bookmarks', (next) => {
                bookmarks = next as Bookmark[]
                drawMarks()
                sync()
            })
            void ctx.invoke('bookmarks').then((next) => {
                bookmarks = next as Bookmark[]
                drawMarks()
            })

            back.disabled = true
            forward.disabled = true
            address.value = start

            return () => {
                offMarks()
                container.replaceChildren()
            }
        }
    )
}
