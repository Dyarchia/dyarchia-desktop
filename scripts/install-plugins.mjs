import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const packagesDir = join(repoRoot, 'packages')
const targetRoot = join(process.env.APPDATA, 'decimatio', 'plugins')

const NATIVE_DEPS = {
    terminal: ['node-pty']
}

const entries = await readdir(packagesDir)
for (const entry of entries) {
    const pluginDir = join(packagesDir, entry)
    const manifestPath = join(pluginDir, 'decimatio-plugin.json')
    if (!existsSync(manifestPath)) continue

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
    const target = join(targetRoot, manifest.id)
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    await cp(manifestPath, join(target, 'decimatio-plugin.json'))
    await cp(join(pluginDir, 'dist'), join(target, 'dist'), { recursive: true })

    for (const dep of NATIVE_DEPS[manifest.id] ?? []) {
        await cp(
            join(pluginDir, 'node_modules', dep),
            join(target, 'node_modules', dep),
            { recursive: true, dereference: true }
        )
    }
    console.log(`installed ${manifest.id} -> ${target}`)
}
