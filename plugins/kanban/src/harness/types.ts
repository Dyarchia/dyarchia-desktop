import type { HarnessId, Run, RunKind } from '../types.js'

export type Liveness = 'alive' | 'dead' | 'unknown'

export interface LaunchSpec {
    kind: RunKind
    name: string
    prompt: string
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
 * answers them from a process table rather than a registry is free to ignore it.
 */
export interface Driver {
    id: HarnessId
    label: string
    models: string[]
    efforts: string[] | null
    binary(): Promise<string | null>
    launch(spec: LaunchSpec): Promise<Launched>
    worktreePath(workspace: string, isolate: string): string
    poll(): Promise<unknown>
    liveness(snapshot: unknown, run: Run): Liveness
    state(snapshot: unknown, run: Run): string | null
    waiting(snapshot: unknown, run: Run): boolean
    stop(run: Run): Promise<void>
    progress(place: string, run: Run): Promise<Progress | null>
    history(place: string, run: Run): Promise<HistoryRow[]>
    attach(run: Run): Promise<Invocation>
}

export interface Fleet {
    liveness(run: Run): Liveness
    state(run: Run): string | null
    waiting(run: Run): boolean
}
