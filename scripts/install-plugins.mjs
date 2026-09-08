import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const packagesDir = join(repoRoot, 'packages')
const targetRoot = join(process.env.APPDATA, 'dyarchia', 'plugins')

const NATIVE_DEPS = {
    terminal: ['node-pty'],
    kanban: ['node-pty']
}

const entries = await readdir(packagesDir)
for (const entry of entries) {
    const pluginDir = join(packagesDir, entry)
    const manifestPath = join(pluginDir, 'dyarchia-plugin.json')
    if (!existsSync(manifestPath)) continue

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
    const target = join(targetRoot, manifest.id)
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    await cp(manifestPath, join(target, 'dyarchia-plugin.json'))
    await cp(join(pluginDir, 'dist'), join(target, 'dist'), { recursive: true })

    if (manifest.python) {
        await cp(join(pluginDir, manifest.python), join(target, manifest.python))
    }

    for (const dep of NATIVE_DEPS[manifest.id] ?? []) {
        await cp(
            join(pluginDir, 'node_modules', dep),
            join(target, 'node_modules', dep),
            { recursive: true, dereference: true }
        )
    }
    console.log(`installed ${manifest.id} -> ${target}`)
}
