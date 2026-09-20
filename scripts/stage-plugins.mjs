import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

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

/*
 * A package that ships prebuilt binaries ships every target it supports, named for the platform
 * and architecture that can load it. node-pty carries six and weighs 11 MB; five of them are a
 * machine this build will never run on, and it is installed twice, so a Windows x64 installer was
 * carrying 12 MB of macOS and arm64 binaries. A directory named for a target that is not this
 * one is not copied, and because the whole subtree goes with it there is nothing left behind.
 */
const TARGET_DIR = /^(?:win32|win10|darwin|linux)-(?:x64|arm64|ia32|arm)$/
const PLATFORM_NAMES = { win32: ['win32', 'win10'], darwin: ['darwin'], linux: ['linux'] }

const RUNS_HERE = new Set(
    (PLATFORM_NAMES[process.platform] ?? [process.platform]).map((name) => `${name}-${process.arch}`)
)

function wanted(source) {
    const name = basename(source)
    if (NEVER.has(extname(name))) return false
    return !TARGET_DIR.test(name) || RUNS_HERE.has(name)
}

function entryPoints(manifest) {
    const paths = [manifest.renderer, manifest.main, manifest.python].filter(Boolean)
    /* A bundle in dist/ travels with the rest of dist/: esbuild splits chunks into it. */
    return [...new Set(paths.map((path) => (path.startsWith('dist/') ? 'dist' : path)))]
}

/*
 * A native dependency is staged once, beside the plugins rather than inside one of them, because
 * node resolution walks up from the file that asks for it: a main module in
 * <root>/<plugin>/dist reaches <root>/node_modules without knowing anything is there. node-pty is
 * declared by two plugins and weighed 7 MB in each, and neither plugin names or learns about the
 * other. Two plugins wanting different versions of the same package is refused rather than
 * resolved, because one copy cannot serve both and the wrong one loading is a native crash.
 */
async function stageNative(manifest, pluginDir, shared, held) {
    for (const dep of manifest.nativeDeps ?? []) {
        const from = resolve(pluginDir, 'node_modules', dep)
        if (!existsSync(from)) {
            throw new Error(`${manifest.id} declares native dep ${dep}, which is not installed`)
        }
        const { version } = JSON.parse(await readFile(join(from, 'package.json'), 'utf-8'))
        const already = held.get(dep)
        if (already && already.version !== version) {
            throw new Error(
                `${manifest.id} wants ${dep} ${version} and ${already.by} wants ${already.version}, ` +
                    'and one staged copy cannot serve both'
            )
        }
        if (already) continue
        held.set(dep, { version, by: manifest.id })
        await cp(from, join(shared, dep), { recursive: true, dereference: true, filter: wanted })
    }
}

export async function stagePlugins(pluginsDir, targetRoot, { onPlugin } = {}) {
    const staged = []
    const shared = join(targetRoot, 'node_modules')
    const held = new Map()
    await rm(shared, { recursive: true, force: true })
    /* It is a path the installer names, so it exists even in the build where nothing is in it. */
    await mkdir(shared, { recursive: true })
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

        await stageNative(manifest, pluginDir, shared, held)

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
