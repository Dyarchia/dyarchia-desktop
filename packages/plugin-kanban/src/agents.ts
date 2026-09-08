import { execFile } from 'node:child_process'
import { access, constants, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, extname, join } from 'node:path'

const TIMEOUT_MS = 20_000
const EXTENSIONS = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']

export type Liveness = 'alive' | 'dead' | 'unknown'

const LIVE = new Set(['working', 'blocked'])
const FINISHED = new Set(['done', 'stopped', 'failed'])

export interface SessionRecord {
    shortId: string
    sessionId: string
    cwd: string
    name: string
    state: string
    status: string
    startedAt: number
}

export interface Launch {
    shortId: string
    sessionId: string
    cwd: string
}

let resolved: string | null | undefined

async function executable(path: string): Promise<boolean> {
    try {
        await access(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}

export async function binary(): Promise<string | null> {
    if (resolved !== undefined) return resolved

    const roots = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
    for (const root of roots) {
        for (const extension of EXTENSIONS) {
            const candidate = join(root, `claude${extension}`)
            if (await executable(candidate)) {
                resolved = candidate
                return resolved
            }
        }
    }

    resolved = null
    return resolved
}

function shellWrapped(path: string): boolean {
    const extension = extname(path).toLowerCase()
    return extension === '.cmd' || extension === '.bat'
}

export function invocation(path: string, args: string[]): { file: string; args: string[] } {
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

export function run(args: string[], cwd?: string): Promise<string> {
    return binary().then(
        (path) =>
            new Promise<string>((resolve, reject) => {
                if (!path) {
                    reject(new Error('claude is not on PATH'))
                    return
                }
                const call = invocation(path, args)
                execFile(
                    call.file,
                    call.args,
                    {
                        cwd,
                        env: childEnv(),
                        timeout: TIMEOUT_MS,
                        maxBuffer: 8 * 1024 * 1024,
                        windowsHide: true
                    },
                    (error, stdout) => (error ? reject(error) : resolve(stdout))
                )
            })
    )
}

function record(raw: unknown): SessionRecord | null {
    const row = raw as Record<string, unknown>
    if (row?.kind !== 'background') return null
    if (typeof row.sessionId !== 'string' || typeof row.id !== 'string') return null

    return {
        shortId: row.id,
        sessionId: row.sessionId,
        cwd: typeof row.cwd === 'string' ? row.cwd : '',
        name: typeof row.name === 'string' ? row.name : '',
        state: typeof row.state === 'string' ? row.state : '',
        status: typeof row.status === 'string' ? row.status : '',
        startedAt: typeof row.startedAt === 'number' ? row.startedAt : 0
    }
}

export async function snapshot(): Promise<SessionRecord[] | null> {
    try {
        const parsed = JSON.parse(await run(['agents', '--json', '--all'])) as unknown
        if (!Array.isArray(parsed)) return null
        return parsed.map(record).filter((entry): entry is SessionRecord => entry !== null)
    } catch {
        return null
    }
}

export function find(sessions: SessionRecord[] | null, sessionId: string): SessionRecord | null {
    return sessions?.find((entry) => entry.sessionId === sessionId) ?? null
}

export function liveness(sessions: SessionRecord[] | null, sessionId: string): Liveness {
    if (sessions === null) return 'unknown'
    const session = find(sessions, sessionId)
    if (!session) return 'dead'
    if (FINISHED.has(session.state)) return 'dead'
    if (LIVE.has(session.state)) return 'alive'
    return 'unknown'
}

export function waiting(session: SessionRecord | null): boolean {
    return session?.state === 'blocked'
}

export async function stop(shortId: string): Promise<void> {
    await run(['stop', shortId]).catch(() => undefined)
}

function projectsRoot(): string {
    return join(homedir(), '.claude', 'projects')
}

function mangle(cwd: string): string {
    return cwd.replace(/[:\\/]/g, '-')
}

export async function transcript(cwd: string, sessionId: string): Promise<string | null> {
    const direct = join(projectsRoot(), mangle(cwd), `${sessionId}.jsonl`)
    if (await stat(direct).catch(() => null)) return direct

    const roots = await readdir(projectsRoot()).catch(() => [])
    for (const root of roots) {
        const candidate = join(projectsRoot(), root, `${sessionId}.jsonl`)
        if (await stat(candidate).catch(() => null)) return candidate
    }
    return null
}

export function parseLaunch(stdout: string, sessions: SessionRecord[] | null): Launch | null {
    const match = /backgrounded\s*\S\s*([0-9a-f]{8})\b/i.exec(stdout)
    if (!match) return null

    const shortId = match[1]
    const session = sessions?.find((entry) => entry.shortId === shortId)
    return {
        shortId,
        sessionId: session?.sessionId ?? '',
        cwd: session?.cwd ?? ''
    }
}

export function launchArgv(options: {
    name: string
    permissionMode: string
    addDirs: string[]
    model: string | null
    effort: string | null
    worktree: string | null
    prompt: string
}): string[] {
    const args = ['--bg', '--permission-mode', options.permissionMode]
    for (const dir of options.addDirs) args.push('--add-dir', dir)
    if (options.worktree) args.push('--worktree', options.worktree)
    if (options.model) args.push('--model', options.model)
    if (options.effort) args.push('--effort', options.effort)
    args.push('-n', options.name, options.prompt)
    return args
}
