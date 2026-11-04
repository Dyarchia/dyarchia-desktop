import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join, resolve } from 'node:path'
import { showNotice } from './notices'
import type { PluginNotice } from './notices'
import { dataHome } from './paths'

const READY_TIMEOUT_MS = 15_000
const INVOKE_TIMEOUT_MS = 60_000

interface Pending {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

interface HostMessage {
    t: 'ready' | 'result' | 'error' | 'broadcast' | 'notice'
    id?: number
    plugin?: string
    channels?: string[]
    channel?: string
    args?: unknown[]
    result?: unknown
    notice?: PluginNotice
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

    /*
     * Resolves false on every way the host can fail to come up, and never rejects: the boot path
     * starts plugins with `void`, so a rejection would be unhandled.
     *
     * A missing interpreter does not throw from `spawn`. Node reports it as an 'error' event on
     * the child a tick later, and an 'error' event nobody listens to is an uncaught exception in
     * the main process. That is how a machine without the `py` launcher lost the whole
     * application at every launch once crawlee was enabled, so the listener is attached before
     * anything else can run.
     */
    start(): Promise<boolean> {
        const { command, baseArgs } = pythonCommand(this.pluginId)
        let settle: (up: boolean) => void = () => {}
        const ready = new Promise<boolean>((done) => {
            const timer = setTimeout(() => settle(false), READY_TIMEOUT_MS)
            settle = (up) => {
                clearTimeout(timer)
                done(up)
            }
        })

        let child: ChildProcessWithoutNullStreams
        try {
            child = spawn(command, [...baseArgs, '-m', 'dyarchia_sdk', this.directory], {
                cwd: sdkRoot(),
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUNBUFFERED: '1',
                    DYARCHIA_PLUGIN_ENV: pluginEnvironment(this.pluginId),
                    DYARCHIA_USER_DATA: app.getPath('userData'),
                    DYARCHIA_DATA_HOME: dataHome()
                }
            }) as ChildProcessWithoutNullStreams
        } catch (error) {
            console.error(`[python] cannot spawn interpreter for "${this.pluginId}"`, error)
            settle(false)
            return ready
        }
        this.child = child

        child.on('error', (error: NodeJS.ErrnoException) => {
            console.error(`[python] cannot run "${command}" for "${this.pluginId}"`, error.message)
            if (error.code === 'ENOENT') {
                failures.set(this.pluginId, interpreterMissing(this.pluginId, command))
            }
            this.down(`python plugin "${this.pluginId}" could not start`)
            settle(false)
        })
        child.stdin.on('error', (error) =>
            console.error(`[python] "${this.pluginId}" stopped reading`, error.message)
        )
        child.stderr.on('data', (chunk: Buffer) =>
            process.stderr.write(`[python:${this.pluginId}] ${chunk}`)
        )
        child.on('exit', (code) => {
            this.down(`python plugin "${this.pluginId}" exited`)
            settle(false)
            if (code !== 0 && code !== null) {
                console.error(`[python] "${this.pluginId}" exited with code ${code}`)
            }
        })

        createInterface({ input: child.stdout }).on('line', (line) => {
            const message = parse(line)
            if (!message) return
            if (message.t === 'ready') {
                failures.delete(this.pluginId)
                this.channels.push(...(message.channels ?? []))
                settle(true)
                return
            }
            this.receive(message)
        })
        return ready
    }

    private down(reason: string): void {
        for (const { reject, timer } of this.pending.values()) {
            clearTimeout(timer)
            reject(new Error(reason))
        }
        this.pending.clear()
        this.child = null
    }

