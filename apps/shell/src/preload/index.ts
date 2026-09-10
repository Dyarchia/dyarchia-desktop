import { contextBridge, ipcRenderer } from 'electron'

const REFUSED = '__dyarchiaRefused'

function refusal(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const carried = (value as Record<string, unknown>)[REFUSED]
    return typeof carried === 'string' ? carried : null
}

const api = {
    invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
        const value = await ipcRenderer.invoke(channel, ...args)
        const refused = refusal(value)
        if (refused === null) return value
        throw new Error(refused)
    },
    on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
        const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
            listener(...args)
        ipcRenderer.on(channel, wrapped)
        return () => ipcRenderer.removeListener(channel, wrapped)
    }
}

contextBridge.exposeInMainWorld('dyarchia', api)

ipcRenderer.on('dyarchia:port', (event, message: unknown) => {
    window.postMessage({ dyarchiaPort: message }, '*', event.ports)
})
