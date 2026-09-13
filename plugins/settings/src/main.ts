import { app } from 'electron'
import { spawn } from 'node:child_process'
import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

/*
 * What each plugin needs before it can run, and how to go and get it.
 *
 * The shell ships every plugin and loads the ones this installation asked for. Two of them want
 * something the application cannot carry: kanban wants the Claude Code CLI, which is somebody
 * else's installer, and crawlee wants a Python interpreter and about 600 MB of packages, which is
 * too much to put in front of everybody who downloads a terminal. So a manifest declares what it
 * needs, this module reports whether it is there, and for the one kind that can be acquired it
 * acquires it while saying what it is doing.
 *
 * Declared, never inferred. The script that installed plugins before this existed decided by
 * looking for a `dist/`, which skipped crawlee for a reason nobody chose and would have started
 * installing it the day it grew one.
 *
 * Nothing here runs on its own. Every acquisition is a button somebody pressed, because it reaches
 * the network, writes hundreds of megabytes and runs a binary this application did not ship.
 */

interface Requirement {
    kind: string
    label: string
    name?: string
    hint?: string
    project?: string
    note?: string
}

interface Status {
    label: string
    met: boolean
    acquirable: boolean
    detail: string
}

const UV_ASSETS: Record<string, string> = {
    'win32-x64': 'uv-x86_64-pc-windows-msvc.zip',
    'win32-arm64': 'uv-aarch64-pc-windows-msvc.zip',
    'darwin-arm64': 'uv-aarch64-apple-darwin.tar.gz',
    'darwin-x64': 'uv-x86_64-apple-darwin.tar.gz',
    'linux-x64': 'uv-x86_64-unknown-linux-gnu.tar.gz',
    'linux-arm64': 'uv-aarch64-unknown-linux-gnu.tar.gz'
}

const UV_RELEASE = 'https://github.com/astral-sh/uv/releases/latest/download'

function toolsDirectory(): string {
    return join(app.getPath('userData'), 'tools')
}

function environmentDirectory(pluginId: string): string {
    return join(app.getPath('userData'), 'environments', pluginId)
}

function venvPython(pluginId: string): string {
    const env = join(environmentDirectory(pluginId), '.venv')
    return process.platform === 'win32'
        ? join(env, 'Scripts', 'python.exe')
        : join(env, 'bin', 'python')
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

/*
 * Whether a command is callable, resolved the way the shell that would run it resolves one. The
 * PATHEXT dance is what separates a `claude` that is a real executable from a `claude.cmd` that npm
 * wrote, and both count.
 */
async function onPath(name: string): Promise<string | null> {
    const directories = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean)
    const extensions =
        process.platform === 'win32'
            ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean)
            : ['']
    for (const directory of directories) {
        for (const extension of extensions) {
            const candidate = join(directory, name + extension)
            if (await exists(candidate)) return candidate
        }
    }
    return null
}

async function uvBinary(): Promise<string | null> {
    const local = join(toolsDirectory(), process.platform === 'win32' ? 'uv.exe' : 'uv')
    if (await exists(local)) return local
    return onPath('uv')
}

async function statusOf(pluginId: string, requirement: Requirement): Promise<Status> {
    if (requirement.kind === 'command') {
        const found = requirement.name ? await onPath(requirement.name) : null
        return {
            label: requirement.label,
            met: found !== null,
            acquirable: false,
            detail: found ?? (requirement.hint ?? `${requirement.name} is not on PATH`)
        }
    }

    if (requirement.kind === 'python') {
        const python = venvPython(pluginId)
        return {
            label: requirement.label,
            met: await exists(python),
            acquirable: true,
            detail: (await exists(python)) ? python : (requirement.note ?? 'not installed yet')
        }
    }

    return {
        label: requirement.label,
        met: false,
        acquirable: false,
        detail: `this build does not know how to check a "${requirement.kind}" requirement`
    }
}

type Say = (line: string) => void

async function run(say: Say, command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
    say(`$ ${command} ${args.join(' ')}`)
    await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { env: { ...process.env, ...env }, windowsHide: true })
        child.stdout.on('data', (chunk: Buffer) => forEachLine(chunk, say))
        child.stderr.on('data', (chunk: Buffer) => forEachLine(chunk, say))
        child.on('error', reject)
        child.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
        )
    })
}

