import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MARKER } from './closing.js'
import * as harness from './harness/index.js'
import type { Resolved } from './runners.js'
import type { Card, Run } from './types.js'

const INLINE_LIMIT = 8_000
const DIFF_LIMIT = 120_000
const DIFF_INLINE = 20_000

export interface Started {
    shortId: string
    sessionId: string
    headBefore: string | null
    worktree: string | null
    branch: string | null
}

export async function git(workdir: string, args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        execFile('git', args, { cwd: workdir, timeout: 10_000, windowsHide: true }, (error, stdout) =>
            resolve(error ? null : stdout.trim())
        )
    })
}

export async function tracked(workdir: string): Promise<boolean> {
    return (await git(workdir, ['rev-parse', '--is-inside-work-tree'])) === 'true'
}

export async function head(workdir: string): Promise<string | null> {
    return new Promise((resolve) => {
        execFile(
            'git',
            ['rev-parse', 'HEAD'],
            { cwd: workdir, timeout: 10_000, windowsHide: true },
            (error, stdout) => resolve(error ? null : stdout.trim())
        )
    })
}

/*
 * What a worker leaves uncommitted in its worktree is not on the branch, so nothing can
 * review it and the worktree may go. The board therefore commits it, as one commit
 * named after the card, and says so in the message. A harness whose sandbox refuses
 * git metadata writes cannot do this itself, and a worker that simply forgot gets the
 * same treatment rather than a lost afternoon.
 */
export async function land(worktree: string, title: string): Promise<'committed' | 'clean' | 'failed'> {
    const status = await git(worktree, ['status', '--porcelain'])
    if (status === null) return 'failed'
    if (!status.trim()) return 'clean'
    if ((await git(worktree, ['add', '-A'])) === null) return 'failed'
    const message = `${title}\n\nCommitted by the board: the worker left this in the working tree.`
    const done = await git(worktree, [
        '-c',
        'user.name=dyarchia kanban',
        '-c',
        'user.email=kanban@dyarchia.local',
        'commit',
        '-q',
        '-m',
        message
    ])
    return done === null ? 'failed' : 'committed'
}

export interface Patch {
    stat: string
    text: string
    truncated: boolean
}

export async function patch(
    workdir: string,
    headBefore: string | null,
    branch: string | null
): Promise<Patch | null> {
    if (!headBefore || !branch) return null
    const range = `${headBefore}..${branch}`
    const stat = await git(workdir, ['diff', '--stat', range])
    const body = await git(workdir, ['diff', range])
    if (stat === null || body === null) return null
    return {
        stat,
        text: body.slice(0, DIFF_LIMIT),
        truncated: body.length > DIFF_LIMIT
    }
}

export interface Given {
    name: string
    path: string
    from?: 'operator' | 'worker'
}

function listGiven(lines: string[], attachments: Given[], whose: string): void {
    if (!attachments.length) return
    lines.push('## Attachments', '')
    lines.push(`These files were given to ${whose}. Read them where they are:`, '')
    for (const file of attachments) {
        lines.push(
            file.from === 'worker'
                ? `- \`${file.path}\` (left for you by the previous run on this card)`
                : `- \`${file.path}\``
        )
    }
    lines.push('')
}