    private receive(message: HostMessage): void {
        if (message.t === 'notice') {
            if (message.notice) showNotice(this.pluginId, message.notice)
            return
        }
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
const declared = new Map<string, { directory: string; channels: string[] }>()
const starting = new Map<string, Promise<PythonPlugin | null>>()

/*
 * Where a Python plugin's own interpreter lives, if it has one.
 *
 * A plugin that ships inside the application sits in a read-only directory, so its virtual
 * environment cannot sit beside it. The setup panel builds one here and the plugin is told the
 * path rather than guessing: one convention, written once by whoever installs and read once by
 * whoever runs, and no plugin has to know whether it was bundled or dropped in by hand.
 */
export function pluginEnvironment(pluginId: string): string {
    return join(app.getPath('userData'), 'environments', pluginId)
}

function sdkRoot(): string {
    return app.isPackaged
        ? resolve(process.resourcesPath, 'pysdk')
        : resolve(import.meta.dirname, '../../../..', 'packages/pysdk')
}

/*
 * The interpreter that runs the host, which needs nothing beyond the standard library.
 *
 * An explicit DYARCHIA_PYTHON wins. Then the environment Setup built for the plugin: uv brings a
 * Python of its own when the machine has none, so on a clean install that environment is the one
 * interpreter certain to exist. The system launcher is the last resort, for a plugin with no
 * environment of its own. Bare `python` is never tried on Windows, where a machine without Python
 * answers it with the Microsoft Store stub instead of an error.
 */
function pythonCommand(pluginId: string): { command: string; baseArgs: string[] } {
    const override = process.env['DYARCHIA_PYTHON']
    if (override) return { command: override, baseArgs: [] }
    const venv = join(pluginEnvironment(pluginId), '.venv')
    const own = process.platform === 'win32'
        ? join(venv, 'Scripts', 'python.exe')
        : join(venv, 'bin', 'python')
    if (existsSync(own)) return { command: own, baseArgs: [] }
    if (process.platform === 'win32') return { command: 'py', baseArgs: ['-3'] }
    return { command: 'python3', baseArgs: [] }
}

/*
 * Why a plugin is down, told to the panel that asked rather than in a notice: the plugin is first
 * started while the window is still loading, so a notice raised then reaches nobody.
 */
const failures = new Map<string, string>()

function interpreterMissing(pluginId: string, command: string): string {
    return `Python was not found ("${command}"). Install ${pluginId} from Setup, which brings its `
        + 'own Python, or install Python 3 and restart.'
}

function parse(line: string): HostMessage | null {
    try {
        return JSON.parse(line) as HostMessage
    } catch {
        return null
    }
}

export function declarePythonPlugin(
    pluginId: string,
    directory: string,
    channels: string[]
): void {
    declared.set(pluginId, { directory, channels })
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

async function ensureRunning(pluginId: string): Promise<PythonPlugin | null> {
    const live = running.get(pluginId)
    if (live) return live

    const pending = starting.get(pluginId)
    if (pending) return pending

    const entry = declared.get(pluginId)
    if (!entry) return null

    const attempt = (async () => {
        const plugin = new PythonPlugin(pluginId, entry.directory)
        if (!(await plugin.start())) {
            console.error(`[python] "${pluginId}" failed to report ready`)
            plugin.stop()
            return null
        }
        running.set(pluginId, plugin)
        reportDrift(pluginId, entry.channels, plugin.channels)
        return plugin
    })()

    starting.set(pluginId, attempt)
    try {
        return await attempt
    } finally {
        starting.delete(pluginId)
    }
}

function reportDrift(pluginId: string, manifest: string[], reported: string[]): void {
    const missing = manifest.filter((channel) => !reported.includes(channel))
    const extra = reported.filter((channel) => !manifest.includes(channel))
    if (missing.length > 0) {
        console.error(
            `[python] "${pluginId}" declares ${missing.join(', ')} in its manifest but does not handle it`
        )
    }
    if (extra.length > 0) {
        console.warn(
            `[python] "${pluginId}" handles ${extra.join(', ')} but does not declare it; the renderer cannot reach it`
        )
    }
}

export async function invokePythonPlugin(
    pluginId: string,
    channel: string,
    args: unknown[]
): Promise<unknown> {
    const plugin = await ensureRunning(pluginId)
    if (!plugin) throw new Error(failures.get(pluginId) ?? `python plugin "${pluginId}" is not running`)
    return plugin.invoke(channel, args)
}

export function stopPythonPlugins(): void {
    for (const plugin of running.values()) plugin.stop()
    running.clear()
    starting.clear()
}
