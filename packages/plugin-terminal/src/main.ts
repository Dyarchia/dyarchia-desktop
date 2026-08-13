import { spawn } from 'node-pty'
import type { IPty } from 'node-pty'
import { homedir } from 'node:os'
import type { PluginMainContext } from '@decimatio/sdk'

interface SpawnOptions {
    cols: number
    rows: number
}

const sessions = new Map<string, IPty>()
let nextId = 1

export function activate(ctx: PluginMainContext): void {
    ctx.handle('spawn', (...args: unknown[]) => {
        const { cols, rows } = args[0] as SpawnOptions
        const id = String(nextId++)
        const pty = spawn('pwsh.exe', ['-NoLogo'], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: homedir(),
            env: process.env as Record<string, string>
        })
        pty.onData((data) => ctx.broadcast('data', id, data))
        pty.onExit(({ exitCode }) => {
            sessions.delete(id)
            ctx.broadcast('exit', id, exitCode)
        })
        sessions.set(id, pty)
        return id
    })

    ctx.handle('write', (...args: unknown[]) => {
        const [id, data] = args as [string, string]
        sessions.get(id)?.write(data)
    })

    ctx.handle('resize', (...args: unknown[]) => {
        const [id, cols, rows] = args as [string, number, number]
        sessions.get(id)?.resize(cols, rows)
    })

    ctx.handle('kill', (...args: unknown[]) => {
        const [id] = args as [string]
        sessions.get(id)?.kill()
        sessions.delete(id)
    })
}
