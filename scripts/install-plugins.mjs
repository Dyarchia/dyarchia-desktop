import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { stagePlugins } from './stage-plugins.mjs'

/*
 * Install every plugin where a packaged build looks for one, for testing an installed copy without
 * building an installer. What a plugin is made of is its manifest's business; this only says where
 * the copies go.
 */

const repoRoot = resolve(import.meta.dirname, '..')

/*
 * The same root the shell reads, derived the same way: Electron's appData joined with the name,
 * see apps/shell/src/main/paths.ts.
 */
const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || join(homedir(), '.config'))
const target = join(process.env.DYARCHIA_HOME || join(appData, 'dyarchia'), 'plugins')

await mkdir(target, { recursive: true })
const staged = await stagePlugins(join(repoRoot, 'plugins'), target, {
    onPlugin: (id, where) => console.log(`installed ${id} -> ${where}`)
})
console.log(`${staged.length} plugins installed`)
