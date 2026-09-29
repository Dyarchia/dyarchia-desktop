import { app, ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { busy, migrate, pending } from './migrate'

/*
 * One directory holds everything this application keeps: `%APPDATA%\dyarchia`, Electron's own
 * `appData` joined with the name, which on Windows is where an application's state belongs and on
 * every platform is derived per user rather than written down. `DYARCHIA_HOME` moves the whole of it.
 *
 * The program is not in it. The installer puts that in `%LOCALAPPDATA%\Programs\dyarchia`, the
 * per-user default, so uninstalling removes the program and nothing the user made.
 *
 * Inside, everything at the top is machine state, rebuildable and uninteresting, and `data/` is
 * what plugins produce on the user's behalf, such as a corpus repository. It is never under
 * `Documents`, which a machine with OneDrive signed in redirects into a sync client.
 */

const OLD_ROOT = '.dyarchia'

let kept: string | null = null

export function root(): string {
    return kept ?? (process.env['DYARCHIA_HOME'] || join(app.getPath('appData'), 'dyarchia'))
}

export function dataHome(): string {
    return process.env['DYARCHIA_DATA_HOME'] || join(root(), 'data')
}

/*
 * Point Electron at the root, carrying the previous one, `~/.dyarchia`, into it once.
 *
 * Synchronous and before `app.whenReady()`, because `userData` is read when the first session is
 * created and nothing may hold a database or a profile open while it moves. What moves and what is
 * rebuilt instead is `migrate.ts`'s to say.
 *
 * **An old root still in use keeps this session on it.** A running copy of an older version holds
 * its profile's lock, and moving its boards from under it reads as data loss in both windows. So
 * the move waits for a launch with nothing else running, and until then this one works where the
 * data is.
 *
 * An explicit `--user-data-dir` or `DYARCHIA_HOME` wins over all of it and migrates nothing: they
 * are how an instance is run against a throwaway profile, and one that touched the real root
 * would make its own state impossible to isolate.
 */
export function adoptUserData(): void {
    if (process.argv.some((argument) => argument.startsWith('--user-data-dir'))) return

    const target = root()
    const old = join(homedir(), OLD_ROOT)
    if (!process.env['DYARCHIA_HOME'] && pending(old)) {
        if (busy(old)) {
            console.warn(`[paths] ${old} is in use by another instance, so this session keeps it`)
            kept = old
            app.setPath('userData', old)
            separateWorkspace()
            return
        }
        const result = migrate(old, target)
        if (result.moved.length) console.log(`[paths] moved into ${target}: ${result.moved.join(', ')}`)
        if (result.dropped.length) console.log(`[paths] dropped to rebuild: ${result.dropped.join(', ')}`)
        if (result.skipped.length) console.warn(`[paths] kept in ${old}, already in ${target}: ${result.skipped.join(', ')}`)
        if (result.failed.length) console.warn(`[paths] left in ${old}: ${result.failed.join(', ')}`)
    }
    app.setPath('userData', target)
    separateWorkspace()
}

/*
 * A workspace build and an installed one are two applications over the same data, and they run
 * at the same time as a matter of course. What they must not share is what each one holds open or
 * rewrites on every change: Chromium's profile, which the first instance locks, so the second logs
 * `Unable to move the cache` and runs without one; and the saved layout, which each window
 * overwrites with its own panels. So the unpackaged build keeps both under `workspace/`, and
 * everything that is the user's, boards, environments, offers, corpora, stays in the one root.
 * The first workspace launch starts from the shared layout rather than from an empty window.
 */
export function workspaceHome(): string | null {
    return app.isPackaged ? null : join(app.getPath('userData'), 'workspace')
}

function separateWorkspace(): void {
    const home = workspaceHome()
    if (!home) return
    app.setPath('sessionData', home)
    const shared = join(app.getPath('userData'), 'layout.json')
    const own = join(home, 'layout.json')
    if (!existsSync(own) && existsSync(shared)) {
        mkdirSync(home, { recursive: true })
        copyFileSync(shared, own)
    }
}

export async function ensureDataHome(): Promise<string> {
    const home = dataHome()
    await mkdir(home, { recursive: true }).catch(() => undefined)
    return home
}

export function registerPaths(): void {
    ipcMain.handle('shell:app:paths', async () => ({
        dataHome: await ensureDataHome(),
        userData: app.getPath('userData'),
        application: app.isPackaged ? join(app.getAppPath(), '..', '..') : app.getAppPath()
    }))
}
