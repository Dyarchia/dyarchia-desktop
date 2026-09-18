import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerNotices, showNotice } from './notices'
import type { PluginNotice } from './notices'
import { declarePythonPlugin, invokePythonPlugin, startPythonPlugin } from './pythonHost'
import { hasChosen, isEnabled, loadEnabled, saveEnabled } from './pluginStore'
import { withdrawDisabledOffers } from './offers'

export interface PluginRequirement {
    kind: string
    label: string
    [key: string]: unknown
}

export interface PluginManifest {
    id: string
    name: string
    version: string
    renderer: string
    main?: string
    python?: string
    channels?: string[]
    boot?: boolean
    schemes?: string[]
    description?: string
    optional?: boolean
    requires?: PluginRequirement[]
}

interface DiscoveredPlugin {
    manifest: PluginManifest
    dir: string
}

const PLUGIN_SCHEME = 'dyarchia-plugin'
const ID_PATTERN = /^[a-z][a-z0-9-]*$/
const MANIFEST_FILE = 'dyarchia-plugin.json'

const plugins = new Map<string, DiscoveredPlugin>()
const catalogue = new Map<string, DiscoveredPlugin>()

const MIME_TYPES: Record<string, string> = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript'
}

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/
const RESERVED_SCHEMES = new Set([
    'http', 'https', 'file', 'ftp', 'ws', 'wss', 'data', 'blob',
    'about', 'chrome', 'devtools', 'javascript', PLUGIN_SCHEME
])

function collectDeclaredSchemes(): string[] {
    const schemes = new Set<string>()
    for (const root of pluginRoots()) {
        let entries: string[]
        try {
            entries = readdirSync(root)
        } catch {
            continue
        }
        for (const entry of entries) {
            let manifest: PluginManifest
            try {
                manifest = JSON.parse(
                    readFileSync(join(root, entry, MANIFEST_FILE), 'utf-8')
                )
            } catch {
                continue
            }
            for (const scheme of manifest.schemes ?? []) {
                if (SCHEME_PATTERN.test(scheme) && !RESERVED_SCHEMES.has(scheme)) {
                    schemes.add(scheme)
                } else {
                    console.warn(`[plugins] rejected scheme "${scheme}" from ${entry}`)
                }
            }
        }
    }
    return [...schemes]
}

export function registerPluginScheme(): void {
    const privileges = {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
    }
    protocol.registerSchemesAsPrivileged([
        { scheme: PLUGIN_SCHEME, privileges },
        ...collectDeclaredSchemes().map((scheme) => ({ scheme, privileges }))
    ])
}

/*
 * Where plugins are found, nearest first.
 *
 * The bundled root is the one that ships inside the application, and it is the workspace tree in
 * development and `resources/plugins` in a packaged build: the same set either way, so what a
 * developer sees is what a user gets. `%APPDATA%` stays what it was, the place a plugin nobody
 * shipped can be dropped.
 *
 * Bundled wins. In development that is the rule this project has always had — an installed copy
 * must never shadow the one being worked on — and it holds for the same reason once packaged: a
 * copy left in `%APPDATA%` by an older version is stale by definition, and letting it win means a
 * plugin that shipped a new manifest is read from the old one with nothing said. A plugin nobody
 * ships still loads from there, which is the case that root exists for.
 */
function bundledRoot(): string {
    return app.isPackaged
        ? join(process.resourcesPath, 'plugins')
        : join(resolve(import.meta.dirname, '../../../..'), 'plugins')
}

function pluginRoots(): string[] {
    const roots = [bundledRoot()]
    if (!app.isPackaged && process.env['DYARCHIA_EXAMPLES']) {
        roots.push(join(resolve(import.meta.dirname, '../../../..'), 'examples'))
    }
    roots.push(join(app.getPath('appData'), 'dyarchia', 'plugins'))
    return roots
}

async function readManifests(): Promise<Map<string, DiscoveredPlugin>> {
    const found = new Map<string, DiscoveredPlugin>()
    for (const root of pluginRoots()) {
        let entries: string[]
        try {
            entries = await readdir(root)
        } catch {
            continue
        }
        for (const entry of entries) {
            const dir = join(root, entry)
            let manifest: PluginManifest
            try {
                manifest = JSON.parse(await readFile(join(dir, MANIFEST_FILE), 'utf-8'))
            } catch {
                continue
            }
            if (!ID_PATTERN.test(manifest.id ?? '')) {
                console.warn(`[plugins] invalid id in ${dir}, skipping`)
                continue
            }
            if (found.has(manifest.id)) {
                console.warn(`[plugins] duplicate id "${manifest.id}" in ${dir}, skipping`)
                continue
            }
            found.set(manifest.id, { manifest, dir })
        }
    }
    return found
}

/*
 * Everything installed, and everything loaded, which are not the same list.
 *
 * `catalogue` is what the setup panel offers; `plugins` is what this session actually activated.
 * They are separated here rather than filtered at each use because activation happens once, at
 * boot: a plugin enabled while the application is running is in the catalogue, is not in `plugins`,
 * and stays that way until the relaunch. Electron settles that — a plugin serving its own scheme
 * needs `registerSchemesAsPrivileged` before `app.whenReady()`, which has long since run.
 */
