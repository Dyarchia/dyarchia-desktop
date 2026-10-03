import { glyph, injectStyles, tips } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'
import type { WebviewTag } from 'electron'

interface Bookmark {
    url: string
    title: string
    folder?: string
}

interface Library {
    home: string
    folders: string[]
    bookmarks: Bookmark[]
}

const PARTITION = 'dyarchia-browser'
const DEFAULT_HOME = 'https://duckduckgo.com/'
const SEARCH = 'https://duckduckgo.com/?q='
const EMPTY: Library = { home: '', folders: [], bookmarks: [] }

const svg = (body: string): string =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

/*
 * The panel's mark, one of a set in black and white and nothing else, each a thing of Sparta:
 * a scytale, the rod a Spartan wrapped a message round so only its twin could read it.
 * Solid shapes rather than hairlines, so it reads as a key at 18px.
 */
const GLOBE_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2.6 21.4 21.4 2.6" stroke="#9499a3" stroke-width="2.6" stroke-linecap="round"/><path d="M2.51 16.40 L8.66 20.43 L9.86 19.23 L3.71 15.20Z" fill="#eceef2"/><path d="M4.28 16.89 L5.47 17.68 M6.48 18.36 L7.67 19.16" stroke="#0a0a0b" stroke-width=".7" stroke-linecap="round"/><path d="M5.91 13.00 L12.06 17.03 L13.26 15.83 L7.11 11.80Z" fill="#eceef2"/><path d="M7.68 13.49 L8.87 14.28 M9.88 14.96 L11.07 15.76" stroke="#0a0a0b" stroke-width=".7" stroke-linecap="round"/><path d="M9.31 9.60 L15.46 13.63 L16.66 12.43 L10.51 8.40Z" fill="#eceef2"/><path d="M11.08 10.09 L12.27 10.88 M13.28 11.56 L14.47 12.36" stroke="#0a0a0b" stroke-width=".7" stroke-linecap="round"/><path d="M12.71 6.20 L18.86 10.23 L20.06 9.03 L13.91 5.00Z" fill="#eceef2"/><path d="M14.48 6.69 L15.67 7.48 M16.68 8.16 L17.87 8.96" stroke="#0a0a0b" stroke-width=".7" stroke-linecap="round"/><path d="M19.43 9.38 C22.26 10.79 24.10 8.39 27.21 8.96" fill="none" stroke="#eceef2" stroke-width="2.2" stroke-linecap="round"/></svg>'
const BACK_ICON = svg('<path d="m15 18-6-6 6-6"/>')
const FORWARD_ICON = svg('<path d="m9 18 6-6-6-6"/>')
const RELOAD_ICON = glyph('refresh')
const STOP_ICON = glyph('close')
const STAR_ICON = svg(
    '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>'
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
    background: var(--dya-panel);
}
.brw-fail[hidden] {
    display: none;
}
.brw-marks > .dya-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-1);
}
.brw-marks > .dya-chip > svg {
    width: 14px;
    height: 14px;
    flex: none;
}
.brw-menu {
    position-area: bottom span-right;
    margin: var(--dya-space-1) 0 0;
    min-width: 12rem;
    max-width: 24rem;
}
.brw-library {
    overflow-y: auto;
}
.brw-library > .dya-stack {
    gap: var(--dya-space-2);
}
.brw-library .dya-join {
    display: flex;
    width: 100%;
}
.brw-library .dya-join > .dya-select > .dya-field {
    width: 10rem;
}
.brw-head {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.brw-folder {
    padding-inline-start: calc(18px + var(--dya-space-2));
}
`

/*
 * What was typed, as somewhere to go. A scheme is taken at its word; something shaped like a host
 * gets https in front of it; anything else is a question, and the question goes to the search
 * the home page belongs to.
 */
function destination(typed: string, home: string): string {
    const text = typed.trim()
    if (!text) return home
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

/*
 * The browser a person last worked in, so a palette command acts on the page they were looking at.
 */
let focused: WebviewTag | null = null

export function activate(ctx: PluginContext): void {
    ctx.registerCommand({
        id: 'browser.external',
        title: 'Open outside',
        icon: glyph('open'),
        run: async () => {
            let url = ''
            try {
                url = focused?.getURL() ?? ''
            } catch {}
            if (url) await ctx.invoke('external', url)
        }
    })

    ctx.registerCommand({
        id: 'browser.new',
        title: 'New tab',
        icon: GLOBE_ICON,
        run: async () => {
            await ctx.shell.show('browser', { fresh: true })
        }
    })

    ctx.registerPanel(
        {
            id: 'browser',
            title: 'Browser',
            icon: GLOBE_ICON,
            duplicable: true,
            keepAlive: true
        },
        (container, handle) => {
            injectStyles(ctx.pluginId, STYLES)

            const root = el('div', 'brw')
            const tipHolder = el('div')
            const withTip = tips(tipHolder)

            function key(icon: string, label: string, onClick: () => void): HTMLButtonElement {
                const button = el('button', 'dya-key')
                button.type = 'button'
                button.innerHTML = icon
                button.setAttribute('aria-label', label)
                withTip(button, label)
                button.addEventListener('click', onClick)
                return button
            }

            /*
             * One strip: the three keys that move through the history, the address, the star that
             * keeps it, and the book that opens what is kept. Home is an empty address and Enter;
             * opening the page outside is a palette command.
             */
            const bar = el('div', 'dya-bar brw-bar')
            const strip = el('div', 'dya-join')
            const back = key(BACK_ICON, 'Back', () => view.goBack())
            const forward = key(FORWARD_ICON, 'Forward', () => view.goForward())
            const reload = key(RELOAD_ICON, 'Reload', () => (loading ? view.stop() : view.reload()))
            const address = el('input', 'dya-field')
            address.type = 'text'
            address.setAttribute('aria-label', 'Address')
            address.placeholder = 'Search or address'
            const star = key(STAR_ICON, 'Bookmark', () => void toggleBookmark())
            const shelf = key(glyph('book'), 'Bookmarks', () => openLibrary())
            strip.append(back, forward, reload, address, star, shelf)
            bar.append(strip)

            const marks = el('div', 'brw-marks')
            marks.hidden = true

            const stage = el('div', 'brw-view')
            try {
                localStorage.removeItem(`dyarchia-browser:${handle.instanceId}`)
            } catch {}
            const view = document.createElement('webview') as WebviewTag
            view.setAttribute('partition', PARTITION)
            view.setAttribute('allowpopups', '')
            root.addEventListener('focusin', () => (focused = view))
            root.addEventListener('pointerdown', () => (focused = view))
            focused = view

            const fail = el('div', 'dya-empty brw-fail')
            fail.hidden = true
            stage.append(view, fail)

            /*
             * What is kept, in a sheet over the panel: the home page, a new folder, and every
             * bookmark with its name, its folder and its delete, loose ones first and then each
             * folder under its own name. Names are fields and commit on Enter or on leaving them.
             */
            const scrim = el('div', 'dya-scrim')
            scrim.hidden = true
            const sheet = el('aside', 'dya-sheet dya-sheet--modal dya-pane brw-library')
            sheet.setAttribute('role', 'dialog')
            sheet.setAttribute('aria-modal', 'true')
            sheet.setAttribute('aria-label', 'Bookmarks')
            sheet.hidden = true

            root.append(bar, marks, stage, scrim, sheet, tipHolder)
            container.append(root)

            let loading = false
            let ready = false
            let library: Library = EMPTY
            let started = false
            const home = (): string => library.home || DEFAULT_HOME

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
                const marked = library.bookmarks.some((entry) => entry.url === url)
                star.classList.toggle('dya-key--active', marked)
                const label = marked ? 'Unbookmark' : 'Bookmark'
                star.setAttribute('aria-label', label)
                withTip(star, label)
                handle.setTitle(view.getTitle() || hostOf(url) || null)
            }

            function setLoading(next: boolean): void {
                loading = next
                reload.innerHTML = next ? STOP_ICON : RELOAD_ICON
                reload.setAttribute('aria-label', next ? 'Stop' : 'Reload')
                withTip(reload, next ? 'Stop' : 'Reload')
            }

            /*
             * Bookmarks are keys, because each one goes somewhere when pressed, and they carry the
             * name they were given. Folders come first, each a key that opens its bookmarks as a
             * menu under it; the loose bookmarks follow. The row is absent until there is something
             * in it: a strip announcing that nothing is bookmarked is a strip of nothing.
             */
            const menus: HTMLElement[] = []

            function drawMarks(): void {
                for (const menu of menus.splice(0)) menu.remove()
                const folders = library.folders.flatMap((name, index) => {
                    const inside = library.bookmarks.filter((entry) => entry.folder === name)
                    if (!inside.length) return []
                    const chip = el('button', 'dya-chip')
                    chip.type = 'button'
                    chip.innerHTML = glyph('folder')
                    chip.append(name)
                    const anchor = `--brw-folder-${handle.instanceId.replace(/\W/g, '')}-${index}`
                    chip.style.setProperty('anchor-name', anchor)
                    const menu = el('div', 'dya-menu brw-menu')
                    menu.popover = 'auto'
                    menu.style.setProperty('position-anchor', anchor)
                    for (const entry of inside) {
                        const item = el('button', 'dya-menu__item', entry.title)
                        item.type = 'button'
                        item.addEventListener('click', () => {
                            menu.hidePopover()
                            go(entry.url)
                        })
                        menu.append(item)
                    }
                    chip.popoverTargetElement = menu
                    menus.push(menu)
                    tipHolder.append(menu)
                    return [chip]
                })
                const loose = library.bookmarks
                    .filter((entry) => !entry.folder)
                    .map((entry) => {
                        const mark = el('button', 'dya-chip', entry.title)
                        mark.type = 'button'
                        mark.addEventListener('click', () => go(entry.url))
                        return mark
                    })
                marks.replaceChildren(...folders, ...loose)
                marks.hidden = folders.length + loose.length === 0
            }

            function receive(next: Library): void {
                library = next
                drawMarks()
                if (!sheet.hidden) drawLibrary()
                sync()
            }

            async function toggleBookmark(): Promise<void> {
                if (!ready) return
                receive(
                    (await ctx.invoke('toggle', {
                        url: view.getURL(),
                        title: view.getTitle()
                    })) as Library
                )
            }

            function send(channel: string, ...args: unknown[]): void {
                void ctx.invoke(channel, ...args).then((next) => receive(next as Library))
            }

            /*
             * A name field keeps what was typed when Enter is pressed or the field is left, and
             * Escape puts the old name back.
             */
            function nameField(value: string, label: string, commit: (next: string) => void): HTMLInputElement {
                const field = el('input', 'dya-field')
                field.type = 'text'
                field.value = value
                field.spellcheck = false
                field.setAttribute('aria-label', label)
                const keep = (): void => {
                    const next = field.value.trim()
                    if (next && next !== value) commit(next)
                    else field.value = value
                }
                field.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') field.blur()
                    if (event.key === 'Escape') {
                        event.stopPropagation()
                        field.value = value
                        field.blur()
                    }
                })
                field.addEventListener('blur', keep)
                return field
            }

            function folderSelect(entry: Bookmark): HTMLElement {
                const wrap = el('span', 'dya-select')
                const select = el('select', 'dya-field')
                select.setAttribute('aria-label', `Folder of ${entry.title}`)
                const shown = el('button')
                shown.type = 'button'
                shown.append(document.createElement('selectedcontent'))
                select.append(shown)
                for (const [value, text] of [['', 'No folder'], ...library.folders.map((name) => [name, name])]) {
                    const option = el('option', undefined, text)
                    option.value = value
                    option.selected = (entry.folder ?? '') === value
                    select.append(option)
                }
                select.addEventListener('change', () => send('move', { url: entry.url, folder: select.value }))
                wrap.append(select)
                return wrap
            }

            function bookmarkRow(entry: Bookmark): HTMLElement {
                const row = el('div', 'dya-join')
                row.append(
                    nameField(entry.title, `Name of ${entry.url}`, (title) => send('rename', { url: entry.url, title })),
                    ...(library.folders.length ? [folderSelect(entry)] : []),
                    key(glyph('delete'), 'Delete', () => send('remove', entry.url))
                )
                row.lastElementChild?.classList.add('dya-key--danger')
                return row
            }

            function drawLibrary(): void {
                const close = key(glyph('close'), 'Close', closeLibrary)
                const end = el('div', 'dya-sheet__end')
                end.append(close)
                const head = el('div', 'dya-sheet__head')
                head.append(el('span', 'dya-title', 'Bookmarks'), end)

                const form = el('div', 'dya-form')
                const homeRow = el('div', 'dya-join')
                const homeField = el('input', 'dya-field')
                homeField.type = 'text'
                homeField.value = library.home
                homeField.placeholder = DEFAULT_HOME
                homeField.spellcheck = false
                homeField.setAttribute('aria-label', 'Home page')
                const keepHome = (): void => {
                    const typed = homeField.value.trim()
                    const next = typed ? destination(typed, DEFAULT_HOME) : ''
                    if (next !== library.home) send('setHome', next)
                }
                homeField.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') homeField.blur()
                })
                homeField.addEventListener('blur', keepHome)
                const current = key(glyph('pin'), 'This page', () => {
                    if (ready) send('setHome', view.getURL())
                })
                homeRow.append(homeField, current)

                const folderRow = el('div', 'dya-join')
                const folderField = el('input', 'dya-field')
                folderField.type = 'text'
                folderField.placeholder = 'Name'
                folderField.setAttribute('aria-label', 'New folder')
                const addFolder = (): void => {
                    const name = folderField.value.trim()
                    if (name) send('addFolder', name)
                    folderField.value = ''
                }
                folderField.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') addFolder()
                })
                folderRow.append(folderField, key(glyph('add'), 'New folder', addFolder))

                form.append(el('span', 'dya-label', 'Home'), homeRow, el('span', 'dya-label', 'New folder'), folderRow)

                const list = el('div', 'dya-stack')
                for (const entry of library.bookmarks.filter((each) => !each.folder)) list.append(bookmarkRow(entry))
                for (const name of library.folders) {
                    const folderHead = el('div', 'dya-join')
                    folderHead.append(
                        nameField(name, `Name of folder ${name}`, (to) => send('renameFolder', name, to)),
                        key(glyph('delete'), 'Delete folder', () => send('removeFolder', name))
                    )
                    folderHead.lastElementChild?.classList.add('dya-key--danger')
                    const mark = el('span', 'dya-glyph')
                    mark.innerHTML = glyph('folder')
                    const headRow = el('div', 'brw-head')
                    headRow.append(mark, folderHead)
                    const inside = el('div', 'dya-stack brw-folder')
                    for (const entry of library.bookmarks.filter((each) => each.folder === name)) {
                        inside.append(bookmarkRow(entry))
                    }
                    list.append(headRow, inside)
                }

                sheet.replaceChildren(head, form, ...(list.childElementCount ? [list] : []))
            }

            let opener: HTMLElement | null = null

            function openLibrary(): void {
                if (!sheet.hidden) return
                opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
                drawLibrary()
                bar.inert = true
                marks.inert = true
                stage.inert = true
                scrim.hidden = false
                sheet.hidden = false
                sheet.querySelector<HTMLElement>('input')?.focus()
            }

            function closeLibrary(): void {
                if (sheet.hidden) return
                sheet.hidden = true
                scrim.hidden = true
                bar.inert = false
                marks.inert = false
                stage.inert = false
                opener?.focus()
                opener = null
            }

            scrim.addEventListener('click', closeLibrary)
            sheet.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape' || event.defaultPrevented) return
                event.preventDefault()
                closeLibrary()
            })

            address.addEventListener('focus', () => address.select())
            address.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    go(destination(address.value, home()))
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
                const retry = el('button', 'dya-button', 'Retry')
                retry.type = 'button'
                retry.addEventListener('click', () => go(event.validatedURL))
                const actions = el('div', 'dya-empty__actions')
                actions.append(retry)
                fail.replaceChildren(
                    el('span', 'dya-title', hostOf(event.validatedURL)),
                    el('span', 'dya-mono', event.errorDescription || String(event.errorCode)),
                    actions
                )
                fail.hidden = false
            })

            const offMarks = ctx.on('library', (next) => receive(next as Library))

            /*
             * The first page waits for the library, because the home page is in it.
             */
            function start(): void {
                if (started) return
                started = true
                view.src = home()
                address.value = home()
            }
            void ctx
                .invoke('library')
                .then((next) => {
                    library = next as Library
                    drawMarks()
                })
                .catch(() => undefined)
                .finally(start)

            back.disabled = true
            forward.disabled = true

            return () => {
                if (focused === view) focused = null
                offMarks()
                for (const menu of menus.splice(0)) menu.remove()
                container.replaceChildren()
            }
        }
    )
}
