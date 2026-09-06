import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const target = join(repoRoot, 'packages', 'kanon')
const FOLDERS = ['css', 'fonts']
const FILES = ['README.md']
const CHECKOUT_NAME = 'dyarchia-kanon'
const optional = process.argv.includes('--if-present')

function isCheckout(path) {
    return Boolean(path) && existsSync(join(path, 'css', 'dyarchia.css'))
}

function findUpwards() {
    let dir = repoRoot
    while (true) {
        const candidate = join(dir, CHECKOUT_NAME)
        if (isCheckout(candidate)) return candidate
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

function fromEnvironment() {
    const value = process.env['DYARCHIA_KANON']
    if (!value) return null
    const path = resolve(value)
    if (isCheckout(path)) return path
    const message = `DYARCHIA_KANON is set to ${path}, which is not a ${CHECKOUT_NAME} checkout`
    if (optional) {
        console.log(`[sync-kanon] ${message} — keeping the vendored copy`)
        process.exit(0)
    }
    console.error(message)
    process.exit(1)
}

const source = fromEnvironment() ?? findUpwards()

if (!source) {
    const message = `no ${CHECKOUT_NAME} checkout found; set DYARCHIA_KANON to its path`
    if (optional) {
        console.log(`[sync-kanon] ${message} — keeping the vendored copy`)
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

for (const name of FILES) {
    const from = join(source, name)
    if (!existsSync(from)) continue
    const to = join(target, name)
    const next = Buffer.from((await readFile(from, 'utf-8')).replace(/\r\n/g, '\n'), 'utf-8')
    const current = existsSync(to) ? await readFile(to) : null
    if (current && current.equals(next)) continue
    await writeFile(to, next)
    changed.push(`${current ? 'updated' : 'added  '} ${name}`)
}

if (changed.length === 0) {
    console.log(`[sync-kanon] vendored copy already matches ${source}`)
} else {
    console.log(`[sync-kanon] synced from ${source}`)
    for (const line of changed) console.log(`[sync-kanon]   ${line}`)
}
