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

interface Offer {
    host: string
    username: string
    update: boolean
}

interface Kept {
    origin: string
    host: string
    username: string
}

const PARTITION = 'persist:dyarchia-browser'
const DEFAULT_HOME = 'https://duckduckgo.com/'
const SEARCH = 'https://duckduckgo.com/?q='
const EMPTY: Library = { home: '', folders: [], bookmarks: [] }

const svg = (body: string): string =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

/*
 * The panel's mark, one of a set in black and white and nothing else, each a thing of Sparta:
 * a scytale, the rod a Spartan wrapped a message round so only its twin could read it.
 * Solid shapes rather than hairlines, so it reads as a key at 15px.
 */
const GLOBE_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2.6 21.4 21.4 2.6" stroke-width="2.6" stroke-linecap="round" style="stroke:var(--dya-text-muted)"/><path d="M2.51 16.40 L8.66 20.43 L9.86 19.23 L3.71 15.20Z" style="fill:var(--dya-text)"/><path d="M4.28 16.89 L5.47 17.68 M6.48 18.36 L7.67 19.16" stroke-width=".7" stroke-linecap="round" style="stroke:var(--dya-on-accent)"/><path d="M5.91 13.00 L12.06 17.03 L13.26 15.83 L7.11 11.80Z" style="fill:var(--dya-text)"/><path d="M7.68 13.49 L8.87 14.28 M9.88 14.96 L11.07 15.76" stroke-width=".7" stroke-linecap="round" style="stroke:var(--dya-on-accent)"/><path d="M9.31 9.60 L15.46 13.63 L16.66 12.43 L10.51 8.40Z" style="fill:var(--dya-text)"/><path d="M11.08 10.09 L12.27 10.88 M13.28 11.56 L14.47 12.36" stroke-width=".7" stroke-linecap="round" style="stroke:var(--dya-on-accent)"/><path d="M12.71 6.20 L18.86 10.23 L20.06 9.03 L13.91 5.00Z" style="fill:var(--dya-text)"/><path d="M14.48 6.69 L15.67 7.48 M16.68 8.16 L17.87 8.96" stroke-width=".7" stroke-linecap="round" style="stroke:var(--dya-on-accent)"/><path d="M19.43 9.38 C22.26 10.79 24.10 8.39 27.21 8.96" fill="none" stroke-width="2.2" stroke-linecap="round" style="stroke:var(--dya-text)"/></svg>'
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
.brw-library > .dya-table {
    width: 100%;
}
.brw-library > .dya-table td:first-child {
    padding-inline-start: 0;
}
.brw-library > .dya-table td:last-child {
    padding-inline-end: 0;
    text-align: end;
}
.brw-offer {
    flex: none;
    padding-block-start: 0;
}
.brw-offer[hidden] {
    display: none;
}
.brw-offer > .dya-bar__group {
    margin-inline-start: auto;
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
 * Open outside exists only while some browser holds a page: with none it would have nothing to open.
 */
let focused: WebviewTag | null = null
const views = new Set<WebviewTag>()
let dropOutside: (() => void) | null = null

export function activate(ctx: PluginContext): void {
    const canSave = ctx.invoke('canSave') as Promise<boolean>
    ctx.on('notice', (action: unknown) => {
        const reveal = (action as { reveal?: unknown } | null)?.reveal
        if (typeof reveal === 'string') void ctx.shell.reveal(reveal)
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
            const popovers = el('div')
            popovers.style.display = 'contents'
            const withTip = tips(popovers)

            function key(icon: string, label: string, onClick: () => void): HTMLButtonElement {
                const button = el('button', 'dya-key')
                button.type = 'button'
                button.innerHTML = icon
                button.setAttribute('aria-label', label)
                button.addEventListener('click', onClick)
                return button
            }

            /*
             * One strip: forward and reload, the address, the star that keeps it, and the book that
             * opens what is kept; back and home are the header's, as in every panel. Opening the page outside is a
             * palette command. A page that plays a video FFmpeg can
             * read adds a save key to the strip; while it saves, the ring beside the strip fills.
             */
            const bar = el('div', 'dya-bar brw-bar')
            const strip = el('div', 'dya-join')
            const forward = key(FORWARD_ICON, 'Forward', () => view.goForward())
            let failed = ''
            const reload = key(RELOAD_ICON, 'Reload', () => {
                if (loading) view.stop()
                else if (!fail.hidden && failed) go(failed)
                else view.reload()
            })
            const goHome = (): void => go(home())
            handle.navigate({ back: null, home: goHome })
            const address = el('input', 'dya-field')
            address.type = 'text'
            address.setAttribute('aria-label', 'Address')
            address.placeholder = 'Search or address'
            const star = key(STAR_ICON, 'Bookmark', () => void toggleBookmark())
            const shelf = key(glyph('book'), 'Library', () => openLibrary())
            const anchor = `--brw-sign-${handle.instanceId.replace(/\W/g, '')}`
            const signIn = key(glyph('key'), 'Sign in', () => void signInNow())
            signIn.hidden = true
            withTip(signIn, 'Sign in')
            signIn.style.setProperty('anchor-name', anchor)
            const accounts = el('div', 'dya-menu brw-menu')
            accounts.popover = 'auto'
            accounts.style.setProperty('position-anchor', anchor)
            let usernames: string[] = []
            let guest = -1
            const save = key(glyph('extract'), 'Save video', () => void ctx.invoke('save', guest))
            save.hidden = true
            const saving = el('span', 'dya-ring dya-ring--busy')
            saving.hidden = true
            strip.append(forward, reload, address, signIn, save, star, shelf)
            bar.append(strip, saving)
            const offVideos = ctx.on('videos', (id: unknown, count: unknown) => {
                if (id !== guest) return
                void canSave.then((has) => (save.hidden = !has || Number(count) === 0))
            })
            const offSaving = ctx.on('saving', (id: unknown, percent: unknown) => {
                if (id !== guest) return
                save.disabled = true
                saving.hidden = false
                saving.className = percent === null ? 'dya-ring dya-ring--busy' : 'dya-ring dya-ring--current'
                saving.style.setProperty('--dya-ring-n', percent === null ? '12' : '20')
                saving.style.setProperty('--dya-ring-done', String(Math.floor(Number(percent ?? 0) / 5)))
            })
            const offSaved = ctx.on('saved', (id: unknown) => {
                if (id !== guest) return
                save.disabled = false
                saving.hidden = true
            })

            const marks = el('div', 'brw-marks')
            marks.hidden = true

            /*
             * After a form with a password is sent, a strip under the address offers to keep it:
             * the name and the site it would be kept for, Save, Never for this site, and the X that
             * lets it go this once. It stays across the page that follows the sign-in until it is
             * answered, and the password itself is never in this process.
             */
            const offerBar = el('div', 'dya-bar brw-offer')
            offerBar.hidden = true

            function drawOffer(found: Offer): void {
                const keep = el('button', 'dya-button dya-button--primary', 'Save')
                keep.type = 'button'
                keep.addEventListener('click', () => {
                    offerBar.hidden = true
                    void ctx.invoke('keep', guest)
                })
                const never = el('button', 'dya-button', 'Never')
                never.type = 'button'
                never.addEventListener('click', () => {
                    offerBar.hidden = true
                    void ctx.invoke('never', guest)
                })
                const drop = key(glyph('close'), 'Close', () => {
                    offerBar.hidden = true
                    void ctx.invoke('dismiss', guest)
                })
                const group = el('div', 'dya-bar__group')
                group.append(keep, never, drop)
                offerBar.replaceChildren(
                    el('span', 'dya-text', found.update ? 'Update password' : 'Save password'),
                    el('span', 'dya-mono', found.username ? `${found.username} - ${found.host}` : found.host),
                    group
                )
                offerBar.hidden = false
            }

            /*
             * The key that signs in shows only on a site with a password kept for it. One name fills
             * at once; several open a menu of names under the key. Filling is always this press,
             * never the page loading.
             */
            async function refreshSignIn(): Promise<void> {
                if (!ready) return
                usernames = ((await ctx.invoke('logins', view.getURL())) as string[]) ?? []
                signIn.hidden = usernames.length === 0
            }

            async function signInNow(): Promise<void> {
                if (usernames.length === 1) {
                    await ctx.invoke('fill', guest, usernames[0])
                    return
                }
                accounts.replaceChildren(
                    ...usernames.map((name) => {
                        const item = el('button', 'dya-menu__item', name || '-')
                        item.type = 'button'
                        item.addEventListener('click', () => {
                            accounts.hidePopover()
                            void ctx.invoke('fill', guest, name)
                        })
                        return item
                    })
                )
                accounts.showPopover()
            }

            let kept: Kept[] = []
            async function refreshKept(): Promise<void> {
                kept = ((await ctx.invoke('passwords')) as Kept[]) ?? []
                if (!sheet.hidden) drawLibrary()
            }

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
            views.add(view)
            dropOutside ??= ctx.registerCommand({
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
            sheet.setAttribute('aria-label', 'Library')
            sheet.hidden = true

            popovers.append(accounts)
            root.append(bar, offerBar, marks, stage, scrim, sheet, popovers)
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
             * throws, so every read waits for that. A page that is a bookmark is called by the
             * bookmark's name in its tab, the one somebody chose, before the title the site gave it.
             */
            function sync(): void {
                if (!ready) return
                const url = view.getURL()
                if (document.activeElement !== address) address.value = url
                handle.navigate({ back: view.canGoBack() ? () => view.goBack() : null, home: goHome })
                forward.disabled = !view.canGoForward()
                const kept = library.bookmarks.find((entry) => entry.url === url)
                const marked = kept !== undefined
                star.classList.toggle('dya-key--active', marked)
                const label = marked ? 'Unbookmark' : 'Bookmark'
                star.setAttribute('aria-label', label)
                handle.setTitle(kept?.title || view.getTitle() || hostOf(url) || null)
            }

            function setLoading(next: boolean): void {
                loading = next
                reload.innerHTML = next ? STOP_ICON : RELOAD_ICON
                reload.setAttribute('aria-label', next ? 'Stop' : 'Reload')
            }

            /*
             * Bookmarks are keys, because each one goes somewhere when pressed, and they carry the
             * name they were given. Folders come first, each a key that opens its bookmarks as a
             * menu under it; the loose bookmarks follow. The row is absent until there is something
             * in it: a strip announcing that nothing is bookmarked is a strip of nothing.
             */
            const menus: HTMLElement[] = []

            /*
             * The bar holds every folder, empty ones too, then the loose bookmarks, then a key that
             * makes a folder. A bookmark is dragged onto a folder to go in, and out of a folder's
             * menu onto the bar to come out; a folder lights with the accent while it would take
             * one. The sheet does the same by its folder field, for whoever does not drag.
             */
            const MARK = 'application/x-dya-bookmark'
            const carries = (event: DragEvent): boolean => event.dataTransfer?.types.includes(MARK) ?? false

            function draggable(node: HTMLElement, entry: Bookmark): void {
                node.draggable = true
                node.addEventListener('dragstart', (event) => {
                    event.dataTransfer?.setData(MARK, entry.url)
                    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
                })
            }

            function accepts(node: HTMLElement, folder: string | undefined): void {
                node.addEventListener('dragover', (event) => {
                    if (!carries(event)) return
                    event.preventDefault()
                    event.stopPropagation()
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
                    if (folder !== undefined) node.classList.add('dya-chip--accept')
                })
                node.addEventListener('dragleave', () => node.classList.remove('dya-chip--accept'))
                node.addEventListener('drop', (event) => {
                    if (!carries(event)) return
                    event.preventDefault()
                    event.stopPropagation()
                    node.classList.remove('dya-chip--accept')
                    const url = event.dataTransfer?.getData(MARK)
                    const entry = library.bookmarks.find((known) => known.url === url)
                    if (entry && entry.folder !== folder) send('move', { url, folder })
                })
            }

            accepts(marks, undefined)

            function folderMaker(): HTMLElement {
                const make = el('button', 'dya-chip')
                make.type = 'button'
                make.innerHTML = glyph('add')
                make.setAttribute('aria-label', 'New folder')
                make.addEventListener('click', () => {
                    const field = el('input', 'dya-field dya-field--auto')
                    field.type = 'text'
                    field.setAttribute('aria-label', 'New folder')
                    let done = false
                    const finish = (keep: boolean): void => {
                        if (done) return
                        done = true
                        const name = field.value.trim()
                        if (keep && name) send('addFolder', name)
                        else drawMarks()
                    }
                    field.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') finish(true)
                        if (event.key === 'Escape') finish(false)
                    })
                    field.addEventListener('blur', () => finish(true))
                    make.replaceWith(field)
                    field.focus()
                })
                return make
            }

            function drawMarks(): void {
                for (const menu of menus.splice(0)) menu.remove()
                const folders = library.folders.map((name, index) => {
                    const inside = library.bookmarks.filter((entry) => entry.folder === name)
                    const chip = el('button', 'dya-chip')
                    chip.type = 'button'
                    chip.innerHTML = glyph('folder')
                    chip.append(name)
                    accepts(chip, name)
                    if (!inside.length) return chip
                    const anchor = `--brw-folder-${handle.instanceId.replace(/\W/g, '')}-${index}`
                    chip.style.setProperty('anchor-name', anchor)
                    const menu = el('div', 'dya-menu brw-menu')
                    menu.popover = 'auto'
                    menu.style.setProperty('position-anchor', anchor)
                    for (const entry of inside) {
                        const item = el('button', 'dya-menu__item', entry.title)
                        item.type = 'button'
                        draggable(item, entry)
                        item.addEventListener('click', () => {
                            menu.hidePopover()
                            go(entry.url)
                        })
                        menu.append(item)
                    }
                    chip.popoverTargetElement = menu
                    menus.push(menu)
                    popovers.append(menu)
                    return chip
                })
                const loose = library.bookmarks
                    .filter((entry) => !entry.folder)
                    .map((entry) => {
                        const mark = el('button', 'dya-chip', entry.title)
                        mark.type = 'button'
                        draggable(mark, entry)
                        mark.addEventListener('click', () => go(entry.url))
                        return mark
                    })
                const empty = folders.length + loose.length === 0
                marks.replaceChildren(...folders, ...loose, ...(empty ? [] : [folderMaker()]))
                marks.hidden = empty
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
                head.append(el('span', 'dya-title', 'Library'), end)

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

                /*
                 * The kept passwords as a table, a site and a name per row with its delete, and under
                 * everything the one key that forgets it all. The confirm names only what cannot be
                 * undone; bookmarks and the home page are not part of it.
                 */
                const passwords: HTMLElement[] = []
                if (kept.length) {
                    const table = el('table', 'dya-table dya-table--bare')
                    const body = el('tbody')
                    for (const entry of kept) {
                        const row = el('tr', 'dya-row')
                        const user = el('td')
                        user.append(el('span', 'dya-meta', entry.username || '-'))
                        const end = el('td', 'dya-table__end')
                        const forget = key(glyph('delete'), 'Delete', () => void ctx.invoke('forget', entry.origin, entry.username))
                        forget.classList.add('dya-key--danger')
                        end.append(forget)
                        row.append(el('td', 'dya-table__name', entry.host), user, end)
                        body.append(row)
                    }
                    table.append(body)
                    passwords.push(el('span', 'dya-label', 'Passwords'), table)
                }
                const clear = el('button', 'dya-button dya-button--danger', 'Clear data')
                clear.type = 'button'
                clear.addEventListener('click', () => {
                    if (window.confirm('Sign out of every site and delete every saved password?')) void ctx.invoke('clear')
                })
                const actions = el('div', 'dya-form__actions')
                actions.append(clear)

                sheet.replaceChildren(head, form, ...(list.childElementCount ? [list] : []), ...passwords, actions)
            }

            let opener: HTMLElement | null = null

            function openLibrary(): void {
                if (!sheet.hidden) return
                opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
                drawLibrary()
                void refreshKept()
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
                if (guest === -1) guest = view.getWebContentsId()
                sync()
                void refreshSignIn()
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
             * An error the page could not paint itself, said with the host and the reason and no
             * key of its own: the bar's reload, a line above, tries the address that failed. A
             * navigation that was replaced by another reports -3 and is not a failure.
             */
            view.addEventListener('did-fail-load', (event) => {
                if (!event.isMainFrame || event.errorCode === -3) return
                failed = event.validatedURL
                fail.replaceChildren(
                    el('span', 'dya-title', hostOf(event.validatedURL)),
                    el('span', 'dya-mono', event.errorDescription || String(event.errorCode))
                )
                fail.hidden = false
            })

            const offMarks = ctx.on('library', (next) => receive(next as Library))
            const offOffer = ctx.on('offer', (id: unknown, found: unknown) => {
                if (id === guest) drawOffer(found as Offer)
            })
            const offLogins = ctx.on('logins', () => {
                void refreshSignIn()
                void refreshKept()
            })
            const offCleared = ctx.on('cleared', () => {
                offerBar.hidden = true
                if (ready) view.reload()
            })

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

            forward.disabled = true

            return () => {
                views.delete(view)
                if (focused === view) focused = [...views].at(-1) ?? null
                if (views.size === 0) {
                    dropOutside?.()
                    dropOutside = null
                }
                offMarks()
                offOffer()
                offLogins()
                offCleared()
                offVideos()
                offSaving()
                offSaved()
                for (const menu of menus.splice(0)) menu.remove()
                container.replaceChildren()
            }
        }
    )
}