function forEachLine(chunk: Buffer, say: Say): void {
    for (const line of chunk.toString('utf-8').split(/\r?\n/)) {
        if (line.trim()) say(line)
    }
}

/*
 * uv, from its own release, extracted with the archiver every supported platform already has:
 * bsdtar reads a zip on Windows and a tarball everywhere else, so one command covers both and this
 * plugin carries no unpacking code of its own.
 */
async function ensureUv(say: Say): Promise<string> {
    const found = await uvBinary()
    if (found) {
        say(`uv: ${found}`)
        return found
    }

    const asset = UV_ASSETS[`${process.platform}-${process.arch}`]
    if (!asset) {
        throw new Error(`no uv release for ${process.platform}-${process.arch}`)
    }

    const tools = toolsDirectory()
    await mkdir(tools, { recursive: true })
    const archive = join(tools, asset)

    say(`downloading ${UV_RELEASE}/${asset}`)
    const response = await fetch(`${UV_RELEASE}/${asset}`)
    if (!response.ok) {
        throw new Error(`downloading uv failed with ${response.status}`)
    }
    await writeFile(archive, Buffer.from(await response.arrayBuffer()))

    say('extracting')
    await run(say, 'tar', ['-xf', archive, '-C', tools], {})
    await rm(archive, { force: true })

    const binary = await findUv(tools)
    if (!binary) throw new Error(`the uv archive held no binary under ${tools}`)
    if (process.platform !== 'win32') await chmod(binary, 0o755)

    say(`uv: ${binary}`)
    return binary
}

async function findUv(root: string): Promise<string | null> {
    const wanted = process.platform === 'win32' ? 'uv.exe' : 'uv'
    const direct = join(root, wanted)
    if (await exists(direct)) return direct

    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const nested = join(root, entry.name, wanted)
        if (await exists(nested)) return nested
    }
    return null
}

async function acquirePython(
    say: Say,
    pluginId: string,
    directory: string,
    requirement: Requirement
): Promise<void> {
    const uv = await ensureUv(say)
    const environment = join(environmentDirectory(pluginId), '.venv')
    await mkdir(environmentDirectory(pluginId), { recursive: true })

    say(`building the environment in ${environment}`)
    say('this downloads an interpreter and every dependency, so it takes a while')

    /*
     * `--frozen` because the plugin directory is read-only when the application is packaged: the
     * lockfile that shipped is the one to install, and resolving again would try to rewrite it.
     * UV_PROJECT_ENVIRONMENT is what puts the environment outside that directory at all.
     */
    await run(
        say,
        uv,
        ['sync', '--frozen', '--no-dev', '--project', join(directory, requirement.project ?? '.')],
        { UV_PROJECT_ENVIRONMENT: environment }
    )
}

export async function activate(ctx: {
    pluginId: string
    handle(channel: string, handler: (...args: unknown[]) => unknown): void
    broadcast(channel: string, ...args: unknown[]): void
}): Promise<void> {
    let busy = false

    ctx.handle('inspect', async (...args: unknown[]) => {
        const { pluginId, requires } = args[0] as { pluginId: string; requires?: Requirement[] }
        return Promise.all((requires ?? []).map((requirement) => statusOf(pluginId, requirement)))
    })

    ctx.handle('acquire', async (...args: unknown[]) => {
        const { pluginId, directory, requires } = args[0] as {
            pluginId: string
            directory: string
            requires?: Requirement[]
        }

        if (busy) throw new Error('an installation is already running')
        busy = true

        const say: Say = (line) => ctx.broadcast('line', line)
        void (async () => {
            try {
                for (const requirement of requires ?? []) {
                    if (requirement.kind !== 'python') continue
                    await acquirePython(say, pluginId, directory, requirement)
                }
                ctx.broadcast('done', { pluginId, ok: true })
            } catch (error) {
                say(String(error instanceof Error ? error.message : error))
                ctx.broadcast('done', { pluginId, ok: false })
            } finally {
                busy = false
            }
        })()

        return 'started'
    })
}
