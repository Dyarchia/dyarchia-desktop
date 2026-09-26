import { app, session, shell } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

/*
 * The browser's own session. Its cookies, logins and cache live under this partition and nowhere
 * else, so a page signed in here is not signed in anywhere in the shell, and clearing it touches
 * nothing but the browser.
 */
const PARTITION = 'persist:dyarchia-browser'

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
