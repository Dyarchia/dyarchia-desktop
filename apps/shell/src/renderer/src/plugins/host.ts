import { registerPanel } from '../panels/registry'
import type { PanelDescriptor, PanelMount } from '../panels/registry'

interface PluginListEntry {
    manifest: {
        id: string
        name: string
        version: string
    }
    rendererUrl: string
}

interface PluginModule {
    activate(ctx: {
        pluginId: string
        registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void
        invoke(channel: string, ...args: unknown[]): Promise<unknown>
        on(channel: string, listener: (...args: unknown[]) => void): () => void
    }): void | Promise<void>
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
                registerPanel,
                invoke: (channel, ...args) => bridge.invoke(`plugin:${id}:${channel}`, ...args),
                on: (channel, listener) => bridge.on(`plugin:${id}:${channel}`, listener)
            })
        } catch (error) {
            console.error(`[plugins] failed to load "${id}" from ${entry.rendererUrl}`, error)
        }
    }
}
