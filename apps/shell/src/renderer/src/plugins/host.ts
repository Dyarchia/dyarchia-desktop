import { token } from '@dyarchia/kanon'
import { registerPanel } from '../panels/registry'
import type { PanelDescriptor, PanelMount } from '../panels/registry'
import { canOpen, openFile, registerOpener } from '../panels/openers'
import type { OpenerDescriptor, OpenHandler, OpenRequest } from '../panels/openers'

interface PluginListEntry {
    manifest: {
        id: string
        name: string
        version: string
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
        onThemeChange(listener: () => void): () => void
        shell: ShellApi
    }): void | Promise<void>
}

const themeListeners = new Set<() => void>()
let themeObserver: MutationObserver | null = null

function onThemeChange(listener: () => void): () => void {
    if (!themeObserver) {
        themeObserver = new MutationObserver(() => {
            for (const each of [...themeListeners]) each()
        })
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        })
    }
    themeListeners.add(listener)
    return () => themeListeners.delete(listener)
}

export async function loadPlugins(): Promise<void> {
    const bridge = window.dyarchia
    if (!bridge) return
    const entries = (await bridge.invoke('shell:plugins:list')) as PluginListEntry[]
    for (const entry of entries) {
        const { id } = entry.manifest
        try {
            const mod = (await import(/* @vite-ignore */ entry.rendererUrl)) as PluginModule
            await mod.activate({
                pluginId: id,
                token,
                registerPanel,
                registerOpener: (descriptor: OpenerDescriptor, open: OpenHandler) =>
                    registerOpener(id, descriptor, open),
                invoke: (channel, ...args) => bridge.invoke(`plugin:${id}:${channel}`, ...args),
                on: (channel, listener) => bridge.on(`plugin:${id}:${channel}`, listener),
                onThemeChange,
                shell: {
                    catalogue: () =>
                        bridge.invoke('shell:plugins:catalogue') as Promise<PluginCatalogue>,
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
