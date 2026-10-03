import { app, session, shell } from 'electron'
import type { Session } from 'electron'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { FiltersEngine, Request } from '@ghostery/adblocker'
import type { ElectronRequestType } from '@ghostery/adblocker'
import type { PluginMainContext } from '@dyarchia/sdk'

/*
 * The browser's own session is an in-memory partition: its cookies, logins, cache and site storage
 * are not written to disk and end when the application closes. That is all it is; it is not a
 * private browser and nothing here claims to be one. The folder a persistent session once wrote is
 * removed on the way in.
 */
const PARTITION = 'dyarchia-browser'
const RETIRED = join('Partitions', 'dyarchia-browser')

/*
 * The permissions a page may be granted: writing to the clipboard after a click, and fullscreen.
 * Every other permission request is refused.
 */
const GRANTED = new Set(['clipboard-sanitized-write', 'fullscreen'])

const WEEK = 7 * 24 * 60 * 60 * 1000

interface Bookmark {
    url: string
    title: string
    folder?: string
}

/*
 * What the person keeps: the page the browser starts on, the folders in the order they were made,
 * and the bookmarks, each loose or in one folder. An empty home is the default search page. The
 * file used to be a bare list of bookmarks, which reads as a library with no folders.
 */
interface Library {
    home: string
    folders: string[]
    bookmarks: Bookmark[]
}

function store(): string {
    return join(app.getPath('userData'), 'browser', 'bookmarks.json')
}

function bookmarksOf(raw: unknown): Bookmark[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((entry): entry is Bookmark => typeof entry?.url === 'string' && typeof entry?.title === 'string')
        .map(({ url, title, folder }) => (typeof folder === 'string' && folder ? { url, title, folder } : { url, title }))
}

async function load(): Promise<Library> {
    try {
        const parsed: unknown = JSON.parse(await readFile(store(), 'utf-8'))
        if (Array.isArray(parsed)) return { home: '', folders: [], bookmarks: bookmarksOf(parsed) }
        const found = (parsed ?? {}) as Partial<Library>
        const folders = Array.isArray(found.folders)
            ? [...new Set(found.folders.filter((name): name is string => typeof name === 'string' && !!name.trim()))]
            : []
        const bookmarks = bookmarksOf(found.bookmarks).map((entry) =>
            entry.folder && !folders.includes(entry.folder) ? { url: entry.url, title: entry.title } : entry
        )
        return { home: isWeb(found.home) ? found.home : '', folders, bookmarks }
    } catch {
        return { home: '', folders: [], bookmarks: [] }
    }
}

async function save(library: Library): Promise<void> {
    await mkdir(dirname(store()), { recursive: true })
    await writeFile(store(), JSON.stringify(library, null, 4))
}

function nameOf(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim().slice(0, 120) : ''
}

/*
 * Ads and trackers are stopped on the network by Ghostery's engine over its prebuilt ads and
 * tracking lists, before a request leaves the machine. The engine is wired here rather than
 * through Ghostery's Electron package, which registers a preload on the session for its cosmetic
 * half and turns off Electron's security warnings for the whole process: a guest runs no code
 * but the page's own. A page itself always loads; what it asks for is what gets matched. The
 * compiled lists are kept beside the bookmarks and fetched again once they are a week old; they
 * describe the web, not the person. When the refetch fails, the old lists are better than none.
 */
async function block(browsing: Session): Promise<void> {
    const path = join(app.getPath('userData'), 'browser', 'adblock.bin')
    await mkdir(dirname(path), { recursive: true })
    const fresh = await stat(path).then(
        (found) => Date.now() - found.mtimeMs < WEEK,
        () => false
    )
    const cached = {
        path,
        read: (file: string) => readFile(file),
        write: (file: string, data: Uint8Array) => writeFile(file, data)
    }
    const refetch = { ...cached, read: () => Promise.reject(new Error('stale')) }
    const engine = await FiltersEngine.fromPrebuiltAdsAndTracking(
        fetch,
        fresh ? cached : refetch
    ).catch(() => FiltersEngine.fromPrebuiltAdsAndTracking(fetch, cached))

    browsing.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        if (details.resourceType === 'mainFrame') return callback({})
        const { match, redirect } = engine.match(
            Request.fromRawDetails({
                url: details.url,
                sourceUrl: details.referrer,
                type: details.resourceType as ElectronRequestType
            })
        )
        callback(redirect ? { redirectURL: redirect.dataUrl } : { cancel: match })
    })
}

function isWeb(url: unknown): url is string {
    return typeof url === 'string' && /^https?:\/\//i.test(url)
}

