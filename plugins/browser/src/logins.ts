import { app, safeStorage, webContents } from 'electron'
import type { Session, WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

/*
 * The passwords somebody chose to keep, one per site and name. A password never leaves this
 * process: it is written encrypted by the operating system's store (DPAPI on Windows, tied to the
 * person's account), read only to fill a form, and the panel learns sites and names, never the
 * secret. A site is its origin, scheme, host and port, so a password kept for one never fills
 * another that merely looks like it.
 */
interface Login {
    origin: string
    username: string
    secret: string
}

interface Vault {
    logins: Login[]
    never: string[]
}

interface Captured {
    origin: string
    username: string
    password: string
}

/*
 * The scripts run in a world of their own inside the page, so the page can neither read them nor
 * replace what they call. What one sees on a submit reaches this process as a console line that
 * opens with a word the page cannot know, so a page cannot forge an offer either.
 */
const WORLD = 1717

function vaultPath(): string {
    return join(app.getPath('userData'), 'browser', 'logins.json')
}

async function readVault(): Promise<Vault> {
    try {
        const found = JSON.parse(await readFile(vaultPath(), 'utf-8')) as Partial<Vault>
        const logins = Array.isArray(found.logins)
            ? found.logins.filter(
                  (entry): entry is Login =>
                      typeof entry?.origin === 'string' && typeof entry?.username === 'string' && typeof entry?.secret === 'string'
              )
            : []
        const never = Array.isArray(found.never) ? found.never.filter((each): each is string => typeof each === 'string') : []
        return { logins, never }
    } catch {
        return { logins: [], never: [] }
    }
}

async function writeVault(vault: Vault): Promise<void> {
    await mkdir(dirname(vaultPath()), { recursive: true })
    await writeFile(vaultPath(), JSON.stringify(vault, null, 4))
}

const seal = (password: string): string => safeStorage.encryptString(password).toString('base64')
const unseal = (secret: string): string => safeStorage.decryptString(Buffer.from(secret, 'base64'))

function originOf(url: string): string | null {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null
    } catch {
        return null
    }
}

function capture(nonce: string): string {
    return `(() => {
    if (window.__dyaLogins) return
    window.__dyaLogins = true
    const typed = (input) => input && /^(text|email|tel|)$/.test(input.type) && input.value
    const report = (scope) => {
        const root = scope || document
        const password = [...root.querySelectorAll('input[type=password]')].find((input) => input.value)
        if (!password) return
        const fields = [...(password.form || document).querySelectorAll('input')]
        const before = fields.slice(0, fields.indexOf(password)).reverse().find(typed)
        console.debug(${JSON.stringify(nonce)} + JSON.stringify({ username: before ? before.value : '', password: password.value }))
    }
    let last = 0
    const once = (scope) => {
        const now = Date.now()
        if (now - last < 1500) return
        last = now
        report(scope)
    }
    document.addEventListener('submit', (event) => once(event.target), true)
    document.addEventListener('click', (event) => {
        const pressed = event.target instanceof Element ? event.target.closest('button, input[type=submit]') : null
        if (pressed) once(pressed.form)
    }, true)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'password') once(event.target.form)
    }, true)
})()`
}

function fill(origin: string, username: string, password: string): string {
    return `(() => {
    if (location.origin !== ${JSON.stringify(origin)}) return false
    const visible = (input) => input.offsetParent !== null
    const set = (input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const typed = (input) => /^(text|email|tel|)$/.test(input.type) && visible(input)
    const password = [...document.querySelectorAll('input[type=password]')].find(visible)
    const fields = [...((password && password.form) || document).querySelectorAll('input')]
    const before = password ? fields.slice(0, fields.indexOf(password)).reverse().find(typed) : fields.find(typed)
    if (before && ${JSON.stringify(username)}) set(before, ${JSON.stringify(username)})
    if (password) set(password, ${JSON.stringify(password)})
    return Boolean(password || before)
})()`
}

