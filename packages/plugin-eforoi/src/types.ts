export type Mode = 'subscription' | 'api'

export type RouteId = 'claude' | 'codex' | 'opencode' | 'anthropic' | 'openai'

export type Billing = 'plan' | 'metered'

export interface ModeOffer {
    mode: Mode
    route: RouteId
    model: string
    efforts: string[]
    available: boolean
    reason?: string
}

export interface CatalogEntry {
    key: string
    label: string
    group: string
    rank: number
    modes: ModeOffer[]
}

export interface Catalog {
    entries: CatalogEntry[]
    routes: Record<RouteId, { available: boolean; reason?: string }>
}

export interface Seat {
    key: string
    mode: Mode
    effort?: string
}

export interface SavedPanel {
    name: string
    panel: Seat[]
    analyst: Seat | null
    saved: string
}

export interface PanelStore {
    path: string
    items: SavedPanel[]
}

export interface RunConfig {
    prompt: string
    panel: Seat[]
    analyst: Seat
    temperature: number
    maxTokens: number
}

export interface Usage {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    costUsd: number | null
    billing: Billing
}

export interface MemberResult {
    index: number
    seat: Seat
    text: string
    usage: Usage
    ms: number
    searches: number | null
    error?: string
}

export interface ConsensusPoint {
    claim: string
    supported_by: number[]
}

export interface Contradiction {
    topic: string
    positions: { member: number; position: string }[]
}

export interface PartialCoverage {
    point: string
    covered_by: number[]
}

export interface UniqueInsight {
    member: number
    insight: string
}

export interface Analysis {
    consensus: ConsensusPoint[]
    contradictions: Contradiction[]
    partial_coverage: PartialCoverage[]
    unique_insights: UniqueInsight[]
    blind_spots: string[]
}

export interface RunSummary {
    ms: number
    costUsd: number
    meteredCostUsd: number
    inputTokens: number
    outputTokens: number
}

export const EMPTY_ANALYSIS: Analysis = {
    consensus: [],
    contradictions: [],
    partial_coverage: [],
    unique_insights: [],
    blind_spots: []
}

export type Stage = 'panel' | 'analysis' | 'answer'

export type RunEvent =
    | { runId: string; type: 'stage'; stage: Stage }
    | { runId: string; type: 'member:delta'; index: number; text: string }
    | { runId: string; type: 'member:done'; result: MemberResult }
    | { runId: string; type: 'analysis'; analysis: Analysis; usage: Usage; ms: number; attempt: number }
    | { runId: string; type: 'answer:delta'; text: string }
    | { runId: string; type: 'done'; answer: string; summary: RunSummary }
    | { runId: string; type: 'error'; message: string }

export interface KeyState {
    anthropic: 'stored' | 'environment' | 'none'
    openai: 'stored' | 'environment' | 'none'
}
