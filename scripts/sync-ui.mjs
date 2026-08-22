import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const target = join(repoRoot, 'packages', 'ui')
const FOLDERS = ['css', 'fonts']
const CHECKOUT_NAMES = ['dyarchia-kanon', 'dyarchia-ui']
const optional = process.argv.includes('--if-present')

function isCheckout(path) {
    return Boolean(path) && existsSync(join(path, 'css', 'dyarchia.css'))
}

function findUpwards() {
    let dir = repoRoot
    while (true) {
        for (const name of CHECKOUT_NAMES) {
            const candidate = join(dir, name)
            if (isCheckout(candidate)) return candidate
        }
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

function fromEnvironment() {
    for (const key of ['DYARCHIA_KANON', 'DYARCHIA_UI']) {
        const value = process.env[key]
        if (!value) continue
        const path = resolve(value)
        if (isCheckout(path)) return path
        const message = `${key} is set to ${path}, which is not a dyarchia-kanon checkout`
        if (optional) {
            console.log(`[sync-ui] ${message} — keeping the vendored copy`)
            process.exit(0)
        }
        console.error(message)
        process.exit(1)
    }
    return null
}

const source = fromEnvironment() ?? findUpwards()

if (!source) {
    const message = 'no dyarchia-kanon checkout found; set DYARCHIA_KANON to its path'
    if (optional) {
        console.log(`[sync-ui] ${message} — keeping the vendored copy`)
        process.exit(0)
    }
    console.error(message)
    process.exit(1)
}

async function filesUnder(root) {
    const found = []
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) found.push(relative(root, join(entry.parentPath, entry.name)))
    }
    return found
}

const changed = []

for (const folder of FOLDERS) {
    const sourceDir = join(source, folder)
    const targetDir = join(target, folder)
    const wanted = await filesUnder(sourceDir)

    for (const name of wanted) {
        const from = join(sourceDir, name)
        const to = join(targetDir, name)
        const next =
            extname(name) === '.css'
                ? Buffer.from((await readFile(from, 'utf-8')).replace(/\r\n/g, '\n'), 'utf-8')
                : await readFile(from)
        const current = existsSync(to) ? await readFile(to) : null
        if (current && current.equals(next)) continue
        await mkdir(dirname(to), { recursive: true })
        await writeFile(to, next)
        changed.push(`${current ? 'updated' : 'added  '} ${folder}/${name}`)
    }

    if (!existsSync(targetDir)) continue
    for (const name of await filesUnder(targetDir)) {
        if (wanted.includes(name)) continue
        await rm(join(targetDir, name))
        changed.push(`removed ${folder}/${name}`)
    }
}

if (changed.length === 0) {
    console.log(`[sync-ui] vendored copy already matches ${source}`)
} else {
    console.log(`[sync-ui] synced from ${source}`)
    for (const line of changed) console.log(`[sync-ui]   ${line}`)
}
