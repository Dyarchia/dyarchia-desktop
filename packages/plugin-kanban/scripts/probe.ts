import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as board from '../src/board.js'
import * as boards from '../src/boards.js'
import { liveness, parseLaunch } from '../src/agents.js'
import { parseTerminal } from '../src/worker.js'
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
    check('an absent session is dead', liveness([], id), 'dead')
    check('an unreadable snapshot is unknown', liveness(null, id), 'unknown')
    check('an unknown state is not death', liveness(sessions('pondering'), id), 'alive')
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

console.log('kanban probe')
await slugs()
await livenessRules()
launches()
terminals()
await machine()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
