import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as board from '../src/board.js'
import * as boards from '../src/boards.js'
import { adopt } from '../src/dispatch.js'
import { liveness, parseLaunch } from '../src/agents.js'
import { strays } from '../src/artifacts.js'
import { decide, drop, hold, read as readLease, TTL_MS } from '../src/lease.js'
import { parseTerminal } from '../src/worker.js'
import { ours, parseList, same } from '../src/worktrees.js'
import type { SessionRecord } from '../src/agents.js'

let passed = 0
let failed = 0

function check(name: string, got: unknown, want: unknown): void {
    const a = JSON.stringify(got)
    const b = JSON.stringify(want)
    if (a === b) {
        passed += 1
        console.log(`  ok    ${name}`)
        return
    }
    failed += 1
    console.log(`  FAIL  ${name}\n        got  ${a}\n        want ${b}`)
}

async function refuses(name: string, run: () => Promise<unknown>, fragment: string): Promise<void> {
    try {
        await run()
        failed += 1
        console.log(`  FAIL  ${name}\n        it was accepted`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes(fragment)) {
            passed += 1
            console.log(`  ok    ${name}`)
            return
        }
        failed += 1
        console.log(`  FAIL  ${name}\n        got  ${message}\n        want ...${fragment}...`)
    }
}

function sessions(state: string): SessionRecord[] {
    return [
        {
            shortId: 'aaaaaaaa',
            sessionId: 'aaaaaaaa-1111-2222-3333-444444444444',
            cwd: 'C:\\somewhere',
            name: 'a card',
            state,
            status: state === 'working' ? 'busy' : 'idle',
            startedAt: 1
        }
    ]
}

async function slugs(): Promise<void> {
    console.log('\nslug validation')
    check('a plain slug', boards.assertSlug('dyarchia-desktop'), 'dyarchia-desktop')
    for (const bad of ['../escape', 'C:', 'a/b', 'a\\b', '-leading', '', 'Upper']) {
        await refuses(`refuses ${JSON.stringify(bad)}`, async () => boards.assertSlug(bad), 'valid board slug')
    }
    for (const bad of ['con', 'lpt3', 'nul']) {
        await refuses(`refuses ${JSON.stringify(bad)}`, async () => boards.assertSlug(bad), 'reserved device name')
    }
}

async function livenessRules(): Promise<void> {
    console.log('\nliveness is three-valued')
    const id = 'aaaaaaaa-1111-2222-3333-444444444444'
    check('a working session is alive', liveness(sessions('working'), id), 'alive')
    check('a blocked session is alive', liveness(sessions('blocked'), id), 'alive')
    check('a done session is dead', liveness(sessions('done'), id), 'dead')
    check('a stopped session is dead', liveness(sessions('stopped'), id), 'dead')
    check('a failed session is dead', liveness(sessions('failed'), id), 'dead')
    check('an absent session is dead', liveness([], id), 'dead')
    check('an unreadable snapshot is unknown', liveness(null, id), 'unknown')
    check('a state nobody has seen is unknown, not a guess', liveness(sessions('pondering'), id), 'unknown')
}

function launches(): void {
    console.log('\nreading the launcher output')
    const line = 'Starting background service\u2026\nbackgrounded \u00b7 440e7692 \u00b7 a-name\n  claude agents\n'
    check('finds the short id', parseLaunch(line, null)?.shortId, '440e7692')
    check('resolves the session id', parseLaunch(line, [
        { ...sessions('working')[0], shortId: '440e7692', sessionId: '440e7692-aaaa-bbbb-cccc-dddddddddddd' }
    ])?.sessionId, '440e7692-aaaa-bbbb-cccc-dddddddddddd')
    check('a silent launcher is not a worker', parseLaunch('nothing useful', null), null)
}

function terminals(): void {
    console.log('\nreading the terminal block')
    const good =
        'some prose\n===KANBAN===\n{ "outcome": "completed", "summary": "did it", "artifacts": ["a.txt"], "followups": [{"title":"next","body":"b"}] }\n'
    check('outcome', parseTerminal(good)?.outcome, 'completed')
    check('artifacts', parseTerminal(good)?.artifacts, ['a.txt'])
    check('followups', parseTerminal(good)?.followups, [{ title: 'next', body: 'b' }])
    check('no marker is no block', parseTerminal('just prose'), null)
    check('a truncated block is no block', parseTerminal('===KANBAN===\n{ "outcome": "com'), null)
    check(
        'the last block wins',
        parseTerminal('===KANBAN===\n{"outcome":"blocked"}\n===KANBAN===\n{"outcome":"completed"}')?.outcome,
        'completed'
    )
    check(
        'a nested object does not end it early',
        parseTerminal('===KANBAN===\n{"outcome":"blocked","followups":[{"title":"t","body":"b"}],"summary":"s"}')
            ?.summary,
        's'
    )
}

