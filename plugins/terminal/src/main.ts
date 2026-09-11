import { app, ipcMain, MessageChannelMain, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

let host: UtilityProcess | null = null

function ensureHost(): UtilityProcess {
    if (host) return host
    const spawned = utilityProcess.fork(join(import.meta.dirname, 'ptyhost.cjs'), [], {
        serviceName: 'dyarchia pty host'
    })
    spawned.on('exit', () => {
        if (host === spawned) host = null
    })
    host = spawned
    return spawned
}

export function activate(_ctx: PluginMainContext): void {
    ipcMain.handle('plugin:terminal:attach', (event, ...args: unknown[]) => {
        const { attachId, cols, rows } = args[0] as {
            attachId: string
            cols: number
            rows: number
        }
        const ptyHost = ensureHost()
        const { port1, port2 } = new MessageChannelMain()
        ptyHost.postMessage({ type: 'attach', attachId, cols, rows }, [port1])
        event.sender.postMessage('dyarchia:port', { pluginId: 'terminal', attachId }, [port2])
        return true
    })

    app.on('will-quit', () => {
        host?.kill()
        host = null
    })
}
