import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { stagePlugins } from './stage-plugins.mjs'

/*
 * Install every plugin where a packaged build looks for one, for testing an installed copy without
 * building an installer. What a plugin is made of is its manifest's business; this only says where
 * the copies go.
 */

const repoRoot = resolve(import.meta.dirname, '..')
const target = join(process.env.APPDATA, 'dyarchia', 'plugins')

await mkdir(target, { recursive: true })
const staged = await stagePlugins(join(repoRoot, 'plugins'), target, {
    onPlugin: (id, where) => console.log(`installed ${id} -> ${where}`)
})
console.log(`${staged.length} plugins installed`)
