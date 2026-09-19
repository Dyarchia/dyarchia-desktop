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
    postInstall?: string[][]
    verify?: string[]
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

/*
 * What a requirement is missing, part by part, rather than whether it is missing.
 *
 * One boolean per requirement reads as "a gigabyte is about to be downloaded" on a machine that
 * already holds all of it. Everything underneath is incremental — uv links packages it has already
 * cached, `playwright install` is a no-op when the browser is there — so the panel would have been
 * the only part of the chain claiming otherwise.
 *
 * What can be checked generically is checked and reported: whether uv is here, and whether this
 * plugin's environment has been built. What cannot is stated as what it is, because a panel that
 * knew how to test one plugin's post-install step would know about that plugin.
 */
async function statusOf(pluginId: string, requirement: Requirement): Promise<Status[]> {
    if (requirement.kind === 'command') {
        const found = requirement.name ? await onPath(requirement.name) : null
        return [
            {
                label: requirement.label,
                met: found !== null,
                acquirable: false,
                detail: found ?? (requirement.hint ?? `${requirement.name} is not on PATH`)
            }
        ]
    }

    if (requirement.kind === 'python') {
        const uv = await uvBinary()
        const python = venvPython(pluginId)
        const built = await exists(python)
        const verdict = built && requirement.verify ? await verify(pluginId, requirement.verify) : null
        const done = verdict === null ? built : verdict.ok

        const parts: Status[] = [
            {
                label: 'uv',
                met: uv !== null,
                acquirable: true,
                detail: uv ?? 'not here, so it is downloaded from its own release first'
            },
            {
                label: requirement.label,
                met: done,
                acquirable: true,
                detail: built ? python : `to be built in ${python}`
            }
        ]

        /* The step is named by what it fetches, not by the argv that fetches it: the command is the
         * detail, one hover away, and `uv playwright install chromium` as a label is a chip wider
         * than the card it sits in. */
        for (const step of requirement.postInstall ?? []) {
            parts.push({
                label: step[step.length - 1] ?? step.join(' '),
                met: done,
                acquirable: true,
                detail: built
                    ? 'ran with the environment'
                    : 'runs after the packages, and skips whatever is already on this machine'
            })
        }

        if (requirement.verify) {
            const command = requirement.verify.join(' ')
            parts.push({
                label: 'verified',
                met: done,
                acquirable: true,
                detail: verdict
                    ? `${command} exited ${verdict.code}`
                    : `${command} runs once the environment is built`
            })
        }
        return parts
    }

    return [
        {
            label: requirement.label,
            met: false,
            acquirable: false,
            detail: `this build does not know how to check a "${requirement.kind}" requirement`
        }
    ]
}

type Say = (line: string) => void

interface Verdict {
    ok: boolean
    code: number
}

/*
 * The plugin's own answer to whether its environment works, run inside that environment. An
 * environment can exist and still be broken: packages landed and the browser did not, or a step
 * was interrupted between the two. A directory check cannot tell, so a plugin that knows what
 * "working" means declares the command that proves it, and Setup reports the exit code and
 * nothing more. The environment's own scripts directory goes first on PATH, so `python` and any
 * console script the packages installed are the environment's.
 */
async function verify(pluginId: string, command: string[]): Promise<Verdict> {
    const environment = join(environmentDirectory(pluginId), '.venv')
    const scripts = join(environment, process.platform === 'win32' ? 'Scripts' : 'bin')
    const env = {
        ...process.env,
        VIRTUAL_ENV: environment,
        PATH: [scripts, process.env['PATH'] ?? ''].join(delimiter)
    }
    return new Promise<Verdict>((resolve) => {
        const [file, ...args] = command
        const child = spawn(file, args, { env, windowsHide: true, stdio: 'ignore' })
        const timer = setTimeout(() => {
            child.kill()
            resolve({ ok: false, code: -1 })
        }, 60_000)
        child.on('error', () => {
            clearTimeout(timer)
            resolve({ ok: false, code: -1 })
        })
        child.on('close', (code) => {
            clearTimeout(timer)
            resolve({ ok: code === 0, code: code ?? -1 })
        })
    })
}

