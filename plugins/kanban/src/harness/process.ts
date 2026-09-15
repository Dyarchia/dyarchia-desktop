import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { delimiter, extname, join } from 'node:path'
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

export function invocation(path: string, args: string[]): Invocation {
    if (!shellWrapped(path)) return { file: path, args }
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
