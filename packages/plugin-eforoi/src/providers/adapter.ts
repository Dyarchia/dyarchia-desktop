import type { RouteId, Usage } from '../types.js'

export interface CompletionRequest {
    model: string
    system: string
    prompt: string
    temperature: number
    maxTokens: number
    signal: AbortSignal
    effort: string | null
    onDelta(text: string): void
}

export interface CompletionResult {
    text: string
    usage: Usage
    ms: number
    searches: number | null
}

export interface ModelInfo {
    id: string
    label: string
    efforts?: string[]
}

export interface RouteStatus {
    available: boolean
    reason?: string
}

export interface Route {
    id: RouteId
    label: string
    status(): Promise<RouteStatus>
    models(): Promise<ModelInfo[]>
    complete(request: CompletionRequest): Promise<CompletionResult>
}

export const NO_USAGE: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costUsd: null,
    billing: 'plan'
}