export function logins(ctx: PluginMainContext, browsing: Session): void {
    const nonces = new Map<number, string>()
    const pending = new Map<number, Captured>()

    const guestOf = (id: unknown): WebContents | null => {
        const contents = typeof id === 'number' ? webContents.fromId(id) : undefined
        return contents && !contents.isDestroyed() && contents.session === browsing ? contents : null
    }

    async function offer(contents: WebContents, found: Captured): Promise<void> {
        if (!safeStorage.isEncryptionAvailable() || !found.password) return
        const vault = await readVault()
        if (vault.never.includes(found.origin)) return
        const kept = vault.logins.find((entry) => entry.origin === found.origin && entry.username === found.username)
        if (kept && unseal(kept.secret) === found.password) return
        pending.set(contents.id, found)
        ctx.broadcast('offer', contents.id, { host: new URL(found.origin).host, username: found.username, update: Boolean(kept) })
    }

    app.on('web-contents-created', (_event, contents) => {
        if (contents.getType() !== 'webview' || contents.session !== browsing) return
        contents.on('dom-ready', () => {
            const nonce = `dya-login:${randomUUID()}:`
            nonces.set(contents.id, nonce)
            void contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code: capture(nonce) }]).catch(() => undefined)
        })
        contents.on('console-message', (details) => {
            const nonce = nonces.get(contents.id)
            if (!nonce || !details.message.startsWith(nonce)) return
            if (details.frame && details.frame !== contents.mainFrame) return
            const origin = originOf(contents.getURL())
            if (!origin) return
            try {
                const { username, password } = JSON.parse(details.message.slice(nonce.length)) as Partial<Captured>
                if (typeof password !== 'string') return
                void offer(contents, { origin, username: typeof username === 'string' ? username : '', password })
            } catch {}
        })
        contents.once('destroyed', () => {
            nonces.delete(contents.id)
            pending.delete(contents.id)
        })
    })

    ctx.handle('canKeep', () => safeStorage.isEncryptionAvailable())

    ctx.handle('logins', async (url: unknown) => {
        const origin = typeof url === 'string' ? originOf(url) : null
        if (!origin) return []
        return (await readVault()).logins.filter((entry) => entry.origin === origin).map((entry) => entry.username)
    })

    ctx.handle('fill', async (guest: unknown, username: unknown) => {
        const contents = guestOf(guest)
        const origin = contents ? originOf(contents.getURL()) : null
        if (!contents || !origin) return false
        const kept = (await readVault()).logins.find((entry) => entry.origin === origin && entry.username === username)
        if (!kept) return false
        return contents
            .executeJavaScriptInIsolatedWorld(WORLD, [{ code: fill(origin, kept.username, unseal(kept.secret)) }], true)
            .then(Boolean, () => false)
    })

    ctx.handle('keep', async (guest: unknown) => {
        const found = typeof guest === 'number' ? pending.get(guest) : undefined
        if (!found || !safeStorage.isEncryptionAvailable()) return false
        pending.delete(guest as number)
        const vault = await readVault()
        vault.logins = [
            ...vault.logins.filter((entry) => !(entry.origin === found.origin && entry.username === found.username)),
            { origin: found.origin, username: found.username, secret: seal(found.password) }
        ]
        await writeVault(vault)
        ctx.broadcast('logins')
        return true
    })

    ctx.handle('never', async (guest: unknown) => {
        const found = typeof guest === 'number' ? pending.get(guest) : undefined
        if (!found) return
        pending.delete(guest as number)
        const vault = await readVault()
        if (!vault.never.includes(found.origin)) vault.never.push(found.origin)
        await writeVault(vault)
    })

    ctx.handle('dismiss', (guest: unknown) => {
        if (typeof guest === 'number') pending.delete(guest)
    })

    ctx.handle('passwords', async () =>
        (await readVault()).logins
            .map((entry) => ({ origin: entry.origin, host: new URL(entry.origin).host, username: entry.username }))
            .sort((a, b) => a.host.localeCompare(b.host) || a.username.localeCompare(b.username))
    )

    ctx.handle('forget', async (origin: unknown, username: unknown) => {
        const vault = await readVault()
        vault.logins = vault.logins.filter((entry) => !(entry.origin === origin && entry.username === username))
        await writeVault(vault)
        ctx.broadcast('logins')
    })

    /*
     * Everything a site left behind and every password kept, in one go: cookies and logins, site
     * storage, the cache, the authentication cache and the host lookups. Bookmarks and the home
     * page are the person's own and stay.
     */
    ctx.handle('clear', async () => {
        pending.clear()
        await Promise.all([
            browsing.clearStorageData(),
            browsing.clearCache(),
            browsing.clearAuthCache(),
            browsing.clearHostResolverCache(),
            rm(vaultPath(), { force: true })
        ])
        ctx.broadcast('logins')
        ctx.broadcast('cleared')
    })
}
