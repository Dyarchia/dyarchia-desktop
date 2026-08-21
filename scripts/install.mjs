import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const manifestPath = join(repoRoot, 'dyarchia-plugin.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

const roots = {
    win32: () => join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'dyarchia', 'plugins'),
    darwin: () => join(homedir(), 'Library', 'Application Support', 'dyarchia', 'plugins'),
    linux: () => join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'dyarchia', 'plugins')
}

const pick = roots[process.platform] ?? roots.linux
const target = join(pick(), manifest.id)

if (!existsSync(join(repoRoot, 'dist', 'renderer.js'))) {
    console.error('dist/renderer.js is missing. Run "pnpm build" first.')
    process.exit(1)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(manifestPath, join(target, 'dyarchia-plugin.json'))
await cp(join(repoRoot, 'dist'), join(target, 'dist'), { recursive: true })
await writeFile(
    join(target, 'package.json'),
    JSON.stringify({ name: manifest.id, version: manifest.version, private: true, type: 'module' }, null, 4)
)

console.log(`installed ${manifest.id} ${manifest.version} -> ${target}`)
