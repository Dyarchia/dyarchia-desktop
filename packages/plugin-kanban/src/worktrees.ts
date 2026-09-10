import { execFile } from 'node:child_process'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { Refusal } from './refusal.js'

const IGNORED = '.claude/worktrees/'
const MARKER = '# dyarchia kanban worktrees, written by the board that points here'

export interface Listed {
    path: string
    branch: string | null
    head: string | null
    locked: string | null
}

export interface Worktree extends Listed {
    landed: boolean
    dirty: boolean
    ahead: number
    live: boolean
}

export interface IgnoreState {
    tracked: boolean
    ignored: boolean
}

interface Ran {
    ok: boolean
    out: string
    err: string
}

function run(cwd: string, args: string[]): Promise<Ran> {
    return new Promise((done) => {
        execFile('git', args, { cwd, timeout: 15_000, windowsHide: true }, (error, out, err) =>
            done({ ok: !error, out: String(out).trim(), err: String(err).trim() })
        )
    })
}

export function parseList(text: string): Listed[] {
    const found: Listed[] = []
    let entry: Listed | null = null

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) {
            if (entry) found.push(entry)
            entry = null
            continue
        }
        const at = line.indexOf(' ')
        const key = at < 0 ? line : line.slice(0, at)
        const value = at < 0 ? '' : line.slice(at + 1)

        if (key === 'worktree') {
            if (entry) found.push(entry)
            entry = { path: normalize(value), branch: null, head: null, locked: null }
            continue
        }
        if (!entry) continue
        if (key === 'HEAD') entry.head = value
        if (key === 'branch') entry.branch = value.replace(/^refs\/heads\//, '')
        if (key === 'locked') entry.locked = value || 'locked, with no reason given'
    }

    if (entry) found.push(entry)
    return found
}

export function same(left: string, right: string): boolean {
    const clean = (value: string): string => {
        const trimmed = normalize(value).replace(/[\\/]+$/, '')
        return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
    }
    return clean(left) === clean(right)
}

export function ours(workdir: string, path: string): boolean {
    const root = normalize(join(workdir, '.claude', 'worktrees'))
    const step = relative(root, normalize(path))
    return step !== '' && !step.startsWith('..') && !isAbsolute(step)
}

export async function list(workdir: string): Promise<Worktree[]> {
    const listed = await run(workdir, ['worktree', 'list', '--porcelain'])
    if (!listed.ok) return []

    const found: Worktree[] = []
    for (const entry of parseList(listed.out)) {
        if (!ours(workdir, entry.path)) continue

        const landed = entry.branch
            ? (await run(workdir, ['merge-base', '--is-ancestor', entry.branch, 'HEAD'])).ok
            : false
        const counted = entry.branch
            ? await run(workdir, ['rev-list', '--count', `HEAD..${entry.branch}`])
            : null
        const dirty = (await run(entry.path, ['status', '--porcelain'])).out.length > 0

        found.push({
            ...entry,
            landed,
            dirty,
            ahead: counted?.ok ? Number(counted.out) || 0 : 0,
            live: false
        })
    }

    return found
}

export async function remove(workdir: string, path: string, branch: string | null): Promise<void> {
    if (!ours(workdir, path)) throw new Refusal('that is not a worktree this board made')

    if (branch && !(await run(workdir, ['merge-base', '--is-ancestor', branch, 'HEAD'])).ok) {
        throw new Refusal(`${branch} holds commits this project has not landed`)
    }

    if ((await run(path, ['status', '--porcelain'])).out.length > 0) {
        throw new Refusal(`${branch ?? path} holds changes nobody committed`)
    }

    const listed = parseList((await run(workdir, ['worktree', 'list', '--porcelain'])).out)
    const held = listed.find((entry) => same(entry.path, path))
    if (held?.locked) {
        const unlocked = await run(workdir, ['worktree', 'unlock', path])
        if (!unlocked.ok) throw new Refusal(unlocked.err || `git would not unlock ${path}`)
    }

    const removed = await run(workdir, ['worktree', 'remove', path])
    if (!removed.ok) throw new Refusal(removed.err || `git would not remove ${path}`)

    if (branch) {
        const deleted = await run(workdir, ['branch', '-d', branch])
        if (!deleted.ok) throw new Refusal(deleted.err || `the worktree is gone, ${branch} is not`)
    }

    await run(workdir, ['worktree', 'prune'])
}

export async function state(workdir: string): Promise<IgnoreState> {
    const tracked = (await run(workdir, ['rev-parse', '--is-inside-work-tree'])).out === 'true'
    if (!tracked) return { tracked: false, ignored: false }
    return { tracked: true, ignored: (await run(workdir, ['check-ignore', IGNORED])).ok }
}

export async function ignore(workdir: string): Promise<IgnoreState> {
    const before = await state(workdir)
    if (!before.tracked || before.ignored) return before

    const common = await run(workdir, ['rev-parse', '--git-common-dir'])
    if (!common.ok) throw new Refusal('this project has no git directory to write to')

    const gitDir = isAbsolute(common.out) ? common.out : resolve(workdir, common.out)
    const path = join(gitDir, 'info', 'exclude')
    await mkdir(join(gitDir, 'info'), { recursive: true })

    const held = await readFile(path, 'utf-8').catch(() => '')
    if (held.split(/\r?\n/).some((line) => line.trim() === IGNORED)) return await state(workdir)

    const lead = held.length && !held.endsWith('\n') ? '\n' : ''
    await appendFile(path, `${lead}${MARKER}\n${IGNORED}\n`, 'utf-8')
    return await state(workdir)
}
