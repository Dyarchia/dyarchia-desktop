import { app } from 'electron'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Run } from '../types.js'
import { childEnv } from './process.js'
import type { Invocation, Liveness } from './types.js'

const TAIL_LINES = 200

interface Hosted {
    child: ChildProcess
    startedAt: number
    endedAt: number | null
    exitCode: number | null
}

const hosted = new Map<string, Hosted>()

export function folder(): string {
    return join(app.getPath('userData'), 'kanban', 'hosted')
}

export function eventsPath(run: Run): string {
    return join(folder(), `${run.runId}.jsonl`)
}

export function stderrPath(run: Run): string {
    return join(folder(), `${run.runId}.stderr.txt`)
}

export function finalPath(run: Run): string {
    return join(folder(), `${run.runId}.final.md`)
}

/*
 * A hosted run is a child of this process: it has no --bg, no registry and no transcript
 * of its own that the board can read, so the board keeps the three itself. Its stdout is
 * the event stream and goes to a file under userData, keyed by run id, which is what
 * progress and history read; its exit is the liveness answer; and when this process is
 * gone the run is gone with it, which the driver reports as orphaned rather than crashed.
 */
export async function launch(
    runId: string,
    call: Invocation,
    cwd: string,
    env: Record<string, string> = {}
): Promise<void> {
    await mkdir(folder(), { recursive: true })
    const events = createWriteStream(join(folder(), `${runId}.jsonl`), { flags: 'a' })
    const errors = createWriteStream(join(folder(), `${runId}.stderr.txt`), { flags: 'a' })

    const child = spawn(call.file, call.args, {
        cwd,
        env: { ...childEnv(), ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    })
    const record: Hosted = { child, startedAt: Date.now(), endedAt: null, exitCode: null }
    hosted.set(runId, record)

    child.stdout?.pipe(events)
    child.stderr?.pipe(errors)
    child.on('error', (error) => {
        errors.write(`\n${error.message}\n`)
    })
    child.on('exit', (code) => {
        record.endedAt = Date.now()
        record.exitCode = code ?? -1
        events.end()
        errors.end()
    })

    await new Promise<void>((resolve, reject) => {
        child.once('spawn', () => resolve())
        child.once('error', (error) => reject(error))
    })
}

export function liveness(run: Run): Liveness {
    const record = hosted.get(run.runId)
    if (!record) return 'dead'
    return record.exitCode === null ? 'alive' : 'dead'
}

export function orphaned(run: Run): boolean {
    return !hosted.has(run.runId)
}

export function exitCode(run: Run): number | null {
    return hosted.get(run.runId)?.exitCode ?? null
}

export async function stop(run: Run): Promise<void> {
    const record = hosted.get(run.runId)
    if (!record || record.exitCode !== null) return
    const pid = record.child.pid
    if (process.platform === 'win32' && pid) {
        await new Promise<void>((resolve) => {
            const killer = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true })
            killer.on('exit', () => resolve())
            killer.on('error', () => resolve())
        })
        return
    }
    record.child.kill()
}

export async function events(run: Run): Promise<{ lines: string[]; modifiedAt: number } | null> {
    const path = eventsPath(run)
    const info = await stat(path).catch(() => null)
    if (!info) return null
    let raw = ''
    try {
        raw = await readFile(path, 'utf-8')
    } catch {
        return null
    }
    return { lines: raw.split('\n').filter((line) => line.trim()), modifiedAt: info.mtimeMs }
}

export async function final(run: Run): Promise<string | null> {
    return readFile(finalPath(run), 'utf-8').catch(() => null)
}

export async function stderr(run: Run): Promise<string> {
    return readFile(stderrPath(run), 'utf-8').catch(() => '')
}

export function parseLine(line: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(line) as unknown
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
        return null
    }
}

export function tail(run: Run): Invocation {
    const path = eventsPath(run)
    if (process.platform === 'win32') {
        return {
            file: 'powershell.exe',
            args: ['-NoProfile', '-Command', `Get-Content -LiteralPath '${path.replace(/'/g, "''")}' -Wait -Tail ${TAIL_LINES}`]
        }
    }
    return { file: 'tail', args: ['-n', String(TAIL_LINES), '-f', path] }
}
