import { mkdir, readFile } from 'node:fs/promises'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { root, writeAtomic } from './boards.js'

export const TTL_MS = 90_000

export interface Held {
    owner: string
    pid: number
    at: number
}

export type Decision = 'take' | 'renew' | 'wait'

function path(): string {
    return join(root(), 'dispatcher.json')
}

/*
 * A holder that is not running any more cannot be waited on: its lease is taken at once, and
 * the TTL only covers a holder that is alive and stopped renewing. Signal 0 tests existence
 * without touching the process; EPERM means it exists and belongs to somebody else.
 */
export function alive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
}

export function decide(
    held: Held | null,
    owner: string,
    now: number,
    ttl = TTL_MS,
    living: (pid: number) => boolean = alive
): Decision {
    if (!held) return 'take'
    if (held.owner === owner) return 'renew'
    if (!living(held.pid)) return 'take'
    return now - held.at > ttl ? 'take' : 'wait'
}

function parse(text: string): Held | null {
    const parsed = JSON.parse(text) as Held
    if (typeof parsed?.owner !== 'string' || typeof parsed?.at !== 'number') return null
    return { owner: parsed.owner, pid: typeof parsed.pid === 'number' ? parsed.pid : 0, at: parsed.at }
}

export async function read(): Promise<Held | null> {
    try {
        return parse(await readFile(path(), 'utf-8'))
    } catch {
        return null
    }
}

export async function hold(owner: string, now: number): Promise<boolean> {
    const held = await read()
    if (decide(held, owner, now) === 'wait') return false

    await mkdir(root(), { recursive: true })
    await writeAtomic(path(), JSON.stringify({ owner, pid: process.pid, at: now }, null, 4))

    const after = await read()
    return after?.owner === owner
}

/*
 * Synchronous on purpose: it runs from will-quit, and a promise started there may not settle
 * before the process is gone.
 */
export function drop(owner: string): void {
    let held: Held | null = null
    try {
        held = parse(readFileSync(path(), 'utf-8'))
    } catch {
        return
    }
    if (held?.owner !== owner) return
    try {
        rmSync(path(), { force: true })
    } catch {
        return
    }
}
