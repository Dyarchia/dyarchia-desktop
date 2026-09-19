export type Status =
    | 'triage'
    | 'todo'
    | 'scheduled'
    | 'ready'
    | 'running'
    | 'blocked'
    | 'review'
    | 'done'
    | 'archived'

export type BlockKind = 'dependency' | 'needs_input' | 'capability' | 'transient'

export type Outcome = 'completed' | 'blocked' | 'crashed' | 'stopped' | 'violation'

export type WorkspaceKind = 'scratch' | 'dir'

export type RunKind = 'implement' | 'review'

export type Verdict = 'approved' | 'changes'

import type { HarnessId } from './harness/ids.js'

export type { HarnessId }

export interface Runner {
    harness: HarnessId | null
    model: string | null
    effort: string | null
}

export interface Runners {
    implement: Runner
    review: Runner
}

export interface RunnersPatch {
    implement?: Partial<Runner>
    review?: Partial<Runner>
}

export interface HarnessInfo {
    id: HarnessId
    label: string
    available: boolean
    models: string[]
    efforts: string[] | null
}

export interface Run {
    runId: string
    kind: RunKind
    harness: HarnessId
    sessionId: string | null
    shortId: string | null
    worktree: string | null
    branch: string | null
    startedAt: number
    endedAt: number | null
    outcome: Outcome | null
    summary: string | null
    artifacts: string[]
    kept: string[]
    handoff: string[]
    inputTokens: number
    outputTokens: number
    error: string | null
    headBefore: string | null
}

export interface Attachment {
    name: string
    bytes: number
    at: number
}

export interface Comment {
    at: number
    author: 'user' | 'agent'
    text: string
}

export interface Card {
    id: string
    rev: number
    title: string
    body: string
    status: Status
    priority: number
    assignee: string
    workdir: string | null
    workspaceKind: WorkspaceKind
    runners: Runners
    maxRuntimeSeconds: number | null
    maxRetries: number | null
    permissionMode: string
    scheduledFor: number | null
    parents: string[]
    attachments: Attachment[]
    runs: Run[]
    comments: Comment[]
    consecutiveFailures: number
    protocolViolations: number
    blockRecurrences: number
    blockKind: BlockKind | null
    lastBlockKind: BlockKind | null
    sourcePhase: 'ready' | 'review' | null
    locked: boolean
    createdAt: number
    updatedAt: number
}

export interface BoardMeta {
    slug: string
    name: string
    workdir: string
    archived: boolean
    createdAt: number
    order: number
    maxRunning: number | null
    runners: Runners
}

export interface Settings {
    maxRunning: number
}

export interface BoardFile {
    version: number
    cards: Card[]
}

export interface Rules {
    order: Status[]
    allow: Record<Status, Status[]>
    confirm: Record<string, string>
    labels: Record<Status, string>
    tone: Record<Status, string>
}

export interface BoardPayload {
    board: BoardMeta
    cards: Card[]
    rules: Rules
    now: number
}

export interface CardDraft {
    title: string
    body?: string
    status?: Status
    priority?: number
    workdir?: string | null
    workspaceKind?: WorkspaceKind
    runners?: RunnersPatch
    maxRuntimeSeconds?: number | null
    maxRetries?: number | null
    permissionMode?: string
    scheduledFor?: number | null
    parents?: string[]
}

export type CardPatch = Partial<
    Pick<
        Card,
        | 'title'
        | 'body'
        | 'priority'
        | 'workdir'
        | 'workspaceKind'
        | 'maxRuntimeSeconds'
        | 'maxRetries'
        | 'permissionMode'
        | 'scheduledFor'
        | 'parents'
    >
> & { runners?: RunnersPatch }

export interface BoardDraft {
    slug: string
    name: string
    workdir: string
    maxRunning?: number | null
    runners?: RunnersPatch
}

export interface WatchRun {
    slug: string
    board: string
    cardId: string
    title: string
    runId: string
    kind: RunKind
    startedAt: number
    state: string
    tool: string | null
    inputTokens: number
    outputTokens: number
    waiting: boolean
}

export interface WatchBoard {
    slug: string
    name: string
    cap: number
    running: number
    counts: Record<Status, number>
}

export interface WatchDecision {
    slug: string
    board: string
    at: number
    cardId: string
    title: string
    kind: string
    detail: string
}

export interface Overview {
    at: number
    holding: boolean
    across: number
    running: number
    boards: WatchBoard[]
    runs: WatchRun[]
    decisions: WatchDecision[]
    problems: { slug: string; cardId: string | null; problem: string }[]
}

export type KanbanEvent =
    | { type: 'boards:changed' }
    | { type: 'board:changed'; slug: string }