async function run(say: Say, command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
    say(`$ ${command} ${args.join(' ')}`)
    await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { env: { ...process.env, ...env }, windowsHide: true })
        const reader = lineReader(say)
        child.stdout.on('data', reader)
        child.stderr.on('data', reader)
        child.on('error', reject)
        child.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
        )
    })
}

/*
 * Chunks from a pipe do not arrive on line boundaries, so whatever follows the last newline is held
 * until the rest of it turns up. Splitting each chunk on its own tore package names in half in the
 * panel's log, which is the one place this output is ever read.
 */
function lineReader(say: Say): (chunk: Buffer) => void {
    let rest = ''
    return (chunk) => {
        const parts = (rest + chunk.toString('utf-8')).split(/\r?\n/)
        rest = parts.pop() ?? ''
        for (const line of parts) if (line.trim()) say(line)
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
    await run(say, archiver(), ['-xf', archive, '-C', tools], {})
    await rm(archive, { force: true })

    const binary = await findUv(tools)
    if (!binary) throw new Error(`the uv archive held no binary under ${tools}`)
    if (process.platform !== 'win32') await chmod(binary, 0o755)

    say(`uv: ${binary}`)
    return binary
}

/*
 * The archiver is named by its absolute path on Windows. The application inherits the PATH of
 * whatever launched it, and a launch from Git Bash or MSYS puts a GNU tar first, which reads
 * `C:\...` as a remote host and fails with "Cannot connect to C: resolve failed". The bsdtar in
 * System32 is the one that reads a zip, and it is there on every supported Windows.
 */
function archiver(): string {
    if (process.platform !== 'win32') return 'tar'
    return join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
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
    const project = join(directory, requirement.project ?? '.')

    /*
     * `--frozen` because the plugin directory is read-only once packaged: the lockfile that shipped
     * is the one to install, and resolving again would try to rewrite it. `--no-editable` because
     * an editable install records the absolute path of the project, and a portable build unpacks
     * its resources somewhere new on every launch, so an environment pointing back at them is
     * broken by the second start. The package is copied into the environment instead, which is
     * what makes the environment the only thing that has to survive.
     */
    await run(say, uv, ['sync', '--frozen', '--no-dev', '--no-editable', '--project', project], {
        UV_PROJECT_ENVIRONMENT: environment
    })

    /*
     * Whatever the project says has to happen after its packages are there. crawlee's is
     * `playwright install chromium`, the browser its browser-backed crawlers drive, and its own
     * README has said so since before this panel existed. Leaving it out produced the failure this
     * whole feature is meant to remove: an installation that looks finished and breaks later, on
     * the first profile that asks for a browser.
     *
     * Each step is a command to run inside the environment, declared by the plugin, so nothing
     * about any one plugin is written down here.
     *
     * uv's own options go before the command or they are forwarded to it. Written the other way
     * round, `--project` reached playwright and uv ran against no project at all, which is how
     * `program not found` came back for a package that was installed. `--no-sync` because the
     * environment was built a moment ago and the project cannot be resolved again anyway.
     */
    for (const step of requirement.postInstall ?? []) {
        await run(say, uv, ['run', '--project', project, '--no-sync', ...step], {
            UV_PROJECT_ENVIRONMENT: environment
        })
    }

    if (requirement.verify) {
        say(`verifying: ${requirement.verify.join(' ')}`)
        const verdict = await verify(pluginId, requirement.verify)
        if (!verdict.ok) {
            throw new Error(`the environment was built but its own check exited ${verdict.code}`)
        }
        say('verified')
    }
}

export async function activate(ctx: {
    pluginId: string
    handle(channel: string, handler: (...args: unknown[]) => unknown): void
    broadcast(channel: string, ...args: unknown[]): void
}): Promise<void> {
    let busy = false

    ctx.handle('inspect', async (...args: unknown[]) => {
        const { pluginId, requires } = args[0] as { pluginId: string; requires?: Requirement[] }
        const found = await Promise.all(
            (requires ?? []).map((requirement) => statusOf(pluginId, requirement))
        )
        return found.flat()
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
