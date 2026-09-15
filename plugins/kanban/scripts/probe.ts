import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as board from '../src/board.js'
import * as boards from '../src/boards.js'
import { adopt, force, guarded, home, overran, PATIENCE, stalled, unlisted } from '../src/dispatch.js'
import { liveness, parseLaunch, snapshot } from '../src/harness/claude.js'
import { nextName, strays } from '../src/artifacts.js'
import { parse as parseEvents, read as readEvents, record } from '../src/events.js'
import { brief, reviewBrief } from '../src/worker.js'
import { parseTerminal } from '../src/closing.js'
import { decide, drop, hold, read as readLease, TTL_MS } from '../src/lease.js'
import { isRefusal } from '../src/refusal.js'
import { ours, parseList, same } from '../src/worktrees.js'
import type { SessionRecord } from '../src/harness/claude.js'
import type { Sink } from '../src/dispatch.js'
import type { Card, CardPatch, Run } from '../src/types.js'

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
            if (isRefusal(error)) {
                passed += 1
                console.log(`  ok    ${name}`)
                return
            }
            failed += 1
            console.log(`  FAIL  ${name}`)
            console.log('        it refused without the mark; the shell will log it as a crash')
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
    check('no verdict is no verdict', parseTerminal(good)?.verdict, null)
    check(
        'a review approves',
        parseTerminal('===KANBAN===\n{"outcome":"completed","verdict":"approved"}')?.verdict,
        'approved'
    )
    check(
        'a review asks for changes',
        parseTerminal('===KANBAN===\n{"outcome":"completed","verdict":"changes"}')?.verdict,
        'changes'
    )
    check(
        'a verdict nobody defined is no verdict',
        parseTerminal('===KANBAN===\n{"outcome":"completed","verdict":"lgtm"}')?.verdict,
        null
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

    const proposed = Array.from({ length: 12 }, (_, index) => ({
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

async function attachments(): Promise<void> {
    console.log('\nfiles given to a card')
    check('a free name is used as it is', nextName(new Set(), 'report.md'), 'report.md')
    check('a taken one is numbered', nextName(new Set(['report.md']), 'report.md'), 'report-2.md')
    check('and it keeps counting', nextName(new Set(['report.md', 'report-2.md']), 'report.md'), 'report-3.md')
    check('a name with no extension still works', nextName(new Set(['LICENSE']), 'LICENSE'), 'LICENSE-2')
    check('a dotfile is not split at its dot', nextName(new Set(['.env']), '.env'), '.env-2')

    check('a plain file name passes', boards.assertFileName('report.md'), 'report.md')
    for (const bad of ['../escape.md', 'a/b.md', 'a\\b.md', '..', '', 'x*.md']) {
        await refuses(`refuses ${JSON.stringify(bad)}`, async () => boards.assertFileName(bad), 'file name')
    }

    const card = await board.createCard('probe', { title: 'has files' })
    const text = brief(card, [], 'C:\\workspace', false, [
        { name: 'spec.pdf', path: 'C:\\attachments\\spec.pdf' }
    ])
    check('the brief names the file', text.includes('C:\\attachments\\spec.pdf'), true)
    check('under its own heading', text.includes('## Attachments'), true)
    check('and a card with none says nothing', brief(card, [], 'C:\\workspace', false).includes('## Attachments'), false)
}

async function eventLog(): Promise<void> {
    console.log('\nthe board says what it decided')
    const rows = parseEvents(
        '{"at":1,"cardId":"a","runId":null,"kind":"created","detail":"one"}\nnot json at all\n{"at":2,"cardId":"b","runId":null,"kind":"moved","detail":"two"}\n'
    )
    check('a broken line is skipped, not fatal', rows.length, 2)
    check('and the good ones survive it', [rows[0].kind, rows[1].kind], ['created', 'moved'])

    const card = await board.createCard('probe', { title: 'watched' })
    await board.updateCard('probe', card.id, { priority: 3 })
    await board.comment('probe', card.id, 'a note', 'user')
    await record('probe', card.id, 'claimed', 'attempt 1', 'run-1')

    const mine = await readEvents('probe', card.id)
    check('every decision landed', mine.map((row) => row.kind), ['created', 'edited', 'commented', 'claimed'])
    check('the run id rides along where there is one', mine[3].runId, 'run-1')
    check('and the detail is kept', mine[1].detail, 'priority')

    const everything = await readEvents('probe')
    check('the board log holds more than one card', everything.length > mine.length, true)
}


async function reviews(): Promise<void> {
    console.log('\nthe review run')

    const judged: Run = {
        runId: 'r1',
        kind: 'implement',
        harness: 'claude',
        sessionId: 's1',
        shortId: 'abc',
        worktree: 'C:\\project\\.claude\\worktrees\\kanban-r1',
        branch: 'kanban-r1',
        startedAt: 1,
        endedAt: 2,
        outcome: 'completed',
        summary: 'rewrote the parser',
        artifacts: [],
        kept: [],
        inputTokens: 0,
        outputTokens: 0,
        error: null,
        headBefore: 'abc1234'
    }

    const card = await board.createCard('probe', { title: 'reviewed', body: 'make it fast' })
    const small = {
        stat: ' lib.js | 2 +-',
        text: '-    return text' + String.fromCharCode(10) + '+    return slug',
        truncated: false
    }
    const text = reviewBrief(card, judged, 'C:' + String.fromCharCode(92) + 'project', [], small, 'diff.patch')
    check('the reviewer is told what was asked', text.includes('make it fast'), true)
    check('and what the implementer said', text.includes('rewrote the parser'), true)
    check('it is pointed at the branch', text.includes('kanban-r1'), true)
    check('it is NOT handed a command to run', text.includes('git diff abc1234..kanban-r1'), false)
    check('it is handed the change itself', text.includes('+    return slug'), true)
    check('with the summary of what it touches', text.includes('lib.js | 2 +-'), true)
    check('it works in the project, not a worktree', text.includes('Your working directory is `C:\\project`'), true)
    check('and it is asked for a verdict', text.includes('"verdict": "approved" | "changes"'), true)

    check('and told it is in plan mode, so it does not try to leave it', text.includes('PLAN MODE'), true)
    check('and told it has no shell, and why', text.includes('NO SHELL'), true)

    const empty = reviewBrief(card, judged, 'C:' + String.fromCharCode(92) + 'project', [], { stat: '', text: '', truncated: false })
    check('an empty diff is the finding, not a hunt', empty.includes('The diff is EMPTY'), true)

    const missing = reviewBrief(card, judged, 'C:' + String.fromCharCode(92) + 'project', [], null)
    check('no diff at all is an honest blocked', missing.includes('the honest answer'), true)

    const huge = reviewBrief(
        card, judged, 'C:' + String.fromCharCode(92) + 'project', [],
        { stat: ' big.js | 9000 +', text: 'x'.repeat(40_000), truncated: false },
        'diff.patch'
    )
    check('a patch too big to inline is pointed at', huge.includes('diff.patch'), true)
    check('and is not pasted in anyway', huge.includes('x'.repeat(1_000)), false)

    const cut = reviewBrief(
        card, judged, 'C:' + String.fromCharCode(92) + 'project', [],
        { stat: ' big.js | 9000 +', text: 'y'.repeat(100), truncated: true },
        'diff.patch'
    )
    check('a truncated patch says so', cut.includes('only half read'), true)

    const nothing = reviewBrief(card, { ...judged, branch: null, headBefore: null }, 'C:\\project')
    check('a run with no branch is judged where it stands', nothing.includes('There is no branch'), true)

    board.forget('old')
    mkdirSync(boards.boardRoot('old'), { recursive: true })
    writeFileSync(
        boards.boardPath('old'),
        JSON.stringify({
            version: 1,
            cards: [{ ...card, id: 'aged', runs: [{ ...judged, kind: undefined }] }]
        }),
        'utf-8'
    )
    const aged = await board.cards('old')
    check('a run written before kinds existed reads as an implementation', aged[0].runs[0].kind, 'implement')
}

async function caps(): Promise<void> {
    console.log('\nconcurrency caps')

    check('a cap is a whole number', boards.assertCap(3), 3)
    check('zero is a cap, and it means paused', boards.assertCap(0), 0)
    check('a numeric string is one too', boards.assertCap('2'), 2)
    await refuses('a negative cap', async () => boards.assertCap(-1), 'cannot be negative')
    await refuses('a fractional cap', async () => boards.assertCap(1.5), 'whole number')
    await refuses('a cap that is not a number', async () => boards.assertCap('lots'), 'whole number')
    await refuses('a cap past the ceiling', async () => boards.assertCap(11), 'as high as this goes')

    check('a board starts on the default', (await boards.find('probe')).maxRunning, null)
    check('and the default is one', boards.PER_BOARD, 1)

    const raised = await boards.update('probe', { maxRunning: 3 })
    check('a board can carry its own cap', raised.maxRunning, 3)
    check('and it survives a read', (await boards.find('probe')).maxRunning, 3)

    const renamed = await boards.update('probe', { name: 'probe' })
    check('a patch that says nothing about it leaves it alone', renamed.maxRunning, 3)
    check('and null puts it back on the default', (await boards.update('probe', { maxRunning: null })).maxRunning, null)
    await refuses('a board cap past the ceiling', () => boards.update('probe', { maxRunning: 99 }), 'as high as this goes')

    check('the global cap defaults to two', (await boards.settings()).maxRunning, boards.GLOBAL)
    check('it can be changed', (await boards.saveSettings({ maxRunning: 4 })).maxRunning, 4)
    check('and read back', (await boards.settings()).maxRunning, 4)
    check('an empty patch keeps it', (await boards.saveSettings({})).maxRunning, 4)
    await refuses('a global cap that is not one', () => boards.saveSettings({ maxRunning: -2 }), 'cannot be negative')
    await boards.saveSettings({ maxRunning: boards.GLOBAL })

    const counted = board.tally(await board.cards('probe'))
    check('the tally counts every status it is given', counted.done + counted.ready + counted.todo > 0, true)
    check('a status nothing is in counts zero, not undefined', counted.archived, 0)
    check('and the tally has a row per status', Object.keys(counted).length, 9)
}

async function bulk(): Promise<void> {
    console.log('\nseveral cards at once')

    const meta = await boards.create({ slug: 'bulk', name: 'bulk', workdir: tmpdir() })
    check('a second board for the bulk verbs', meta.slug, 'bulk')

    const one = await board.createCard('bulk', { title: 'one', status: 'triage' })
    const two = await board.createCard('bulk', { title: 'two', status: 'triage' })
    const three = await board.createCard('bulk', { title: 'three', status: 'ready' })

    const moved = await board.moveCards(
        'bulk',
        [
            { id: one.id, rev: one.rev },
            { id: two.id, rev: two.rev },
            { id: three.id, rev: three.rev }
        ],
        'todo'
    )
    check('the legal ones move', moved.done.length, 2)
    check('and the illegal one says why', moved.refused[0]?.why.includes('cannot go from ready to todo'), true)
    check('the board agrees', (await board.cards('bulk')).filter((card) => card.status === 'todo').length, 2)

    const stale = await board.moveCards('bulk', [{ id: one.id, rev: 0 }], 'ready')
    check('a stale rev is refused in a batch too', stale.refused[0]?.why.includes('changed while'), true)
    check('and nothing moved', stale.done.length, 0)

    const same = await board.cards('bulk')
    const already = same.find((card) => card.id === one.id) as Card
    check(
        'moving a card where it already is is not a refusal',
        (await board.moveCards('bulk', [{ id: already.id, rev: already.rev }], 'todo')).done.length,
        1
    )

    const parent = await board.createCard('bulk', { title: 'parent' })
    const child = await board.createCard('bulk', { title: 'child', parents: [parent.id] })

    const half = await board.deleteCards('bulk', [parent.id])
    check('a parent alone will not go', half.done.length, 0)
    check('and it says who holds it', half.refused[0]?.why.includes("'child' depends"), true)

    const both = await board.deleteCards('bulk', [parent.id, child.id])
    check('a parent goes with its child', both.done.length, 2)
    check('and the board is smaller', (await board.cards('bulk')).some((card) => card.id === parent.id), false)

    const locked = await board.cards('bulk')
    const held = locked[0]
    held.locked = true
    await board.save('bulk', await board.load('bulk'))
    const refusedLock = await board.deleteCards('bulk', [held.id])
    check('a card with a live worker is never deleted', refusedLock.refused[0]?.why.includes('live worker'), true)

    check('an empty batch does nothing and says nothing', (await board.deleteCards('bulk', [])).done.length, 0)
}

async function guards(): Promise<void> {
    console.log('\nthe respawn guard')

    const now = Date.now()
    const card = await board.createCard('bulk', { title: 'guarded' })
    const base: Run = {
        runId: 'g1',
        kind: 'implement',
        harness: 'claude',
        sessionId: 's',
        shortId: 'g',
        worktree: null,
        branch: null,
        startedAt: now - 600_000,
        endedAt: now - 1_000,
        outcome: 'crashed',
        summary: null,
        artifacts: [],
        kept: [],
        inputTokens: 0,
        outputTokens: 0,
        error: null,
        headBefore: null
    }
    const after = (patch: Partial<Run>): Card => ({ ...card, runs: [{ ...base, ...patch }] })

    check('a live run is not guarded', guarded(after({ endedAt: null }), now), false)
    check('a fresh success is', guarded(after({ outcome: 'completed' }), now), true)
    check(
        'an old success is not',
        guarded(after({ outcome: 'completed', endedAt: now - 120_000 }), now),
        false
    )
    check(
        'a completed run that WROTE about credit is not',
        guarded(after({ outcome: 'completed', endedAt: now - 120_000, summary: 'fixed the credit page' }), now),
        false
    )
    check('a 401 in the error is', guarded(after({ error: 'HTTP 401 from the API' }), now), true)
    check(
        'and a login refresh in the summary is, which is where it lands',
        guarded(
            after({
                outcome: 'violation',
                error: 'no terminal block',
                summary: 'Could not refresh your login because another Claude Code process is refreshing it'
            }),
            now
        ),
        true
    )
    check(
        'an ordinary violation is not guarded',
        guarded(after({ outcome: 'violation', error: 'no terminal block', summary: 'I forgot the block' }), now),
        false
    )

    check('a session listed as alive is not unlisted', unlisted('alive', now - 1_000, now), false)
    check('an unreadable snapshot is not either', unlisted('unknown', now - 1_000, now), false)
    check('a newborn session missing from the list is', unlisted('dead', now - 2_000, now), true)
    check('and an old one missing from it is really gone', unlisted('dead', now - 60_000, now), false)

    check('an implementation that stops goes back to ready', home(base), 'ready')
    check('and a review goes back to review, not to an implementer', home({ ...base, kind: 'review' }), 'review')
}

async function patches(): Promise<void> {
    console.log('\nthe fields a patch may carry')

    const card = await board.createCard('probe', { title: 'patched' })
    const edited = await board.updateCard('probe', card.id, { title: 'renamed', priority: 2 })
    const rev = edited.rev
    check('a patch of the fields it applies lands', [edited.title, edited.priority], ['renamed', 2])
    check('and it touches nothing it was not given', edited.status, 'triage')

    const extra: Record<string, unknown>[] = [
        { status: 'done' },
        { rev: 9 },
        { locked: false },
        { runs: [] },
        { consecutiveFailures: 7 }
    ]
    for (const patch of extra) {
        const key = Object.keys(patch)[0]
        await refuses(
            `refuses a patch carrying ${key}`,
            () => board.updateCard('probe', card.id, patch as CardPatch),
            `no editable ${key}`
        )
    }

    await refuses(
        'and it names every stray key, not only the first',
        () => board.updateCard('probe', card.id, { status: 'done', rev: 9 } as unknown as CardPatch),
        'no editable status, rev'
    )

    const after = (await board.cards('probe')).find((entry) => entry.id === card.id) as Card
    check('a refused patch leaves the card alone', [after.status, after.rev], ['triage', rev])
}

const TURN_ENDED = { type: 'system', subtype: 'turn_duration', durationMs: 1_000, messageCount: 4 }

function spoke(id: string, content: unknown[]): unknown {
    return { type: 'assistant', message: { id, usage: { input_tokens: 20, output_tokens: 5 }, content } }
}

function jsonl(rows: unknown[]): string {
    return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
}

function setenv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
}

async function reconciling(): Promise<void> {
    console.log('\nthe turn ended and nothing was declared')

    const workdir = mkdtempSync(join(tmpdir(), 'kanban-recon-'))
    const fakeHome = mkdtempSync(join(tmpdir(), 'kanban-home-'))
    const bare = mkdtempSync(join(tmpdir(), 'kanban-bare-'))
    const transcripts = join(fakeHome, '.claude', 'projects', 'recon')
    mkdirSync(transcripts, { recursive: true })

    const held = {
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        PATH: process.env.PATH
    }
    setenv('HOME', fakeHome)
    setenv('USERPROFILE', fakeHome)
    setenv('PATH', bare)

    await boards.create({ slug: 'recon', name: 'recon', workdir })
    for (const entry of await boards.list()) await boards.update(entry.slug, { maxRunning: 0 })

    check('with no claude on PATH the snapshot is unreadable', await snapshot(), null)
    check(
        'and every board is paused, so the sweep can claim nothing',
        (await boards.list()).every((entry) => entry.maxRunning === 0),
        true
    )

    const outcomes: string[] = []
    const notices: string[] = []
    const sink: Sink = {
        boardChanged: () => undefined,
        cardProgress: () => undefined,
        runEnded: (_slug, _cardId, outcome) => {
            outcomes.push(outcome)
        },
        notify: (notice) => {
            notices.push(notice.title)
        }
    }

    const staged = async (title: string, rows: unknown[]): Promise<string> => {
        const card = await board.createCard('recon', { title })
        const sessionId = randomUUID()
        writeFileSync(join(transcripts, `${sessionId}.jsonl`), jsonl(rows), 'utf-8')

        const file = await board.load('recon')
        const live = board.find(file, card.id)
        live.status = 'running'
        live.locked = true
        live.runs.push({
            runId: randomUUID(),
            kind: 'implement',
            harness: 'claude',
            sessionId,
            shortId: 'deadbeef',
            worktree: null,
            branch: null,
            startedAt: Date.now(),
            endedAt: null,
            outcome: null,
            summary: null,
            artifacts: [],
            kept: [],
            inputTokens: 0,
            outputTokens: 0,
            error: null,
            headBefore: null
        })
        await board.save('recon', file)
        return card.id
    }

    const denied = await staged('the operator denied a tool use', [
        spoke('m1', [{ type: 'tool_use', name: 'PowerShell' }]),
        { type: 'user', message: { content: [{ type: 'tool_result', content: 'User rejected tool use' }] } },
        {
            type: 'user',
            message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] }
        },
        TURN_ENDED
    ])
    const told = await staged('the worker declared it finished', [
        spoke('m2', [
            {
                type: 'text',
                text: '===KANBAN===\n{ "outcome": "completed", "summary": "did the work", "artifacts": [], "followups": [] }'
            }
        ]),
        TURN_ENDED
    ])
    const talking = await staged('the worker is still talking', [
        TURN_ENDED,
        spoke('m3', [{ type: 'text', text: 'still reading the diff' }])
    ])

    await force(sink)

    const reread = async (id: string): Promise<Card> =>
        (await board.cards('recon')).find((card) => card.id === id) as Card
    const last = (card: Card): Run => card.runs[card.runs.length - 1]

    const stuck = await reread(denied)
    check('a finished turn with no terminal block is resolved, not held', stuck.status, 'ready')
    check('the card is let go of', stuck.locked, false)
    check('the run is closed', last(stuck).endedAt !== null, true)
    check('as a protocol violation', last(stuck).outcome, 'violation')
    check('and it says what was missing', last(stuck).error, 'no terminal block')
    check('the violation is counted', stuck.protocolViolations, 1)
    check('the tokens the turn spent are kept', [last(stuck).inputTokens, last(stuck).outputTokens], [20, 5])
    check('and the operator is told', notices.includes('the operator denied a tool use broke the protocol'), true)

    const finished = await reread(told)
    check('a finished turn that declared is resolved as it always was', finished.status, 'done')
    check('with the outcome it declared', last(finished).outcome, 'completed')
    check('and the summary it wrote', last(finished).summary, 'did the work')

    const ongoing = await reread(talking)
    check('a turn that is not finished is still held', ongoing.status, 'running')
    check('the card stays locked', ongoing.locked, true)
    check('its run stays open', [last(ongoing).endedAt, last(ongoing).outcome], [null, null])
    check('and nothing is counted against it', ongoing.protocolViolations, 0)

    check('only the finished runs were reported', outcomes.sort(), ['completed', 'violation'])
    check(
        'and the paused sweep launched nothing',
        (await board.cards('recon')).filter((card) => card.status === 'running').length,
        1
    )

    for (const [name, value] of Object.entries(held)) setenv(name, value)
    for (const path of [workdir, fakeHome, bare]) rmSync(path, { recursive: true, force: true })
}

function patience(): void {
    console.log('\nthe detector that gives up on a run')

    const now = 10_000_000
    const old = now - PATIENCE.minAgeMs - 60_000
    const mute = now - PATIENCE.silentMs - 60_000

    check('a run with no cap never overruns', overran(null, now - 99_999_999, now), false)
    check('a run inside its cap does not either', overran(600, now - 60_000, now), false)
    check('a run past its cap does', overran(600, now - 601_000, now), true)

    check('a working run that is old and mute has stalled', stalled('working', mute, old, now), true)
    check(
        'a BLOCKED run has NOT, however old and mute: it is waiting on a person',
        stalled('blocked', mute, old, now),
        false
    )
    check('nor has a run with no transcript to be silent in', stalled('working', null, old, now), false)
    check('nor one that is old but still writing', stalled('working', now - 1_000, old, now), false)
    check(
        'nor one that is mute but too young to judge',
        stalled('working', mute, now - 60_000, now),
        false
    )

    const impatient = { silentMs: 50, minAgeMs: 100 }
    check(
        'the thresholds are injectable, so the rule can be made to fire',
        stalled('working', now - 60, now - 200, now, impatient),
        true
    )
    check(
        'and injected thresholds still refuse a run that is too young',
        stalled('working', now - 60, now - 10, now, impatient),
        false
    )
    check(
        'and still refuse one that is not working',
        stalled('blocked', now - 60, now - 200, now, impatient),
        false
    )
}

async function atomicWrites(): Promise<void> {
    console.log('\ntwo writers on one file')

    const root = mkdtempSync(join(tmpdir(), 'kanban-atomic-'))
    const target = join(root, 'registry.json')

    const first = 'a'.repeat(4096)
    const second = 'b'.repeat(4096)
    await Promise.all([boards.writeAtomic(target, first), boards.writeAtomic(target, second)])

    check('both writers finished', existsSync(target), true)
    check(
        'the file holds one whole payload, not a mixture',
        [first, second].includes(readFileSync(target, 'utf-8')),
        true
    )
    check(
        'and neither left a scratch file behind',
        readdirSync(root).filter((name) => name.endsWith('.tmp')).length,
        0
    )

    const many = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
            boards.writeAtomic(target, String(index).repeat(2048)).then(
                () => true,
                () => false
            )
        )
    )
    check('eight at once, none refused', many.every(Boolean), true)
    check(
        'and still no scratch left over',
        readdirSync(root).filter((name) => name.endsWith('.tmp')).length,
        0
    )

    rmSync(root, { recursive: true, force: true })
}

console.log('kanban probe')
await slugs()
await livenessRules()
launches()
terminals()
await machine()
await patches()
await housekeeping()
await followups()
await leases()
await attachments()
await caps()
await bulk()
await guards()
await reviews()
await eventLog()
await reconciling()
patience()
await atomicWrites()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
