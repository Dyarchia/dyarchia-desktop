import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const USAGE = 'usage: node ../../scripts/build-plugin.mjs <renderer|main> [--splitting] [--css-text]'

const cwd = process.cwd()
const [entry, ...flags] = process.argv.slice(2)

if (entry !== 'renderer' && entry !== 'main') {
    console.error(USAGE)
    process.exit(1)
}

const unknown = flags.filter((flag) => !['--splitting', '--css-text'].includes(flag))
if (unknown.length > 0) {
    console.error(`unknown flag ${unknown.join(' ')}\n${USAGE}`)
    process.exit(1)
}

const source = join(cwd, 'src', `${entry}.ts`)
if (!existsSync(source)) {
    console.error(`no src/${entry}.ts in ${cwd}`)
    process.exit(1)
}

const require = createRequire(join(cwd, 'package.json'))
const esbuild = require('esbuild')

const common = {
    entryPoints: [source],
    bundle: true,
    format: 'esm',
    logLevel: 'info'
}

const options =
    entry === 'renderer'
        ? {
              ...common,
              ...(flags.includes('--splitting')
                  ? { splitting: true, outdir: join(cwd, 'dist') }
                  : { outfile: join(cwd, 'dist', 'renderer.js') }),
              ...(flags.includes('--css-text') ? { loader: { '.css': 'text' } } : {})
          }
        : {
              ...common,
              platform: 'node',
              external: ['electron'],
              outfile: join(cwd, 'dist', 'main.js')
          }

await esbuild.build(options)