async function machine(): Promise<void> {
    console.log('\nthe board machine')
    const workdir = mkdtempSync(join(tmpdir(), 'kanban-work-'))
    const meta = await boards.create({ slug: 'probe', name: 'probe', workdir })
    check('the board is registered', meta.slug, 'probe')

    await refuses('a relative workdir', () => boards.create({ slug: 'x', name: 'x', workdir: 'rel' }), 'absolute')
    await refuses('a missing workdir', () => boards.create({ slug: 'y', name: 'y', workdir: join(workdir, 'nope') }), 'existing directory')

    const parent = await board.createCard('probe', { title: 'parent', status: 'ready' })
    const child = await board.createCard('probe', { title: 'child', status: 'ready', parents: [parent.id] })
    check('a card with open parents cannot start ready', child.status, 'todo')

    await refuses('a cycle', () => board.updateCard('probe', parent.id, { parents: [child.id] }), 'cycle')
    await refuses('a stale rev', () => board.moveCard('probe', parent.id, 99, 'triage'), 'changed while you were')
    await refuses('a move with open parents', () => board.moveCard('probe', child.id, child.rev, 'ready'), 'open dependencies')
    await refuses('deleting a card something depends on', () => board.deleteCard('probe', parent.id), 'depends on that card')
    await refuses('an illegal transition', () => board.moveCard('probe', parent.id, parent.rev, 'done'), 'cannot go from')

    let file = await board.load('probe')
    board.find(file, parent.id).status = 'done'
    await board.save('probe', file)

    check('nothing promotes before the sweep', (await board.cards('probe')).find((c) => c.id === child.id)?.status, 'todo')
    check('the sweep promotes it', await board.promote('probe', Date.now()), true)
    check('the child is ready', (await board.cards('probe')).find((c) => c.id === child.id)?.status, 'ready')
    check('a second sweep changes nothing', await board.promote('probe', Date.now()), false)

    console.log('\nblocking and unblocking')
    file = await board.load('probe')
    const stuck = board.find(file, child.id)
    stuck.status = 'blocked'
    stuck.blockKind = 'needs_input'
    stuck.sourcePhase = 'ready'
    stuck.lastBlockKind = 'needs_input'
    stuck.blockRecurrences = 1
    await board.save('probe', file)

    const back = await board.unblock('probe', child.id, stuck.rev)
    check('unblocking restores the source phase', back.status, 'ready')
    check('the block kind is cleared', back.blockKind, null)
    check('the recurrence count survives', back.blockRecurrences, 1)
    check('so does the kind that caused it', back.lastBlockKind, 'needs_input')

    await refuses('unblocking a card that is not blocked', () => board.unblock('probe', child.id, back.rev), 'not blocked')

    const parked = await board.updateCard('probe', child.id, { scheduledFor: Date.now() + 60_000 })
    const moved = await board.moveCard('probe', child.id, parked.rev, 'scheduled')
    check('a card can be parked', moved.status, 'scheduled')
    check('it does not wake early', await board.promote('probe', Date.now()), false)
    check('it wakes at its time', await board.promote('probe', Date.now() + 61_000), true)
    check('and it is ready', (await board.cards('probe')).find((c) => c.id === child.id)?.status, 'ready')

    file = await board.load('probe')
    const looping = board.find(file, child.id)
    looping.status = 'blocked'
    looping.blockKind = 'needs_input'
    looping.sourcePhase = 'ready'
    looping.lastBlockKind = 'needs_input'
    looping.blockRecurrences = 2
    await board.save('probe', file)

    const sent = await board.moveCard('probe', child.id, looping.rev, 'triage')
    check('triage forgets the block history', [sent.lastBlockKind, sent.blockRecurrences], [null, 0])
    check('and the card is in triage', sent.status, 'triage')
}

