import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/*
 * Collect every plugin into one directory, for the installer to carry or for a dev machine to
 * install into %APPDATA%.
 *
 * What each plugin is made of is read from its own manifest, never guessed. The script this
 * replaced decided by looking for a `dist/` and skipping the plugin that had none, which is how
 * crawlee came to be left out of every packaged build for a reason nobody had chosen — and how any
 * plugin that grew a `dist/` would have started shipping itself with nobody choosing that either.
 *
 * Three manifest fields say what to take beyond the entry points: `files` for anything else the
 * plugin needs at runtime, `nativeDeps` for packages that must travel with their prebuilt binaries,
 * and `schemes`, which the shell already reads. A plugin that declares nothing is its manifest plus
 * its renderer and main, and that is most of them.
 */

const MANIFEST_FILE = 'dyarchia-plugin.json'

/* Debug symbols, which are a third of node-pty and useless in an installer. */
const NEVER = new Set(['.pdb'])

function wanted(source) {
    return !NEVER.has(source.slice(source.lastIndexOf('.')))
}

function entryPoints(manifest) {
    const paths = [manifest.renderer, manifest.main, manifest.python].filter(Boolean)
    /* A bundle in dist/ travels with the rest of dist/: esbuild splits chunks into it. */
    return [...new Set(paths.map((path) => (path.startsWith('dist/') ? 'dist' : path)))]
}

export async function stagePlugins(pluginsDir, targetRoot, { onPlugin } = {}) {
    const staged = []
    for (const entry of await readdir(pluginsDir)) {
        const pluginDir = join(pluginsDir, entry)
        const manifestPath = join(pluginDir, MANIFEST_FILE)
        if (!existsSync(manifestPath)) continue

        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
        const parts = [...entryPoints(manifest), ...(manifest.files ?? [])]

        const missing = parts.filter((part) => !existsSync(join(pluginDir, part)))
        if (missing.length > 0) {
            throw new Error(
                `${manifest.id} declares ${missing.join(', ')}, which is not there. ` +
                    'Run "pnpm build" first.'
            )
        }

        const target = join(targetRoot, manifest.id)
        await rm(target, { recursive: true, force: true })
        await mkdir(target, { recursive: true })
        await cp(manifestPath, join(target, MANIFEST_FILE))

        for (const part of parts) {
            await cp(join(pluginDir, part), join(target, part), {
                recursive: true,
                filter: wanted
            })
        }

        for (const dep of manifest.nativeDeps ?? []) {
            const from = resolve(pluginDir, 'node_modules', dep)
            if (!existsSync(from)) {
                throw new Error(`${manifest.id} declares native dep ${dep}, which is not installed`)
            }
            await cp(from, join(target, 'node_modules', dep), {
                recursive: true,
                dereference: true,
                filter: wanted
            })
        }

        staged.push(manifest.id)
        onPlugin?.(manifest.id, target)
    }
    return staged
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
    const repoRoot = resolve(import.meta.dirname, '..')
    const target = process.argv[2]
        ? resolve(process.argv[2])
        : join(repoRoot, 'apps', 'shell', 'build', 'plugins')

    await mkdir(dirname(target), { recursive: true })
    const staged = await stagePlugins(join(repoRoot, 'plugins'), target, {
        onPlugin: (id, where) => console.log(`staged ${id} -> ${where}`)
    })
    console.log(`${staged.length} plugins staged`)
}
