import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { Usage } from '../types.js'
import type { CompletionRequest, CompletionResult, Route, RouteStatus } from './adapter.js'

interface Price {
    input: number
    output: number
    cached: number
}

const ANTHROPIC_PRICES: Record<string, Price> = {
    'claude-fable-5': { input: 10, output: 50, cached: 1 },
    'claude-opus-5': { input: 5, output: 25, cached: 0.5 },
    'claude-opus-4-8': { input: 5, output: 25, cached: 0.5 },
    'claude-opus-4-7': { input: 5, output: 25, cached: 0.5 },
    'claude-opus-4-6': { input: 5, output: 25, cached: 0.5 },
    'claude-sonnet-5': { input: 3, output: 15, cached: 0.3 },
    'claude-sonnet-4-6': { input: 3, output: 15, cached: 0.3 },
    'claude-haiku-4-5': { input: 1, output: 5, cached: 0.1 }
}

const OPENAI_PRICES: Record<string, Price> = {}

function priceOf(table: Record<string, Price>, model: string): Price | null {
    if (table[model]) return table[model]
    const prefix = Object.keys(table)
        .filter((key) => model.startsWith(key))
        .sort((a, b) => b.length - a.length)[0]
    return prefix ? table[prefix] : null
}

function cost(table: Record<string, Price>, model: string, usage: Usage): number | null {
    const price = priceOf(table, model)
    if (!price) return null
    const millions = (tokens: number): number => tokens / 1_000_000
    return (
        millions(usage.inputTokens) * price.input +
        millions(usage.outputTokens) * price.output +
        millions(usage.cachedTokens) * price.cached
    )
}

async function anthropicComplete(apiKey: string, request: CompletionRequest): Promise<CompletionResult> {
    const client = new Anthropic({ apiKey })
    const started = Date.now()

    const stream = client.messages.stream(
        {
            model: request.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: 'user', content: request.prompt }]
        },
        { signal: request.signal }
    )

    stream.on('text', (text) => request.onDelta(text))
    const message = await stream.finalMessage()

    const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

    const usage: Usage = {
        inputTokens: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
        outputTokens: message.usage.output_tokens,
        cachedTokens: message.usage.cache_read_input_tokens ?? 0,
        costUsd: null,
        billing: 'metered'
    }
    usage.costUsd = cost(ANTHROPIC_PRICES, request.model, usage)

    if (message.stop_reason === 'refusal') {
        throw new Error(`refused: ${message.stop_details?.category ?? 'unspecified'}`)
    }

    return { text, usage, ms: Date.now() - started }
}

async function openaiComplete(apiKey: string, request: CompletionRequest): Promise<CompletionResult> {
    const client = new OpenAI({ apiKey })
    const started = Date.now()

    const stream = await client.chat.completions.create(
        {
            model: request.model,
            max_completion_tokens: request.maxTokens,
            messages: [
                { role: 'system', content: request.system },
                { role: 'user', content: request.prompt }
            ],
            stream: true,
            stream_options: { include_usage: true }
        },
        { signal: request.signal }
    )

    let text = ''
    const usage: Usage = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: null,
        billing: 'metered'
    }

    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
            text += delta
            request.onDelta(delta)
        }
        if (!chunk.usage) continue
        usage.cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
        usage.inputTokens = chunk.usage.prompt_tokens - usage.cachedTokens
        usage.outputTokens = chunk.usage.completion_tokens
    }

    usage.costUsd = cost(OPENAI_PRICES, request.model, usage)
    return { text, usage, ms: Date.now() - started }
}

function missing(variable: string): RouteStatus {
    return { available: false, reason: `no API key: set ${variable} or store one from the panel` }
}

export function anthropicRoute(key: () => Promise<string | null>): Route {
    return {
        id: 'anthropic',
        label: 'Anthropic API',
        async status() {
            return (await key()) ? { available: true } : missing('ANTHROPIC_API_KEY')
        },
        async models() {
            const apiKey = await key()
            if (!apiKey) return []
            try {
                const page = await new Anthropic({ apiKey }).models.list({ limit: 50 })
                return page.data.map((model) => ({ id: model.id, label: model.display_name ?? model.id }))
            } catch {
                return Object.keys(ANTHROPIC_PRICES).map((id) => ({ id, label: id }))
            }
        },
        async complete(request) {
            const apiKey = await key()
            if (!apiKey) throw new Error('no Anthropic API key')
            return anthropicComplete(apiKey, request)
        }
    }
}

export function openaiRoute(key: () => Promise<string | null>): Route {
    return {
        id: 'openai',
        label: 'OpenAI API',
        async status() {
            return (await key()) ? { available: true } : missing('OPENAI_API_KEY')
        },
        async models() {
            const apiKey = await key()
            if (!apiKey) return []
            try {
                const page = await new OpenAI({ apiKey }).models.list()
                return page.data
                    .map((model) => model.id)
                    .filter((id) => id.startsWith('gpt-') || id.startsWith('o'))
                    .sort()
                    .map((id) => ({ id, label: id }))
            } catch {
                return []
            }
        },
        async complete(request) {
            const apiKey = await key()
            if (!apiKey) throw new Error('no OpenAI API key')
            return openaiComplete(apiKey, request)
        }
    }
}