export function activate(ctx: PluginMainContext): void {
    /*
     * A page that opens a new window gets the page in the panel it came from instead. A browser
     * panel is one page; a popup would be a native window outside the dock, with none of this
     * application's controls on it, and a link that says `target=_blank` is still a link.
     */
    const browsing = session.fromPartition(PARTITION)
    void rm(join(app.getPath('sessionData'), RETIRED), { recursive: true, force: true })

    browsing.setPermissionRequestHandler((_contents, permission, callback) =>
        callback(GRANTED.has(permission))
    )
    browsing.setPermissionCheckHandler((_contents, permission) => GRANTED.has(permission))
    browsing.setDevicePermissionHandler(() => false)
    block(browsing).catch((error: unknown) =>
        console.error('[browser] ad blocking is off this session: its lists could not be loaded', error)
    )

    /*
     * The browser says it is the Chrome it is. Electron's default names the application and
     * Electron beside Chrome, and sites read that as automation: Google answered a search from
     * this panel with its "unusual traffic" page before a single result.
     */
    browsing.setUserAgent(
        browsing.getUserAgent().replace(/\s+(?:Electron|[\w.-]*dyarchia[\w.-]*)\/\S+/gi, '')
    )

    app.on('web-contents-created', (_event, contents) => {
        if (contents.getType() !== 'webview' || contents.session !== browsing) return
        contents.setWindowOpenHandler(({ url }) => {
            if (isWeb(url)) void contents.loadURL(url)
            return { action: 'deny' }
        })
    })

    /*
     * Every change reads the file, changes one thing and writes it back, then tells every open
     * browser panel, so two panels never disagree about what is kept.
     */
    async function change(edit: (library: Library) => Library | void): Promise<Library> {
        const library = await load()
        const next = edit(library) ?? library
        await save(next)
        ctx.broadcast('library', next)
        return next
    }

    ctx.handle('library', () => load())

    ctx.handle('toggle', async (...args: unknown[]) => {
        const { url, title } = (args[0] ?? {}) as Partial<Bookmark>
        if (!isWeb(url)) return load()
        return change((library) => {
            library.bookmarks = library.bookmarks.some((entry) => entry.url === url)
                ? library.bookmarks.filter((entry) => entry.url !== url)
                : [...library.bookmarks, { url, title: title?.trim() || new URL(url).host }]
        })
    })

    ctx.handle('rename', async (...args: unknown[]) => {
        const { url, title } = (args[0] ?? {}) as Partial<Bookmark>
        const name = nameOf(title)
        if (!name) return load()
        return change((library) => {
            for (const entry of library.bookmarks) if (entry.url === url) entry.title = name
        })
    })

    ctx.handle('move', async (...args: unknown[]) => {
        const { url, folder } = (args[0] ?? {}) as Partial<Bookmark>
        return change((library) => {
            const target = typeof folder === 'string' && library.folders.includes(folder) ? folder : undefined
            library.bookmarks = library.bookmarks.map((entry) =>
                entry.url !== url ? entry : target ? { url: entry.url, title: entry.title, folder: target } : { url: entry.url, title: entry.title }
            )
        })
    })

    ctx.handle('remove', async (...args: unknown[]) =>
        change((library) => {
            library.bookmarks = library.bookmarks.filter((entry) => entry.url !== args[0])
        })
    )

    ctx.handle('addFolder', async (...args: unknown[]) => {
        const name = nameOf(args[0])
        return change((library) => {
            if (name && !library.folders.includes(name)) library.folders.push(name)
        })
    })

    ctx.handle('renameFolder', async (...args: unknown[]) => {
        const from = nameOf(args[0])
        const to = nameOf(args[1])
        return change((library) => {
            if (!to || !library.folders.includes(from) || library.folders.includes(to)) return
            library.folders = library.folders.map((name) => (name === from ? to : name))
            for (const entry of library.bookmarks) if (entry.folder === from) entry.folder = to
        })
    })

    /*
     * A folder that goes leaves its bookmarks behind, loose on the bar: deleting a container is
     * not deleting what it held.
     */
    ctx.handle('removeFolder', async (...args: unknown[]) => {
        const name = nameOf(args[0])
        return change((library) => {
            library.folders = library.folders.filter((each) => each !== name)
            library.bookmarks = library.bookmarks.map((entry) =>
                entry.folder === name ? { url: entry.url, title: entry.title } : entry
            )
        })
    })

    ctx.handle('setHome', async (...args: unknown[]) =>
        change((library) => {
            library.home = isWeb(args[0]) ? args[0] : ''
        })
    )

    ctx.handle('external', async (...args: unknown[]) => {
        if (isWeb(args[0])) await shell.openExternal(args[0])
    })
}
