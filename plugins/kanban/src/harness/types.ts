import type { HarnessId, Run, RunKind } from '../types.js'

export type Liveness = 'alive' | 'dead' | 'unknown'

export interface LaunchSpec {
    runId: string
    kind: RunKind
    name: string
    prompt: string
    briefPath: string
    workspace: string
    addDirs: string[]
    isolate: string | null
    permissionMode: string
    model: string | null
    effort: string | null
}

export interface Launched {
    shortId: string
    sessionId: string
    worktree: string | null
}

export interface TerminalBlock {
    outcome: 'completed' | 'blocked'
    verdict: 'approved' | 'changes' | null
    blockKind: 'dependency' | 'needs_input' | 'capability' | 'transient' | null
    summary: string
    artifacts: string[]
    handoff: string[]
    followups: { title: string; body: string }[]
}

export interface Progress {
    tool: string | null
    inputTokens: number
    outputTokens: number
    ended: boolean
    lastText: string
    terminal: TerminalBlock | null
    error: string | null
    modifiedAt: number
    /*
     * The mode the session is actually in, as the session itself records it, which is not always
     * the mode it was launched with. A driver that cannot report it leaves this null and the
     * board asks nothing.
     */
    permissionMode: string | null
}

export interface HistoryRow {
    at: number
    kind: 'text' | 'thinking' | 'tool' | 'result' | 'end'
    label: string
    body: string
    error: boolean
}

export interface Invocation {
    file: string
    args: string[]
}

/*
 * Everything the board asks of an agent, and nothing else. A harness that answers these
 * runs a card; the brief, the closing block, the lease, the stall detector and the
 * verdict never see which one did. `poll` is taken once per sweep and handed back to the
 * three liveness questions, because one listing per tick is the budget and a harness that
 * answers them from its own process table is free to ignore it. `isolates` says whether
 * the harness makes the worktree itself; when it does not, the board makes one before the
 * launch and hands it over as the working directory. `restraint` is the paragraph of the
 * review brief that names how this harness keeps a reviewer from writing, because the
 * mechanism is the harness's and the reviewer is told the truth about it. `commits` says
 * whether a worker under this harness can commit at all; when it cannot, the brief
 * says so and the board commits what the worker leaves on the branch.
 */
export interface Driver {
    id: HarnessId
    label: string
    isolates: boolean
    commits: boolean
    efforts: string[] | null
    binary(): Promise<string | null>
    models(): Promise<string[]>
    restraint(): string[]
    launch(spec: LaunchSpec): Promise<Launched>
    worktreePath(workspace: string, isolate: string): string
    poll(): Promise<unknown>
    liveness(snapshot: unknown, run: Run): Liveness
    state(snapshot: unknown, run: Run): string | null
    waiting(snapshot: unknown, run: Run): boolean
    orphaned(run: Run): boolean
    stop(run: Run): Promise<void>
    /*
     * Let the run's session go, for good. `stop` ends the work and keeps the session alive on
     * purpose, so it can be attached again; `release` is what actually frees the process, and for
     * a harness whose sessions own a worktree it takes the worktree and the branch with it. The
     * board calls it only where that is what it wants.
     */
    release(run: Run): Promise<void>
    progress(place: string, run: Run): Promise<Progress | null>
    history(place: string, run: Run): Promise<HistoryRow[]>
    attach(run: Run): Promise<Invocation>
}

export interface Fleet {
    liveness(run: Run): Liveness
    state(run: Run): string | null
    waiting(run: Run): boolean
}
