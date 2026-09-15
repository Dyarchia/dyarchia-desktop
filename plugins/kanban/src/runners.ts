import { DEFAULT_HARNESS, isHarness } from './harness/index.js'
import { Refusal } from './refusal.js'
import type { HarnessId, Runner, Runners, RunnersPatch, RunKind } from './types.js'

const NAME_LIMIT = 80

export interface Resolved {
    harness: HarnessId
    model: string | null
    effort: string | null
}

function empty(): Runner {
    return { harness: null, model: null, effort: null }
}

export function blank(): Runners {
    return { implement: empty(), review: empty() }
}

function name(value: unknown, what: string): string | null {
    if (value === undefined || value === null) return null
    const text = String(value).trim()
    if (!text) return null
    if (text.length > NAME_LIMIT) throw new Refusal(`a ${what} name is at most ${NAME_LIMIT} characters`)
    return text
}

function harness(value: unknown): HarnessId | null {
    if (value === undefined || value === null || value === '') return null
    if (!isHarness(value)) throw new Refusal(`'${String(value)}' is not a harness this board knows`)
    return value
}

function one(current: Runner, patch: Partial<Runner> | undefined): Runner {
    if (!patch || typeof patch !== 'object') return { ...current }
    return {
        harness: patch.harness === undefined ? current.harness : harness(patch.harness),
        model: patch.model === undefined ? current.model : name(patch.model, 'model'),
        effort: patch.effort === undefined ? current.effort : name(patch.effort, 'effort')
    }
}

export function merge(current: Runners, patch: RunnersPatch | undefined): Runners {
    return {
        implement: one(current.implement, patch?.implement),
        review: one(current.review, patch?.review)
    }
}

/*
 * A board written before runners existed carried one model and one effort on the card, and
 * they were the implementer's: the reviewer inherited them by omission. Reading them into
 * the implement phase keeps that board running exactly as it did, and leaves the review
 * phase to inherit, which is now a choice rather than a gap.
 */
export function restore(raw: Record<string, unknown>): Runners {
    const held = raw.runners as RunnersPatch | undefined
    if (held && typeof held === 'object') {
        try {
            return merge(blank(), held)
        } catch {
            return blank()
        }
    }
    const legacy: Partial<Runner> = {}
    if (typeof raw.model === 'string' && raw.model.trim()) legacy.model = raw.model
    if (typeof raw.effort === 'string' && raw.effort.trim()) legacy.effort = raw.effort
    return merge(blank(), { implement: legacy })
}

export function resolve(board: Runners, card: Runners, kind: RunKind): Resolved {
    const above = board[kind]
    const own = card[kind]
    return {
        harness: own.harness ?? above.harness ?? DEFAULT_HARNESS,
        model: own.model ?? above.model,
        effort: own.effort ?? above.effort
    }
}
