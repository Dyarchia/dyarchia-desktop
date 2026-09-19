import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/*
 * Which plugins this installation has been told to load, and which ones it never asks about.
 *
 * The application is not an empty shell any more. A window with one gear in it is a question asked
 * of somebody who has not seen the product yet, and the four plugins below are the product: Setup,
 * a terminal, a reader and a player. They cost nothing to carry, they need no toolchain, and every
 * one of them works the moment the window opens. They are not listed as choices because there is
 * no version of this application that is better without them.
 *
 * What stays a choice is the plugin that reaches outside for something. kanban needs the Claude
 * Code CLI and spends money on a real account; crawlee needs an interpreter, a package set and a
 * browser, upwards of a gigabyte. Those are the ones worth a tick, and asking about them is the
 * whole reason the setup panel exists.
 *
 * The file holds what was enabled rather than what was disabled. A plugin added in a later version
 * therefore arrives off, which is the answer that never surprises anybody: an update does not grow
 * the application behind the user's back.
 *
 * None of that applies to a development build. A plugin in the workspace is there because somebody
 * is working on it, and making them answer a panel before their own tree loads is a question with
 * one possible answer. `pnpm dev` therefore loads everything, and `DYARCHIA_SETUP=1` is how the
 * first run a user gets is reproduced on purpose, for working on the panel itself.
 */

const ALWAYS = new Set(['settings', 'terminal', 'docviewer', 'player'])

export function isCore(id: string): boolean {
    return ALWAYS.has(id)
}

let cached: Set<string> | null = null

function storePath(): string {
    return join(app.getPath('userData'), 'plugins.json')
}

function everything(packaged: boolean): boolean {
    return !packaged && process.env['DYARCHIA_SETUP'] !== '1'
}

export async function loadEnabled(): Promise<Set<string>> {
    if (cached) return cached
    try {
        const parsed: unknown = JSON.parse(await readFile(storePath(), 'utf-8'))
        const listed = Array.isArray(parsed) ? parsed : (parsed as { enabled?: unknown })?.enabled
        cached = new Set(Array.isArray(listed) ? listed.filter((id) => typeof id === 'string') : [])
    } catch {
        cached = new Set()
    }
    return cached
}

export async function saveEnabled(ids: string[]): Promise<string[]> {
    const kept = [...new Set(ids.filter((id) => typeof id === 'string' && !ALWAYS.has(id)))].sort()
    const path = storePath()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ enabled: kept }, null, 2), 'utf-8')
    cached = new Set(kept)
    return kept
}

export function isEnabled(id: string, enabled: Set<string>, packaged: boolean): boolean {
    return ALWAYS.has(id) || everything(packaged) || enabled.has(id)
}

/*
 * Whether a first run has happened. Absent rather than empty is the distinction: a user who opened
 * the setup panel and turned everything off has answered the question, and must not be asked it
 * again on the next launch.
 */
export async function hasChosen(): Promise<boolean> {
    try {
        await readFile(storePath(), 'utf-8')
        return true
    } catch {
        return false
    }
}
