import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import { delimiter, dirname, extname, join } from 'node:path'
import type { Invocation } from './types.js'

const EXTENSIONS = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']

const resolved = new Map<string, string | null>()

async function executable(path: string): Promise<boolean> {
    try {
        await access(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}

export async function findBinary(name: string): Promise<string | null> {
    const known = resolved.get(name)
    if (known !== undefined) return known

    const roots = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
    for (const root of roots) {
        for (const extension of EXTENSIONS) {
            const candidate = join(root, `${name}${extension}`)
            if (await executable(candidate)) {
                resolved.set(name, candidate)
                return candidate
            }
        }
    }

    resolved.set(name, null)
    return null
}

function shellWrapped(path: string): boolean {
    const extension = extname(path).toLowerCase()
    return extension === '.cmd' || extension === '.bat'
}

/*
 * The line an npm shim ends on: the interpreter, any flags for it, and the script under the shim's
 * own directory, followed by everything the shim was given.
 */
const NPM_SHIM = /"%_prog%"\s+((?:--?[\w.=-]+\s+)*)"%dp0%\\([^"]+)"\s+%\*/

function nodeOnPath(): string | null {
    for (const root of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
        const candidate = join(root, 'node.exe')
        if (existsSync(candidate)) return candidate
    }
    return null
}

/*
 * What an npm shim would run, run directly. Going through the shim means going through cmd.exe,
 * and cmd.exe re-reads every argument: a quote toggles its quoting and an `&` outside quotes starts
 * a second command. A card title reaches the prompt argument, an agent can write the title of the
 * card that follows it, so a prompt that said `a" & calc & "b` ran calc as the user. cmd.exe also
 * stops at the first newline, which is why multi-line prompts were being cut short. Node given the
 * script and an argument array sees none of that.
 */
function throughNode(shim: string): Invocation | null {
    let text: string
    try {
        text = readFileSync(shim, 'utf-8')
    } catch {
        return null
    }
    const found = NPM_SHIM.exec(text)
    if (!found) return null
    const directory = dirname(shim)
    const script = join(directory, found[2])
    const bundled = join(directory, 'node.exe')
    const node = existsSync(bundled) ? bundled : nodeOnPath()
    if (!node || !existsSync(script)) return null
    return { file: node, args: [...found[1].split(/\s+/).filter(Boolean), script] }
}

/*
 * Characters cmd.exe acts on inside a command line. A batch file that is not an npm shim can only
 * be reached through cmd.exe, so an argument holding any of them is refused rather than escaped:
 * escaping for cmd.exe and then again for the batch file's own %* is the thing that goes wrong.
 */
const CMD_SPECIAL = /["&|<>^%!\r\n]/

export function invocation(path: string, args: string[]): Invocation {
    if (!shellWrapped(path)) return { file: path, args }
    const direct = throughNode(path)
    if (direct) return { file: direct.file, args: [...direct.args, ...args] }
    if (args.some((arg) => CMD_SPECIAL.test(arg))) {
        throw new Error(
            `${path} is a batch file that is not an npm shim, and this prompt holds characters cmd.exe would execute`
        )
    }
    return { file: process.env.COMSPEC ?? 'cmd.exe', args: ['/d', '/s', '/c', path, ...args] }
}

const PARENT_SESSION_VARS = [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_HOST_SESSION_ID',
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_MESSAGING_SOCKET',
    'CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH',
    'CLAUDE_CODE_OAUTH_SCOPES',
    'CLAUDE_AGENT_SDK_VERSION',
    'CLAUDE_PID',
    'CLAUDE_EFFORT'
]

export function childEnv(): Record<string, string> {
    const env = { ...(process.env as Record<string, string>) }
    const hosted = env['CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH'] !== undefined

    for (const name of PARENT_SESSION_VARS) delete env[name]
    if (hosted) {
        delete env['ANTHROPIC_BASE_URL']
        delete env['ANTHROPIC_AUTH_TOKEN']
    }
    delete env['ELECTRON_RUN_AS_NODE']
    return env
}

export function capture(
    call: Invocation,
    options: { cwd?: string; timeout: number; maxBuffer?: number }
): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            call.file,
            call.args,
            {
                cwd: options.cwd,
                env: childEnv(),
                timeout: options.timeout,
                maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
                windowsHide: true
            },
            (error, stdout) => (error ? reject(error) : resolve(stdout))
        )
    })
}