export function brief(
    card: Card,
    parents: Card[],
    workspace: string,
    isolated: boolean,
    attachments: Given[] = [],
    commits: boolean = true
): string {
    const lines: string[] = []

    lines.push(`# ${card.title}`, '')
    if (card.body.trim()) lines.push(card.body.trim(), '')

    if (parents.length) {
        lines.push('## Results carried forward', '')
        for (const parent of parents) {
            const last = [...parent.runs].reverse().find((run) => run.summary)
            lines.push(`### ${parent.title}`, '')
            lines.push(last?.summary ?? 'This card closed without a recorded summary.', '')
        }
        lines.push(
            'That is the only context you have. You cannot see sibling cards, and nothing you',
            'learn here reaches them.',
            ''
        )
    }

    listGiven(lines, attachments, 'this card')

    if (card.comments.length) {
        lines.push('## Thread', '')
        for (const entry of card.comments) {
            lines.push(`**${entry.author}**: ${entry.text}`, '')
        }
    }

    lines.push('## Workspace', '')
    lines.push(`Your working directory is \`${workspace}\`.`, '')
    if (isolated) {
        lines.push(
            'It is a git worktree of the project, on its own branch, so your changes are isolated',
            'from the checkout the operator is working in. Do not try to merge it: say what you',
            'changed in the summary and leave the branch for a person to land.',
            ''
        )
        if (commits) {
            lines.push(
                'COMMIT what you change on that branch before you finish, in as many commits as the',
                'work deserves. A change you leave uncommitted is not on the branch, so there is',
                'nothing for anyone to land and nothing to review, and the workspace may be removed',
                'from under it.',
                ''
            )
        } else {
            lines.push(
                'Do NOT try to commit: your sandbox refuses every write to the git metadata, so',
                'git add and git commit fail here by design. Leave your changes in the working tree',
                'and the board commits them on the branch, as one commit named after this card,',
                'the moment you finish. Do not treat the failed commit as a blocker.',
                ''
            )
        }
    }
    if (card.workspaceKind === 'scratch') {
        lines.push(
            'It is a SCRATCH workspace and it is DELETED when this card completes. Anything worth',
            'keeping must be listed in `artifacts` below, as a path relative to this directory.',
            ''
        )
    } else {
        lines.push('It is a shared directory and it is preserved.', '')
    }

    lines.push('## How to finish', '')
    lines.push(
        'Write everything in English, whatever the machine you are running on prefers.',
        '',
        'End your last message with a block in exactly this shape, on its own lines, and nothing',
        'after it:',
        '',
        '```',
        MARKER,
        '{ "outcome": "completed" | "blocked",',
        '  "blockKind": "needs_input" | "capability" | "transient" | "dependency" | null,',
        '  "summary": "what changed, what is verified, what is left",',
        '  "artifacts": ["relative/path"],',
        '  "handoff": ["relative/path"],',
        '  "followups": [ { "title": "...", "body": "..." } ] }',
        '```',
        '',
        '`artifacts` is output for the operator: the files they should look at. `handoff` is input',
        'for the next worker on this card, the notes or files a reviewer or a retry should read;',
        'the board attaches them to the next brief, and only yours, not those of earlier attempts.',
        'Both are paths relative to your working directory. Leave either empty rather than guess.',
        '',
        'Use `blocked` when a person has to decide something, when the job needs a capability you',
        'do not have, or when it depends on work that is not done. `followups` is how you file',
        'the problems you found but did not fix: each one becomes a new card that depends on this',
        'one. You cannot change the board any other way, and you should not try.',
        ''
    )

    return lines.join('\n')
}

const CLAUDE_RESTRAINT = [
    'You are in PLAN MODE and you have NO SHELL: Bash and PowerShell are denied to you, on',
    'purpose. You are not being trusted less than the implementer was. It is that a review',
    'which reaches for a shell stops dead waiting for a permission nobody is there to give,',
    'and a stopped review is worth less than no review. Do not try to leave plan mode, and do',
    'not end by proposing a plan. The judgement below IS your output.'
]

export function reviewBrief(
    card: Card,
    reviewed: Run,
    workspace: string,
    attachments: Given[] = [],
    change: Patch | null = null,
    patchPath: string | null = null,
    restraint: string[] = CLAUDE_RESTRAINT
): string {
    const lines: string[] = []

    lines.push(`# Review: ${card.title}`, '')
    lines.push(
        'Another agent did this work. You are here to judge it, not to continue it, and NOT to',
        'change it: you are in the checkout the operator works in, and nothing you write here is',
        'wanted. Read, decide, and say what you decided.',
        '',
        ...restraint,
        '',
        'You do not need a shell, because the change is already below. The board ran the diff for',
        'you rather than asking you to. Read it, and read whatever else you need with Read, Glob',
        'and Grep, which you do have and which reach the whole checkout.',
        '',
        'Judge from that diff and from what the implementer says it did. If the two disagree,',
        'the diff is what happened. If you cannot be sure without EXECUTING something, that is a',
        'legitimate answer and not a failure: say `changes` and name exactly what you would have',
        'run and what you expected it to show.',
        ''
    )

    lines.push('## What the card asked for', '')
    lines.push(card.body.trim() || 'The card carried no description beyond its title.', '')

    listGiven(lines, attachments, 'the card')

    if (card.comments.length) {
        lines.push('## Thread', '')
        for (const entry of card.comments) lines.push(`**${entry.author}**: ${entry.text}`, '')
    }

    lines.push('## What the implementer says it did', '')
    lines.push(reviewed.summary?.trim() || 'It closed without a recorded summary.', '')

    lines.push('## Where the work is', '')
    lines.push(`Your working directory is \`${workspace}\`.`, '')
    if (reviewed.branch) {
        lines.push(`The work is on branch \`${reviewed.branch}\`, and it is not merged.`, '')
        if (reviewed.worktree) {
            lines.push(`It was written in \`${reviewed.worktree}\`, which may already be gone.`, '')
        }
    } else {
        lines.push('There is no branch: judge the state of the working directory itself.', '')
    }

    lines.push('## The change', '')
    if (!change) {
        lines.push(
            'The board could not produce a diff for this run. That is itself worth saying: if you',
            'cannot find the change by reading, `blocked` is the honest answer.',
            ''
        )
    } else if (!change.text.trim()) {
        lines.push(
            'The diff is EMPTY. The branch exists and nothing was committed to it, whatever the',
            'implementer says it did. Judge that, do not go looking for the work elsewhere.',
            ''
        )
    } else {
        lines.push('```text', change.stat, '```', '')
        if (change.truncated) {
            lines.push(
                `This change is larger than the ${DIFF_LIMIT} characters carried here, so what`,
                `follows is the beginning of it. The whole patch is at \`${patchPath ?? 'the run folder'}\`.`,
                'Judging a change you have only half read is not judging it: read the rest before',
                'you decide, or say `blocked` and say why.',
                ''
            )
        }
        if (change.text.length <= DIFF_INLINE) {
            lines.push('```diff', change.text, '```', '')
        } else {
            lines.push(
                `The patch is ${change.text.length} characters, too much to sit in this brief.`,
                `Read it at \`${patchPath ?? 'the run folder'}\`. The summary above is what it touches.`,
                ''
            )
        }
    }

    lines.push('## How to finish', '')
    lines.push(
        'Write everything in English, whatever the machine you are running on prefers.',
        '',
        'End your last message with a block in exactly this shape, on its own lines, and nothing',
        'after it:',
        '',
        '```',
        MARKER,
        '{ "outcome": "completed" | "blocked",',
        '  "verdict": "approved" | "changes",',
        '  "blockKind": "needs_input" | "capability" | "transient" | "dependency" | null,',
        '  "summary": "what you judged, and what is wrong with it",',
        '  "artifacts": [],',
        '  "followups": [ { "title": "...", "body": "..." } ] }',
        '```',
        '',
        '`verdict` is the review, and a review that completes without one is a broken review: the',
        'board will not guess it. Use `approved` when the work does what the card asked and you',
        'would land it. Use `changes` when it does not, and then the summary is the whole brief',
        'the next implementer gets, so write it as instructions rather than as a complaint.',
        '',
        'Use `blocked` only when you cannot judge at all: the branch is not there, the card does',
        'not say enough to judge against, or a person has to decide something first. `followups`',
        'is for the problems you found that are NOT this one to fix; each one becomes a new card.',
        ''
    )

    return lines.join('\n')
}

