import { token } from '@dyarchia/kanon'
import { highlight, hues } from '@dyarchia/sdk'
import { registerPanel } from '../panels/registry'
import type { PanelDescriptor, PanelMount } from '../panels/registry'
import { canOpen, openFile, registerOpener } from '../panels/openers'
import type { OpenerDescriptor, OpenHandler, OpenRequest } from '../panels/openers'

interface PluginListEntry {
    manifest: {
        id: string
        name: string
        version: string
        toolbar?: number
    }
    rendererUrl: string
}

/*
 * What a plugin may ask of the shell itself, as opposed to of its own main module.
 *
 * Everything a plugin does normally is namespaced to its own id, and that is the contract. This is
 * the shell's own surface, and it exists for the setup panel: reading which plugins this
 * installation holds, changing which of them load, and asking for the restart that makes the change
 * take. Nothing here is namespaced, so it stays deliberately small.
 */
interface ShellPaths {
    dataHome: string
    userData: string
    application: string
}

interface ShellApi {
    catalogue(): Promise<PluginCatalogue>
    paths(): Promise<ShellPaths>
    enable(ids: string[]): Promise<string[]>
    relaunch(): Promise<void>
    canOpen(path: string): boolean
    open(request: OpenRequest): Promise<boolean>
    reveal(path: string): Promise<boolean>
}

export interface PluginCatalogueEntry {
    manifest: {
        id: string
        name: string
        version: string
        description?: string
        optional?: boolean
        data?: string
        requires?: { kind: string; label: string; [key: string]: unknown }[]
    }
    directory: string
    /*
     * Whether this plugin is part of the application rather than a choice. A core plugin is always
     * loaded, is never written to the enabled list, and the setup panel shows it without a tick.
     */
    core: boolean
    enabled: boolean
    loaded: boolean
}

export interface PluginCatalogue {
    chosen: boolean
    entries: PluginCatalogueEntry[]
}

interface PluginModule {
    activate(ctx: {
        pluginId: string
        token(name: string): string
        registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void
        registerOpener(descriptor: OpenerDescriptor, open: OpenHandler): void
        invoke(channel: string, ...args: unknown[]): Promise<unknown>
        on(channel: string, listener: (...args: unknown[]) => void): void | (() => void)
        highlight(source: string, language?: string): string
        hues(keys: Iterable<string>): Record<string, string>
        shell: ShellApi
    }): void | Promise<void>
}

/*
 * What the handler threw, and nothing in front of it. `ipcRenderer.invoke` rejects with the
 * handler's message wrapped in one of its own, and a Python plugin adds a third layer, so a
 * panel showing what it caught was showing
 *
 *     Error: Error invoking remote method 'plugin:crawlee:state': Error: RuntimeError: ...
 *
 * before the sentence anybody needed to read. Stripping it here rather than in each panel is
 * the only way it happens once: every plugin's `invoke` is this one function. The original is
 * kept as the cause, so nothing is lost to a console that wants it.
 */
const REMOTE_CALL = /^Error invoking remote method '[^']*':\s*/
const THROWN_CLASS = /^[\w$]*(?:Error|Exception):\s*/

function unwrap(thrown: unknown): unknown {
    if (!(thrown instanceof Error)) return thrown
    let said = thrown.message.replace(REMOTE_CALL, '')
    while (THROWN_CLASS.test(said)) said = said.replace(THROWN_CLASS, '')
    if (said === thrown.message) return thrown
    return new Error(said || thrown.message, { cause: thrown })
}

async function invokeFor(id: string, channel: string, args: unknown[]): Promise<unknown> {
    try {
        return await window.dyarchia!.invoke(`plugin:${id}:${channel}`, ...args)
    } catch (thrown) {
        throw unwrap(thrown)
    }
}

/*
 * Each loaded plugin's face, from the first panel it registers, so a list of plugins can show the
 * icon the plugin wears on its key and its tabs. A plugin that is not loaded has registered nothing
 * and keeps its dot.
 */
const pluginIcons = new Map<string, string>()

async function catalogue(): Promise<PluginCatalogue> {
    const found = (await window.dyarchia!.invoke('shell:plugins:catalogue')) as PluginCatalogue
    return {
        ...found,
        entries: found.entries.map((entry) => ({ ...entry, icon: pluginIcons.get(entry.manifest.id) }))
    }
}

export async function loadPlugins(): Promise<void> {
    const bridge = window.dyarchia
    if (!bridge) return
    const entries = (await bridge.invoke('shell:plugins:list')) as PluginListEntry[]
    for (const entry of entries) {
        const { id } = entry.manifest
        const toolbar = typeof entry.manifest.toolbar === 'number' ? entry.manifest.toolbar : undefined
        try {
            const mod = (await import(/* @vite-ignore */ entry.rendererUrl)) as PluginModule
            await mod.activate({
                pluginId: id,
                token,
                registerPanel: (descriptor: PanelDescriptor, mount: PanelMount) => {
                    if (!pluginIcons.has(id)) pluginIcons.set(id, descriptor.icon)
                    registerPanel({ ...descriptor, toolbar }, mount)
                },
                registerOpener: (descriptor: OpenerDescriptor, open: OpenHandler) =>
                    registerOpener(id, descriptor, open),
                invoke: (channel, ...args) => invokeFor(id, channel, args),
                on: (channel, listener) => bridge.on(`plugin:${id}:${channel}`, listener),
                highlight,
                hues,
                shell: {
                    catalogue,
                    paths: () => bridge.invoke('shell:app:paths') as Promise<ShellPaths>,
                    enable: (ids) => bridge.invoke('shell:plugins:enable', ids) as Promise<string[]>,
                    relaunch: () => bridge.invoke('shell:app:relaunch') as Promise<void>,
                    canOpen,
                    open: (request: OpenRequest) => openFile(request),
                    reveal: (path: string) =>
                        bridge.invoke('shell:app:reveal', path) as Promise<boolean>
                }
            })
        } catch (error) {
            console.error(`[plugins] failed to load "${id}" from ${entry.rendererUrl}`, error)
        }
    }
}
