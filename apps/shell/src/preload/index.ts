import { contextBridge, ipcRenderer } from 'electron'

const api = {
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
        ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
        const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
            listener(...args)
        ipcRenderer.on(channel, wrapped)
        return () => ipcRenderer.removeListener(channel, wrapped)
    }
}

contextBridge.exposeInMainWorld('decimatio', api)

ipcRenderer.on('decimatio:port', (event, message: unknown) => {
    window.postMessage({ decimatioPort: message }, '*', event.ports)
})
