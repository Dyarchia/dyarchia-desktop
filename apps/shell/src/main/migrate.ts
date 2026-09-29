import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/*
 * One move of an older root into the new one, child by child, and never over anything.
 *
 * Three kinds of child are not moved. `app/` is the program an older installer put there, and it
 * may be the very binary still running; its own uninstaller removes it. `environments/` holds
 * virtual environments, whose scripts and `pyvenv.cfg` carry absolute paths, so a moved one is a
 * broken one: it is deleted and Setup builds it again where it now belongs. The offers in `mcp/`
 * and the board's `kanban/mcp.json` name the old program and the old environments, so they are
 * deleted too and written again by whoever owns them.
 *
 * Everything else is renamed, which is instant on one volume and leaves a git repository intact,
 * since the corpora keep no worktrees. A path the destination already holds is never overwritten:
 * a directory on both sides is walked into, a file on both sides stays where it is and is named
 * in `skipped`. A rename that fails, a locked file or a second volume, leaves the source in place
 * and is named in `failed`, so nothing that did not arrive is ever lost, and the next launch tries
 * again. The old root is removed only once it is empty.
 */

const LEFT = new Set(['app'])
const REBUILT = [['environments'], ['mcp'], ['kanban', 'mcp.json']]
const LOCKS = [['lockfile'], ['workspace', 'lockfile']]

export interface Migration {
    moved: string[]
    skipped: string[]
    failed: string[]
    dropped: string[]
}

/*
 * Whether a Chromium instance holds the old root. On Windows the profile's `lockfile` is open
 * without sharing for as long as its instance runs, so deleting it fails exactly then, and a
 * stale one left by a crash is simply gone, which Chromium recreates anyway.
 */
export function busy(from: string): boolean {
    for (const parts of LOCKS) {
        const lock = join(from, ...parts)
        if (!existsSync(lock)) continue
        try {
            unlinkSync(lock)
        } catch {
            return true
        }
    }
    return false
}

export function pending(from: string): boolean {
    if (!existsSync(from)) return false
    try {
        return readdirSync(from).some((entry) => !LEFT.has(entry))
    } catch {
        return false
    }
}

function graft(from: string, to: string, relative: string, result: Migration): void {
    for (const entry of readdirSync(from)) {
        if (!relative && LEFT.has(entry)) continue
        const source = join(from, entry)
        const destination = join(to, entry)
        const name = relative ? `${relative}/${entry}` : entry
        if (!existsSync(destination)) {
            try {
                renameSync(source, destination)
                result.moved.push(name)
            } catch (error) {
                result.failed.push(`${name} (${(error as NodeJS.ErrnoException).code ?? 'error'})`)
            }
        } else if (statSync(source).isDirectory() && statSync(destination).isDirectory()) {
            graft(source, destination, name, result)
        } else {
            result.skipped.push(name)
        }
    }
    try {
        if (readdirSync(from).length === 0) rmdirSync(from)
    } catch {
        return
    }
}

export function migrate(from: string, to: string): Migration {
    const result: Migration = { moved: [], skipped: [], failed: [], dropped: [] }
    for (const parts of REBUILT) {
        const path = join(from, ...parts)
        if (!existsSync(path)) continue
        try {
            rmSync(path, { recursive: true, force: true, maxRetries: 2 })
            result.dropped.push(parts.join('/'))
        } catch (error) {
            result.failed.push(`${parts.join('/')} (${(error as NodeJS.ErrnoException).code ?? 'error'})`)
        }
    }
    mkdirSync(to, { recursive: true })
    graft(from, to, '', result)
    return result
}
