import { cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

function isCheckout(path) {
    return existsSync(join(path, 'css', 'dyarchia.css'))
}

function findUpwards() {
    let dir = repoRoot
    while (true) {
        const candidate = join(dir, 'dyarchia-ui')
        if (isCheckout(candidate)) return candidate
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

const source = process.env.DYARCHIA_UI ? resolve(process.env.DYARCHIA_UI) : findUpwards()

if (!source || !isCheckout(source)) {
    console.error('no dyarchia-ui checkout found; set DYARCHIA_UI to its path')
    process.exit(1)
}

const target = join(repoRoot, 'packages', 'ui')
for (const folder of ['css', 'fonts']) {
    await rm(join(target, folder), { recursive: true, force: true })
    await cp(join(source, folder), join(target, folder), { recursive: true })
    console.log(`synced ${folder}/ from ${source}`)
}
