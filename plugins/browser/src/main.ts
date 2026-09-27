import { app, session, shell } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

/*
 * The browser's own session, held in memory and never written to disk. Cookies, logins, cache and
 * site storage last as long as the application does and are gone when it closes, so no page can
 * recognise the next launch as the same person. The folder a persistent session once wrote is
 * removed on the way in.
 */
const PARTITION = 'dyarchia-browser'
const RETIRED = join('Partitions', 'dyarchia-browser')

/*
 * A page is granted nothing that says anything about the person or the machine: no location, no
 * camera or microphone, no notifications, no devices, no idle or sensor readings. Writing to the
 * clipboard after a click and filling the panel with a video tell a page nothing, so those two
 * are the whole list.
 */
const GRANTED = new Set(['clipboard-sanitized-write', 'fullscreen'])

interface Bookmark {
    url: string
    title: string
}

function store(): string {
    return join(app.getPath('userData'), 'browser', 'bookmarks.json')
}

async function load(): Promise<Bookmark[]> {
    try {
        const parsed: unknown = JSON.parse(await readFile(store(), 'utf-8'))
        return Array.isArray(parsed)
            ? parsed.filter(
                  (entry): entry is Bookmark =>
                      typeof entry?.url === 'string' && typeof entry?.title === 'string'
              )
            : []
    } catch {
        return []
    }
}

async function save(bookmarks: Bookmark[]): Promise<void> {
    await mkdir(dirname(store()), { recursive: true })
    await writeFile(store(), JSON.stringify(bookmarks, null, 4))
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

    ctx.handle('bookmarks', () => load())

    ctx.handle('toggle', async (...args: unknown[]) => {
        const { url, title } = (args[0] ?? {}) as Partial<Bookmark>
        if (!isWeb(url)) return load()
        const bookmarks = await load()
        const next = bookmarks.some((entry) => entry.url === url)
            ? bookmarks.filter((entry) => entry.url !== url)
            : [...bookmarks, { url, title: title?.trim() || new URL(url).host }]
        await save(next)
        ctx.broadcast('bookmarks', next)
        return next
    })

    ctx.handle('external', async (...args: unknown[]) => {
        if (isWeb(args[0])) await shell.openExternal(args[0])
    })
}
