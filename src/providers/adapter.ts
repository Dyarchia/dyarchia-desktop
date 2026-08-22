import type { RouteId, Usage } from '../types.js'

export interface Turn {
    role: 'user' | 'assistant'
    content: string
}

export interface CompletionRequest {
    model: string
    system: string
    prompt: string
    temperature: number
    maxTokens: number
    json: boolean
    signal: AbortSignal
    history: Turn[]
    session: string | null
    onDelta(text: string): void
}

export interface CompletionResult {
    text: string
    usage: Usage
    ms: number
    session: string | null
}

export interface RouteStatus {
    available: boolean
    reason?: string
}

export interface Route {
    id: RouteId
    label: string
    status(): Promise<RouteStatus>
    models(): Promise<{ id: string; label: string }[]>
    complete(request: CompletionRequest): Promise<CompletionResult>
}

export const NO_USAGE: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costUsd: null,
    billing: 'plan'
}