export async function start(
    card: Card,
    parents: Card[],
    runId: string,
    workspace: string,
    attachments: Given[] = [],
    reviewing: Run | null = null,
    chosen: Resolved = { harness: harness.DEFAULT_HARNESS, model: null, effort: null }
): Promise<Started> {
    const driver = harness.driver(chosen.harness)
    if (!(await driver.binary())) throw new Error(`${chosen.harness} is not on PATH`)

    const info = await stat(workspace).catch(() => null)
    if (!info?.isDirectory()) throw new Error(`'${workspace}' is not an existing directory`)

    const folder = join(workspace, '.dyakanban', runId)
    await mkdir(folder, { recursive: true })
    await writeFile(join(workspace, '.dyakanban', '.gitignore'), '*\n', 'utf-8')
    const briefPath = join(folder, 'brief.md')

    const isolate =
        !reviewing && (await tracked(workspace)) ? `kanban-${runId.slice(0, 8)}` : null
    const predicted = isolate ? driver.worktreePath(workspace, isolate) : workspace
    if (isolate && !driver.isolates) {
        await mkdir(dirname(predicted), { recursive: true })
        const made = await git(workspace, ['worktree', 'add', '-b', `worktree-${isolate}`, predicted])
        if (made === null) throw new Error(`git could not add a worktree at ${predicted}`)
    }

    let change: Patch | null = null
    let patchPath: string | null = null
    if (reviewing) {
        change = await patch(workspace, reviewing.headBefore, reviewing.branch)
        if (change?.text.trim()) {
            patchPath = join(folder, 'diff.patch')
            await writeFile(patchPath, change.text, 'utf-8')
        }
    }

    const text = reviewing
        ? reviewBrief(card, reviewing, workspace, attachments, change, patchPath, driver.restraint())
        : brief(card, parents, predicted, isolate !== null, attachments, driver.commits)
    await writeFile(briefPath, text, 'utf-8')
    const prompt =
        text.length <= INLINE_LIMIT
            ? text
            : `Read ${briefPath} and do what it says. It is your whole brief.`

    const dirs = [workspace]
    for (const file of attachments) {
        const holder = dirname(file.path)
        if (!dirs.includes(holder)) dirs.push(holder)
    }

    const launched = await driver.launch({
        runId,
        kind: reviewing ? 'review' : 'implement',
        name: (reviewing ? `review: ${card.title}` : card.title).slice(0, 60),
        prompt,
        briefPath,
        workspace,
        addDirs: dirs,
        isolate,
        permissionMode: card.permissionMode,
        model: chosen.model,
        effort: chosen.effort
    })

    const place = launched.worktree ?? workspace

    return {
        shortId: launched.shortId,
        sessionId: launched.sessionId,
        headBefore: await head(place),
        worktree: launched.worktree,
        branch: launched.worktree ? await git(launched.worktree, ['rev-parse', '--abbrev-ref', 'HEAD']) : null
    }
}
