#!/usr/bin/env node
/*
 * Cutting a release, as the one command that does every part of it.
 *
 * It exists because an installed copy now looks for a newer one, and what it reads is `latest.yml`
 * out of the newest release's assets. That file is produced by `electron-builder --publish` and by
 * nothing else, so a release uploaded by hand -- which is how every release before this one was
 * cut -- is a release no installed copy can see. A step that is easy to forget and silent when
 * forgotten does not belong in a README.
 *
 * Nothing is published without `--publish`. Without it this prints what it would do and stops,
 * which is also how to check that the tree, the branch and the version agree before spending
 * fifteen minutes on a build.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'apps', 'shell', 'release')

const wanted = new Set(process.argv.slice(2))
const publishing = wanted.has('--publish')
const pruning = !wanted.has('--keep-old')

function run(command, args, options = {}) {
    return execFileSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: options.quiet ? 'pipe' : 'inherit',
        shell: process.platform === 'win32',
        ...options
    })
}

/*
 * electron-builder uploads with a token out of the environment and stops with a message about
 * GH_TOKEN when there is none. `gh` is already authenticated on any machine that can cut a
 * release, so its token is borrowed rather than asked for -- one fewer secret to keep somewhere
 * and one fewer way for a fifteen-minute build to end in an upload that cannot happen.
 */
function token() {
    const held = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    if (held) return held
    try {
        return read('gh', ['auth', 'token'])
    } catch {
        throw new Error('no GH_TOKEN and `gh auth token` gave nothing. Run `gh auth login`')
    }
}

function read(command, args) {
    return run(command, args, { quiet: true, stdio: 'pipe' }).trim()
}

function version() {
    const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8')).version
    const top = read('package.json')
    const shell = read('apps/shell/package.json')
    if (top !== shell) {
        throw new Error(`package.json says ${top} and apps/shell/package.json says ${shell}`)
    }
    return top
}

/*
 * The three things that make a release the released state rather than a build of whatever was
 * lying around: master, a clean tree, and a version nothing has already claimed.
 */
function refuseUnlessReleasable(tag) {
    const branch = read('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (branch !== 'master') {
        throw new Error(`on ${branch}. A release is cut from master, which is the released state`)
    }

    if (read('git', ['status', '--porcelain'])) {
        throw new Error('the working tree has changes. A release is a commit, not a directory')
    }

    const tags = read('git', ['tag', '--list', tag])
    if (tags) {
        throw new Error(`${tag} already exists. Bump the version in both package.json files first`)
    }
}

/*
 * Only the newest release stays. This is what the repository has always done -- an alpha that
 * publishes five installers offers five wrong answers to somebody arriving at the releases page --
 * and it is what the updater needs, since it reads the newest release and nothing else. The tags
 * stay: they are the history, and deleting one rewrites what a commit meant.
 */
function pruneReleases(keep) {
    const listed = JSON.parse(read('gh', ['release', 'list', '--limit', '50', '--json', 'tagName']))
    const older = listed.map((entry) => entry.tagName).filter((tag) => tag !== keep)
    for (const tag of older) {
        console.log(`  removing release ${tag}, keeping its tag`)
        run('gh', ['release', 'delete', tag, '--yes'])
    }
    return older
}

function pruneInstallers(keep) {
    if (!existsSync(releaseDir)) return []
    const gone = []
    for (const name of readdirSync(releaseDir)) {
        if (!name.endsWith('.exe') || name.includes(keep)) continue
        console.log(`  removing ${name}`)
        rmSync(join(releaseDir, name))
        gone.push(name)
    }
    return gone
}

const tag = `v${version()}`

if (!publishing) {
    console.log(`would cut ${tag}`)
    console.log('  pnpm -r build, stage the plugins, electron-vite build')
    console.log('  electron-builder --win --publish always')
    console.log(`  git tag ${tag} && git push origin ${tag}`)
    if (pruning) console.log('  then delete every older release and older local installer')
    console.log('\nnothing was done. Pass --publish to do it.')
    process.exit(0)
}

refuseUnlessReleasable(tag)

console.log(`cutting ${tag}`)
run('git', ['tag', tag])
run('git', ['push', 'origin', tag])

/*
 * The steps `pnpm package` wraps, spelled out, because the publish flag has to reach
 * electron-builder itself and a script that forwards it through two layers of package manager is
 * a thing to debug rather than a thing to trust. `prepackage` is what stages the plugins and the
 * native dependencies beside them, so it runs here by name.
 */
process.env.GH_TOKEN = token()

run('pnpm', ['-r', 'build'])
run('node', ['scripts/ensure-runtime.mjs'])
run('node', ['scripts/stage-plugins.mjs'])
run('pnpm', ['--filter', '@dyarchia/shell', 'exec', 'electron-vite', 'build'])
run('pnpm', [
    '--filter',
    '@dyarchia/shell',
    'exec',
    'electron-builder',
    '--win',
    '--publish',
    'always'
])

if (pruning) {
    console.log('pruning what this one replaces')
    pruneReleases(tag)
    pruneInstallers(version())
}

console.log(`\n${tag} is published. An installed copy finds it within a minute of its next start.`)
