import { mkdir, readFile, rm } from 'node:fs/promises'
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

export function decide(held: Held | null, owner: string, now: number, ttl = TTL_MS): Decision {
    if (!held) return 'take'
    if (held.owner === owner) return 'renew'
    return now - held.at > ttl ? 'take' : 'wait'
}

export async function read(): Promise<Held | null> {
    try {
        const parsed = JSON.parse(await readFile(path(), 'utf-8')) as Held
        if (typeof parsed?.owner !== 'string' || typeof parsed?.at !== 'number') return null
        return parsed
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

export async function drop(owner: string): Promise<void> {
    const held = await read()
    if (held?.owner !== owner) return
    await rm(path(), { force: true }).catch(() => undefined)
}