const PORCELAIN = [
    'worktree C:/Users/x/project',
    'HEAD 28e1456aa',
    'branch refs/heads/develop',
    '',
    'worktree C:/Users/x/project/.claude/worktrees/kanban-a1b2c3d4',
    'HEAD fc7cf1abb',
    'branch refs/heads/worktree-kanban-a1b2c3d4',
    'locked claude session kanban-a1b2c3d4 (pid 7112)',
    '',
    'worktree C:/Users/x/elsewhere/detached',
    'HEAD 0110b14cc',
    'detached',
    ''
].join('\n')

async function housekeeping(): Promise<void> {
    console.log('\nworktrees the board left behind')
    const listed = parseList(PORCELAIN)
    check('every worktree is read', listed.length, 3)
    check('the branch loses its refs prefix', listed[1].branch, 'worktree-kanban-a1b2c3d4')
    check('a detached worktree has no branch', listed[2].branch, null)
    check('the CLI lock is read, with its reason', listed[1].locked, 'claude session kanban-a1b2c3d4 (pid 7112)')
    check('an unlocked worktree says so', listed[0].locked, null)
    check('and it still has a head', listed[2].head, '0110b14cc')

    const project = 'C:\\Users\\x\\project'
    check('a worktree of ours is claimed', ours(project, listed[1].path), true)
    check('the checkout itself is not', ours(project, project), false)
    check('nor is one outside it', ours(project, listed[2].path), false)
    check('a path is matched across separators', same(listed[1].path, join(project, '.claude', 'worktrees', 'kanban-a1b2c3d4')), true)

    console.log('\nnothing keeps a workspace it has no card for')
    const root = mkdtempSync(join(tmpdir(), 'kanban-strays-'))
    for (const name of ['live', 'gone', 'also-gone']) mkdirSync(join(root, name))
    writeFileSync(join(root, 'a-file'), 'not a workspace')
    check('only the directories with no card are stray', (await strays(root, new Set(['live']))).sort(), ['also-gone', 'gone'])
    check('a file is never a stray workspace', (await strays(root, new Set())).includes('a-file'), false)

    console.log('\ndeleting a card takes its attachments')
    const orphan = await board.createCard('probe', { title: 'has an artifact' })
    const kept = boards.attachmentsRoot('probe', orphan.id)
    mkdirSync(kept, { recursive: true })
    writeFileSync(join(kept, 'report.md'), '# a run wrote this')
    check('the attachment is there', existsSync(join(kept, 'report.md')), true)
    await board.deleteCard('probe', orphan.id)
    check('and it goes with the card', existsSync(kept), false)
}

async function followups(): Promise<void> {
    console.log('\nno followup is dropped in silence')
    const meta = await boards.find('probe')
    const file = await board.load('probe')
    const parent = await board.createCard('probe', { title: 'a run with opinions' })
    file.cards.push(parent)

    const proposed = Array.from({ length: 12 }, (unused, index) => ({
        title: `followup ${index + 1}`,
        body: 'found while working'
    }))
    proposed.push({ title: '   ', body: 'a title that is only spaces' })

    await adopt(file, meta, parent, proposed)
    const children = (await board.cards('probe')).filter((card) => card.parents.includes(parent.id))
    check('the cap still holds', children.length, 10)
    check('an empty title is never a card', children.some((card) => !card.title.trim()), false)
    check('the extras are named on the card', parent.comments.length, 1)
    check('and they are named by title', parent.comments[0].text.includes('followup 12'), true)
}

async function leases(): Promise<void> {
    console.log('\nonly one dispatcher claims')
    const now = Date.now()
    check('an empty file is taken', decide(null, 'me', now), 'take')
    check('our own lease is renewed', decide({ owner: 'me', pid: 1, at: now - 1000 }, 'me', now), 'renew')
    check('a fresh lease of anothers is waited on', decide({ owner: 'you', pid: 2, at: now - 1000 }, 'me', now), 'wait')
    check('a stale one is taken', decide({ owner: 'you', pid: 2, at: now - TTL_MS - 1 }, 'me', now), 'take')

    check('the first process holds it', await hold('first', now), true)
    check('and it is written down', (await readLease())?.owner, 'first')
    check('a second process does not', await hold('second', now), false)
    check('the first keeps it', (await readLease())?.owner, 'first')
    check('the second takes it once it goes stale', await hold('second', now + TTL_MS + 1), true)
    await drop('first')
    check('a holder that is not us drops nothing', (await readLease())?.owner, 'second')
    await drop('second')
    check('and the holder can drop its own', await readLease(), null)
}

console.log('kanban probe')
await slugs()
await livenessRules()
launches()
terminals()
await machine()
await housekeeping()
await followups()
await leases()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