async function discoverPlugins(): Promise<void> {
    plugins.clear()
    catalogue.clear()

    const enabled = await loadEnabled()
    for (const [id, entry] of await readManifests()) {
        catalogue.set(id, entry)
        if (isEnabled(id, enabled, app.isPackaged)) plugins.set(id, entry)
    }

    const withdrawn = await withdrawDisabledOffers(new Set(catalogue.keys()), (id) => plugins.has(id))
    for (const id of withdrawn) console.log(`[plugins] withdrew the MCP offer of ${id}, which is not enabled`)
}

function servePluginFile(request: Request): Promise<Response> | Response {
    const url = new URL(request.url)
    const plugin = plugins.get(url.hostname)
    if (!plugin) {
        return new Response('unknown plugin', { status: 404 })
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const filePath = normalize(join(plugin.dir, relative))
    if (!filePath.startsWith(normalize(plugin.dir) + sep)) {
        return new Response('forbidden', { status: 403 })
    }
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    return net
        .fetch(pathToFileURL(filePath).href)
        .then(
            (res) =>
                new Response(res.body, {
                    status: res.status,
                    headers: {
                        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                })
        )
}

const REFUSED = '__dyarchiaRefused'

function isRefusal(error: unknown): error is Error {
    return (
        error instanceof Error &&
        (error as { dyarchiaRefusal?: unknown }).dyarchiaRefusal === true
    )
}

async function activateMainModules(): Promise<void> {
    for (const { manifest, dir } of plugins.values()) {
        if (!manifest.main) continue
        try {
            const moduleUrl = pathToFileURL(join(dir, manifest.main)).href
            const mod = await import(moduleUrl)
            await mod.activate({
                pluginId: manifest.id,
                handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
                    ipcMain.handle(
                        `plugin:${manifest.id}:${channel}`,
                        async (_event, ...args) => {
                            try {
                                return await handler(...args)
                            } catch (error) {
                                if (!isRefusal(error)) throw error
                                return { [REFUSED]: error.message }
                            }
                        }
                    )
                },
                broadcast: (channel: string, ...args: unknown[]) => {
                    for (const win of BrowserWindow.getAllWindows()) {
                        win.webContents.send(`plugin:${manifest.id}:${channel}`, ...args)
                    }
                },
                notify: (notice: PluginNotice) => showNotice(manifest.id, notice)
            })
        } catch (error) {
            console.error(`[plugins] failed to activate main module of "${manifest.id}"`, error)
        }
    }
}

async function activatePythonModules(): Promise<void> {
    for (const { manifest, dir } of plugins.values()) {
        if (!manifest.python) continue

        const channels = manifest.channels ?? (await startEagerly(manifest.id, dir))
        if (!channels) continue

        if (manifest.channels) declarePythonPlugin(manifest.id, dir, manifest.channels)

        for (const channel of channels) {
            ipcMain.handle(`plugin:${manifest.id}:${channel}`, (_event, ...args) =>
                invokePythonPlugin(manifest.id, channel, args)
            )
        }

        /*
         * A host with channels starts on its first invoke, which is fine for a panel and
         * wrong for a plugin whose activate() has to do something before anyone asks, such
         * as offering a tool to other plugins: nobody opens its panel, nothing is offered.
         * boot asks for the interpreter at startup; the channels are still declared, so a
         * crash still restarts it lazily.
         */
        if (manifest.channels && manifest.boot) void startPythonPlugin(manifest.id, dir)
    }
}

async function startEagerly(pluginId: string, dir: string): Promise<string[] | null> {
    console.warn(
        `[python] "${pluginId}" declares no channels in its manifest, so its interpreter starts at boot`
    )
    return startPythonPlugin(pluginId, dir)
}

export async function setupPlugins(): Promise<void> {
    protocol.handle(PLUGIN_SCHEME, servePluginFile)
    registerNotices()
    await discoverPlugins()
    await activateMainModules()
    await activatePythonModules()
    ipcMain.handle('shell:plugins:list', () =>
        [...plugins.values()].map(({ manifest }) => ({
            manifest,
            rendererUrl: `${PLUGIN_SCHEME}://${manifest.id}/${manifest.renderer.replace(/^\.?\//, '')}`
        }))
    )

    ipcMain.handle('shell:plugins:catalogue', async () => {
        const enabled = await loadEnabled()
        return {
            chosen: await hasChosen(),
            entries: [...catalogue.values()].map(({ manifest, dir }) => ({
                manifest,
                directory: dir,
                enabled: isEnabled(manifest.id, enabled, app.isPackaged),
                loaded: plugins.has(manifest.id)
            }))
        }
    })

    ipcMain.handle('shell:plugins:enable', (_event, ids: unknown) =>
        saveEnabled(Array.isArray(ids) ? (ids as string[]) : [])
    )
}
