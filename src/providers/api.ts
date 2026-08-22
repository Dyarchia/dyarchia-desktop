import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { Usage } from '../types.js'
import type { CompletionRequest, CompletionResult, ModelInfo, Route, RouteStatus } from './adapter.js'

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

const MAX_WEB_USES = 4
const LEGACY_TOOLS = /haiku|-4-5/
type AnthropicEffort = NonNullable<Anthropic.Messages.OutputConfig['effort']>
type OpenAIEffort = NonNullable<OpenAI.ReasoningEffort>

const ANTHROPIC_EFFORTS: AnthropicEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const OPENAI_EFFORTS: OpenAIEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function anthropicTools(model: string): Anthropic.ToolUnion[] {
    const legacy = LEGACY_TOOLS.test(model)
    return [
        {
            type: legacy ? 'web_search_20250305' : 'web_search_20260209',
            name: 'web_search',
            max_uses: MAX_WEB_USES
        },
        {
            type: legacy ? 'web_fetch_20250910' : 'web_fetch_20260209',
            name: 'web_fetch',
            max_uses: MAX_WEB_USES
        }
    ]
}

async function anthropicComplete(apiKey: string, request: CompletionRequest): Promise<CompletionResult> {
    const client = new Anthropic({ apiKey })
    const started = Date.now()

    const messages: Anthropic.MessageParam[] = [
        ...request.history.map((turn): Anthropic.MessageParam => ({
            role: turn.role,
            content: turn.content
        })),
        { role: 'user', content: request.prompt }
    ]
    const usage: Usage = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: null,
        billing: 'metered'
    }

    let text = ''

    for (let turn = 0; turn <= MAX_WEB_USES; turn += 1) {
        const stream = client.messages.stream(
            {
                model: request.model,
                max_tokens: request.maxTokens,
                system: request.system,
                tools: anthropicTools(request.model),
                ...(request.effort
                    ? { output_config: { effort: request.effort as AnthropicEffort } }
                    : {}),
                messages
            },
            { signal: request.signal }
        )

        stream.on('text', (chunk) => request.onDelta(chunk))
        const message = await stream.finalMessage()

        usage.inputTokens += message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0)
        usage.outputTokens += message.usage.output_tokens
        usage.cachedTokens += message.usage.cache_read_input_tokens ?? 0

        text += message.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('')

        if (message.stop_reason === 'refusal') {
            throw new Error(`refused: ${message.stop_details?.category ?? 'unspecified'}`)
        }

        if (message.stop_reason !== 'pause_turn') break
        messages.push({ role: 'assistant', content: message.content })
    }

    usage.costUsd = cost(ANTHROPIC_PRICES, request.model, usage)
    return { text, usage, ms: Date.now() - started, session: null }
}

async function openaiComplete(apiKey: string, request: CompletionRequest): Promise<CompletionResult> {
    const client = new OpenAI({ apiKey })
    const started = Date.now()

    const stream = await client.responses.create(
        {
            model: request.model,
            instructions: request.system,
            input: [
                ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
                { role: 'user' as const, content: request.prompt }
            ],
            max_output_tokens: request.maxTokens,
            tools: [{ type: 'web_search' }],
            ...(request.effort ? { reasoning: { effort: request.effort as OpenAIEffort } } : {}),
            stream: true
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

    for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
            text += event.delta
            request.onDelta(event.delta)
            continue
        }
        if (event.type !== 'response.completed') continue
        const totals = event.response.usage
        if (!totals) continue
        usage.cachedTokens = totals.input_tokens_details?.cached_tokens ?? 0
        usage.inputTokens = totals.input_tokens - usage.cachedTokens
        usage.outputTokens = totals.output_tokens
    }

    usage.costUsd = cost(OPENAI_PRICES, request.model, usage)
    return { text, usage, ms: Date.now() - started, session: null }
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
                return page.data.map(
                    (model): ModelInfo => ({
                        id: model.id,
                        label: model.display_name ?? model.id,
                        efforts: LEGACY_TOOLS.test(model.id) ? [] : ANTHROPIC_EFFORTS
                    })
                )
            } catch {
                return Object.keys(ANTHROPIC_PRICES).map(
                    (id): ModelInfo => ({
                        id,
                        label: id,
                        efforts: LEGACY_TOOLS.test(id) ? [] : ANTHROPIC_EFFORTS
                    })
                )
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
                    .map((id): ModelInfo => ({ id, label: id, efforts: OPENAI_EFFORTS }))
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
