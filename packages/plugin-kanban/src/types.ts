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

export interface Run {
    runId: string
    kind: RunKind
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
    model: string | null
    effort: string | null
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
    model?: string | null
    effort?: string | null
    maxRuntimeSeconds?: number | null
    maxRetries?: number | null
    permissionMode?: string
    scheduledFor?: number | null
    parents?: string[]
}

export type CardPatch = Partial<
    Omit<Card, 'id' | 'rev' | 'runs' | 'comments' | 'attachments' | 'createdAt'>
>

export interface BoardDraft {
    slug: string
    name: string
    workdir: string
    maxRunning?: number | null
}

export type KanbanEvent =
    | { type: 'boards:changed' }
    | { type: 'board:changed'; slug: string }
