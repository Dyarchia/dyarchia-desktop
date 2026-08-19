import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

const READY_TIMEOUT_MS = 15_000
const INVOKE_TIMEOUT_MS = 60_000

interface Pending {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

interface HostMessage {
    t: 'ready' | 'result' | 'error' | 'broadcast'
    id?: number
    plugin?: string
    channels?: string[]
    channel?: string
    args?: unknown[]
    result?: unknown
    error?: string
}

class PythonPlugin {
    readonly channels: string[] = []

    private child: ChildProcessWithoutNullStreams | null = null
    private pending = new Map<number, Pending>()
    private nextId = 1

    constructor(
        readonly pluginId: string,
        private readonly directory: string
    ) {}

    async start(): Promise<boolean> {
        const { command, baseArgs } = pythonCommand()
        try {
            this.child = spawn(command, [...baseArgs, '-m', 'dyarchia_sdk', this.directory], {
                cwd: sdkRoot(),
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }
            }) as ChildProcessWithoutNullStreams
        } catch (error) {
            console.error(`[python] cannot spawn interpreter for "${this.pluginId}"`, error)
            return false
        }

        this.child.stderr.on('data', (chunk: Buffer) =>
            process.stderr.write(`[python:${this.pluginId}] ${chunk}`)
        )
        this.child.on('exit', (code) => {
            for (const { reject, timer } of this.pending.values()) {
                clearTimeout(timer)
                reject(new Error(`python plugin "${this.pluginId}" exited`))
            }
            this.pending.clear()
            this.child = null
            if (code !== 0 && code !== null) {
                console.error(`[python] "${this.pluginId}" exited with code ${code}`)
            }
        })

        const reader = createInterface({ input: this.child.stdout })
        const ready = new Promise<boolean>((done) => {
            const timer = setTimeout(() => done(false), READY_TIMEOUT_MS)
            reader.on('line', (line) => {
                const message = parse(line)
                if (!message) return
                if (message.t === 'ready') {
                    clearTimeout(timer)
                    this.channels.push(...(message.channels ?? []))
                    done(true)
                    return
                }
                this.receive(message)
            })
        })
        return ready
    }

    private receive(message: HostMessage): void {
        if (message.t === 'broadcast') {
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send(
                    `plugin:${this.pluginId}:${message.channel}`,
                    ...(message.args ?? [])
                )
            }
            return
        }
        if (message.id === undefined) return
        const waiting = this.pending.get(message.id)
        if (!waiting) return
        this.pending.delete(message.id)
        clearTimeout(waiting.timer)
        if (message.t === 'error') {
            waiting.reject(new Error(message.error ?? 'python plugin error'))
        } else {
            waiting.resolve(message.result)
        }
    }

    invoke(channel: string, args: unknown[]): Promise<unknown> {
        const child = this.child
        if (!child) return Promise.reject(new Error(`python plugin "${this.pluginId}" is down`))
        const id = this.nextId++
        return new Promise<unknown>((res, rej) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                rej(new Error(`timeout invoking ${this.pluginId}:${channel}`))
            }, INVOKE_TIMEOUT_MS)
            this.pending.set(id, { resolve: res, reject: rej, timer })
            child.stdin.write(`${JSON.stringify({ t: 'invoke', id, channel, args })}\n`)
        })
    }

    stop(): void {
        this.child?.kill()
        this.child = null
    }
}

const running = new Map<string, PythonPlugin>()

function sdkRoot(): string {
    return app.isPackaged
        ? resolve(process.resourcesPath, 'pysdk')
        : resolve(import.meta.dirname, '../../../..', 'packages/pysdk')
}

function pythonCommand(): { command: string; baseArgs: string[] } {
    const override = process.env['DYARCHIA_PYTHON']
    if (override) return { command: override, baseArgs: [] }
    if (process.platform === 'win32') return { command: 'py', baseArgs: ['-3'] }
    return { command: 'python3', baseArgs: [] }
}

function parse(line: string): HostMessage | null {
    try {
        return JSON.parse(line) as HostMessage
    } catch {
        return null
    }
}

export async function startPythonPlugin(
    pluginId: string,
    directory: string
): Promise<string[] | null> {
    const plugin = new PythonPlugin(pluginId, directory)
    if (!(await plugin.start())) {
        console.error(`[python] "${pluginId}" failed to report ready`)
        plugin.stop()
        return null
    }
    running.set(pluginId, plugin)
    return plugin.channels
}

export function invokePythonPlugin(
    pluginId: string,
    channel: string,
    args: unknown[]
): Promise<unknown> {
    const plugin = running.get(pluginId)
    if (!plugin) return Promise.reject(new Error(`python plugin "${pluginId}" is not running`))
    return plugin.invoke(channel, args)
}

export function stopPythonPlugins(): void {
    for (const plugin of running.values()) plugin.stop()
    running.clear()
}
