import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerNotices, showNotice } from './notices'
import type { PluginNotice } from './notices'
import { declarePythonPlugin, invokePythonPlugin, startPythonPlugin } from './pythonHost'

export interface PluginManifest {
    id: string
    name: string
    version: string
    renderer: string
    main?: string
    python?: string
    channels?: string[]
    schemes?: string[]
}

interface DiscoveredPlugin {
    manifest: PluginManifest
    dir: string
}

const PLUGIN_SCHEME = 'dyarchia-plugin'
const ID_PATTERN = /^[a-z][a-z0-9-]*$/
const MANIFEST_FILE = 'dyarchia-plugin.json'

const plugins = new Map<string, DiscoveredPlugin>()

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

function pluginRoots(): string[] {
    const roots: string[] = []
    if (!app.isPackaged) {
        const workspace = resolve(import.meta.dirname, '../../../..')
        roots.push(join(workspace, 'packages'))
        if (process.env['DYARCHIA_EXAMPLES']) roots.push(join(workspace, 'examples'))
    }
    roots.push(join(app.getPath('appData'), 'dyarchia', 'plugins'))
    return roots
}

async function discoverPlugins(): Promise<void> {
    plugins.clear()
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
            if (plugins.has(manifest.id)) {
                console.warn(`[plugins] duplicate id "${manifest.id}" in ${dir}, skipping`)
                continue
            }
            plugins.set(manifest.id, { manifest, dir })
        }
    }
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
}
