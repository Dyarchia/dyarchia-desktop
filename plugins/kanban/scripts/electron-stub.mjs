import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = join(tmpdir(), 'kanban-probe')
rmSync(userData, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })

export const app = { getPath: () => userData, on: () => undefined }

export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }

export const ipcMain = { handle: () => undefined }

export const utilityProcess = { fork: () => ({ on: () => undefined, postMessage: () => undefined, kill: () => undefined }) }

export class MessageChannelMain {
    constructor() {
        this.port1 = null
        this.port2 = null
    }
}

export default { app, dialog, ipcMain, utilityProcess, MessageChannelMain }
