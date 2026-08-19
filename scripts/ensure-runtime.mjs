import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const require = createRequire(join(repoRoot, 'apps/shell/package.json'))

function ensureElectron() {
    const packageJson = require.resolve('electron/package.json')
    const electronDir = dirname(packageJson)
    if (existsSync(join(electronDir, 'path.txt'))) return 'present'
    console.log('[ensure-runtime] electron binary missing, downloading…')
    execFileSync(process.execPath, [join(electronDir, 'install.js')], {
        cwd: electronDir,
        stdio: 'inherit'
    })
    if (!existsSync(join(electronDir, 'path.txt'))) {
        throw new Error('electron install did not produce path.txt')
    }
    return 'installed'
}

function ensurePython() {
    const candidates =
        process.platform === 'win32' ? [['py', ['-3', '-V']]] : [['python3', ['-V']]]
    for (const [command, args] of candidates) {
        try {
            const version = execFileSync(command, args, { encoding: 'utf-8' }).trim()
            return `${command} (${version})`
        } catch {
            continue
        }
    }
    return null
}

const electron = ensureElectron()
console.log(`[ensure-runtime] electron: ${electron}`)

const python = ensurePython()
if (python) {
    console.log(`[ensure-runtime] python: ${python}`)
} else {
    console.warn(
        '[ensure-runtime] python not found — the daemon and python plugins will be disabled.\n' +
            '                 install Python 3.11+ and re-run, or set DYARCHIA_PYTHON to an interpreter path.'
    )
}
