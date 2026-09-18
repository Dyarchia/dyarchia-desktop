import { app } from 'electron'
import { readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/*
 * The offer folder, <userData>/mcp, holds one file per plugin that can serve a tool over the Model
 * Context Protocol. A plugin writes its own file while it runs and withdraws it when it has nothing
 * to serve, and a plugin that launches agents reads the folder without knowing who wrote what.
 *
 * That leaves one case nobody owns. A plugin that is turned off never runs, so it never withdraws
 * anything, and its offer outlives it: the board keeps handing agents a tool belonging to a plugin
 * this installation was told not to load. The reader cannot fix it without learning what the shell
 * knows about enablement, which is the coupling the folder exists to avoid, so the shell withdraws
 * on the plugin's behalf instead, once per discovery.
 *
 * Only an offer whose plugin is present and disabled is withdrawn. One naming a plugin this
 * installation has never heard of is left alone: it is not ours to judge, and the reader already
 * drops an offer whose command has gone from disk.
 */

const FOLDER = 'mcp'

function folder(): string {
    return join(app.getPath('userData'), FOLDER)
}

export async function withdrawDisabledOffers(
    known: Set<string>,
    enabled: (id: string) => boolean
): Promise<string[]> {
    const names = await readdir(folder()).catch(() => [] as string[])
    const withdrawn: string[] = []
    for (const name of names) {
        if (!name.endsWith('.json')) continue
        const path = join(folder(), name)
        let plugin: unknown
        try {
            plugin = (JSON.parse(await readFile(path, 'utf-8')) as { plugin?: unknown })?.plugin
        } catch {
            continue
        }
        if (typeof plugin !== 'string' || !known.has(plugin) || enabled(plugin)) continue
        await unlink(path).catch(() => undefined)
        withdrawn.push(plugin)
    }
    return withdrawn
}
