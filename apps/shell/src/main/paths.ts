import { app, ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/*
 * One directory holds everything this application keeps, and it is `~/.dyarchia`.
 *
 * It used to be two, in the two places Windows offers and neither of which the user picked:
 * Electron's `userData` under `%APPDATA%`, and the data home under `Documents`. Both were wrong
 * for the same reason. `%APPDATA%` is somewhere nobody navigates to, so the state of the
 * application was effectively invisible; and `app.getPath('documents')` is the one path a machine
 * redirects — on any Windows with OneDrive signed in it answers `…/OneDrive/Documentos`, which is
 * a sync client pointed at a git checkout that a crawl rewrites.
 *
 * A dot directory in the home directory is the convention the tools this one sits beside already
 * use, it is derived per user rather than written down, and it is one place to look, one place to
 * back up and one place to delete. `DYARCHIA_HOME` moves the whole of it.
 *
 * Inside, the split that mattered survives as a subdirectory rather than as a second root:
 * everything at the top is machine state, rebuildable and uninteresting, and `data/` is what
 * plugins produce on the user's behalf — a corpus repository is hundreds of megabytes of their own
 * material, cloned and committed on its own. Setup prints that path with a button that opens it.
 */

const LEGACY = 'dyarchia'

export function root(): string {
    return process.env['DYARCHIA_HOME'] || join(homedir(), '.dyarchia')
}

export function dataHome(): string {
    return process.env['DYARCHIA_DATA_HOME'] || join(root(), 'data')
}

/*
 * Move one tree into another, entry by entry, without overwriting anything already there.
 *
 * A single `rename` of the whole directory is what this wanted to be, and it is wrong, because the
 * destination is not reliably absent. The first attempt at this migration ran inside a dev
 * instance that `electron-vite --watch` had just restarted: the rename failed on a profile the
 * same process tree still held open, and the fallback then created the new root anyway. A guard
 * that reads "the target exists, so this already happened" would have refused to migrate that
 * machine ever again, with every board still sitting in the old directory.
 *
 * So it grafts instead. A path the target does not have is moved; a path it has is recursed into
 * when both sides are directories and left alone otherwise, because the newer session's copy is
 * the live one. Directories emptied by the walk are removed, and anything left behind is still
 * there to look at rather than silently gone.
 */
function graft(from: string, to: string): number {
    mkdirSync(to, { recursive: true })
    let moved = 0
    for (const entry of readdirSync(from)) {
        const source = join(from, entry)
        const destination = join(to, entry)
        if (!existsSync(destination)) {
            renameSync(source, destination)
            moved += 1
        } else if (statSync(source).isDirectory() && statSync(destination).isDirectory()) {
            moved += graft(source, destination)
        }
    }
    if (readdirSync(from).length === 0) rmdirSync(from)
    return moved
}

/*
 * Point Electron at that directory, carrying an older installation's state with it.
 *
 * Synchronous and before `app.whenReady()`, because `userData` is read when the first session is
 * created and a path set afterwards is a path nothing uses. It is a move rather than a copy, so
 * there is no second copy to go stale, and what travels is real: the saved layout, the enabled
 * list, the Python environments Setup built, the MCP offers and the kanban boards, which are
 * somebody's actual work.
 *
 * **A move that fails keeps the old root for that session.** Another instance running out of the
 * old directory holds files open and Windows refuses the rename, which is not exotic — it is how
 * this was discovered. Pointing at the new root anyway starts the application on a directory with
 * no boards and no layout, which reads as data loss even though nothing was lost. Staying where
 * the data is says what happened, and the next launch tries again.
 *
 * An explicit `--user-data-dir` wins over all of it. It is Chromium's own switch, it is how a
 * second instance is run against a throwaway profile, and an application that overrode it would
 * make its own state impossible to isolate.
 */
export function adoptUserData(): void {
    if (process.argv.some((argument) => argument.startsWith('--user-data-dir'))) return

    const target = root()
    const legacy = join(app.getPath('appData'), LEGACY)
    /*
     * Electron recreates the default `userData` directory while the `app` module initialises,
     * which is before any of this runs, so the old root is back — empty — on every launch of a
     * machine that migrated long ago. The graft removes it again for nothing, and says so only
     * when something actually travelled: a line reporting a migration of zero entries on every
     * start is a log that contradicts what happened.
     */
    if (existsSync(legacy)) {
        try {
            const moved = graft(legacy, target)
            if (moved > 0) {
                console.log(`[paths] moved ${moved} entries from ${legacy} into ${target}`)
            }
        } catch (error) {
            console.error(
                `[paths] ${legacy} could not be moved into ${target}, so this session keeps using it`,
                error
            )
            app.setPath('userData', legacy)
            separateWorkspace()
            return
        }
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
