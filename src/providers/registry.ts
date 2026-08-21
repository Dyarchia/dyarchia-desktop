import type { Catalog, CatalogEntry, ModeOffer, RouteId, Seat } from '../types.js'
import type { CompletionRequest, CompletionResult, Route } from './adapter.js'
import { anthropicRoute, openaiRoute } from './api.js'
import { cliRoute } from './cli.js'
import { readKey, scratch } from './keys.js'

const ANTHROPIC_PAIRS: { alias: string; api: string; label: string }[] = [
    { alias: 'opus', api: 'claude-opus-5', label: 'Claude Opus 5' },
    { alias: 'sonnet', api: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { alias: 'haiku', api: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }
]

const routes: Record<RouteId, Route> = {
    claude: cliRoute('claude', scratch),
    codex: cliRoute('codex', scratch),
    opencode: cliRoute('opencode', scratch),
    anthropic: anthropicRoute(() => readKey('anthropic')),
    openai: openaiRoute(() => readKey('openai'))
}

const ROUTE_IDS = Object.keys(routes) as RouteId[]

let cached: Catalog | null = null

function offer(
    mode: 'subscription' | 'api',
    route: RouteId,
    model: string,
    present: boolean,
    routeReason?: string
): ModeOffer {
    if (routeReason) return { mode, route, model, available: false, reason: routeReason }
    if (!present) return { mode, route, model, available: false, reason: `${route} does not offer ${model}` }
    return { mode, route, model, available: true }
}

export async function catalog(refresh = false): Promise<Catalog> {
    if (cached && !refresh) return cached

    const status = Object.fromEntries(
        await Promise.all(ROUTE_IDS.map(async (id) => [id, await routes[id].status()] as const))
    ) as Catalog['routes']

    const models = Object.fromEntries(
        await Promise.all(
            ROUTE_IDS.map(async (id) => {
                const list = status[id].available ? await routes[id].models() : []
                return [id, list] as const
            })
        )
    ) as Record<RouteId, { id: string; label: string }[]>

    const has = (route: RouteId, model: string): boolean => models[route].some((entry) => entry.id === model)
    const entries: CatalogEntry[] = []
    const rank = (): number => entries.length

    for (const pair of ANTHROPIC_PAIRS) {
        entries.push({
            key: `anthropic/${pair.api}`,
            label: pair.label,
            group: 'Anthropic',
            rank: rank(),
            modes: [
                offer('subscription', 'claude', pair.alias, has('claude', pair.alias), status.claude.reason),
                offer('api', 'anthropic', pair.api, has('anthropic', pair.api), status.anthropic.reason)
            ]
        })
    }

    for (const model of models.anthropic) {
        if (ANTHROPIC_PAIRS.some((pair) => pair.api === model.id)) continue
        entries.push({
            key: `anthropic/${model.id}`,
            label: model.label,
            group: 'Anthropic',
            rank: rank(),
            modes: [
                offer('subscription', 'claude', model.id, false, 'not exposed by the Claude Code CLI'),
                offer('api', 'anthropic', model.id, true)
            ]
        })
    }

    const openaiIds = [...new Set([...models.codex.map((m) => m.id), ...models.openai.map((m) => m.id)])]
    for (const id of openaiIds) {
        entries.push({
            key: `openai/${id}`,
            label: id,
            group: 'OpenAI',
            rank: rank(),
            modes: [
                offer('subscription', 'codex', id, has('codex', id), status.codex.reason),
                offer('api', 'openai', id, has('openai', id), status.openai.reason)
            ]
        })
    }

    for (const model of models.opencode) {
        entries.push({
            key: `opencode/${model.id}`,
            label: model.label,
            group: `opencode · ${model.id.split('/')[0]}`,
            rank: rank(),
            modes: [
                offer('subscription', 'opencode', model.id, true),
                offer('api', 'opencode', model.id, false, 'opencode routes through its own plan, not a raw API')
            ]
        })
    }

    cached = { entries, routes: status }
    return cached
}

export function invalidate(): void {
    cached = null
}

export async function resolve(seat: Seat): Promise<{ route: Route; model: string; entry: CatalogEntry }> {
    const current = await catalog()
    const entry = current.entries.find((candidate) => candidate.key === seat.key)
    if (!entry) throw new Error(`unknown model ${seat.key}`)

    const mode = entry.modes.find((candidate) => candidate.mode === seat.mode)
    if (!mode) throw new Error(`${entry.label} has no ${seat.mode} mode`)
    if (!mode.available) throw new Error(mode.reason ?? `${entry.label} is unavailable over ${seat.mode}`)

    return { route: routes[mode.route], model: mode.model, entry }
}

export async function complete(
    seat: Seat,
    request: Omit<CompletionRequest, 'model'>
): Promise<CompletionResult> {
    const { route, model } = await resolve(seat)
    const result = await route.complete({ ...request, model })
    if (route.id === 'claude' || route.id === 'codex' || route.id === 'opencode') {
        result.usage.billing = 'plan'
    }
    return result
}
