import { EMPTY_ANALYSIS } from '../types.js'
import type { Analysis } from '../types.js'

function balanced(text: string): string | null {
    const start = text.indexOf('{')
    if (start < 0) return null

    let depth = 0
    let quoted = false
    let escaped = false

    for (let index = start; index < text.length; index += 1) {
        const character = text[index]
        if (escaped) {
            escaped = false
            continue
        }
        if (character === '\\') {
            escaped = true
            continue
        }
        if (character === '"') {
            quoted = !quoted
            continue
        }
        if (quoted) continue
        if (character === '{') depth += 1
        if (character === '}') {
            depth -= 1
            if (depth === 0) return text.slice(start, index + 1)
        }
    }

    return null
}

function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function members(value: unknown): number[] {
    return list(value)
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0)
}

export function parseAnalysis(raw: string): Analysis {
    const source = balanced(raw.replace(/```(?:json)?/g, ''))
    if (!source) throw new Error('the analyst returned no JSON object')

    let parsed: Record<string, unknown>
    try {
        parsed = record(JSON.parse(source))
    } catch {
        throw new Error('the analyst returned malformed JSON')
    }

    const analysis: Analysis = {
        ...EMPTY_ANALYSIS,
        consensus: list(parsed.consensus)
            .map((entry) => record(entry))
            .map((entry) => ({ claim: text(entry.claim), supported_by: members(entry.supported_by) }))
            .filter((entry) => entry.claim),
        contradictions: list(parsed.contradictions)
            .map((entry) => record(entry))
            .map((entry) => ({
                topic: text(entry.topic),
                positions: list(entry.positions)
                    .map((position) => record(position))
                    .map((position) => ({
                        member: Number(position.member) || 0,
                        position: text(position.position)
                    }))
                    .filter((position) => position.position)
            }))
            .filter((entry) => entry.topic),
        partial_coverage: list(parsed.partial_coverage)
            .map((entry) => record(entry))
            .map((entry) => ({ point: text(entry.point), covered_by: members(entry.covered_by) }))
            .filter((entry) => entry.point),
        unique_insights: list(parsed.unique_insights)
            .map((entry) => record(entry))
            .map((entry) => ({ member: Number(entry.member) || 0, insight: text(entry.insight) }))
            .filter((entry) => entry.insight),
        blind_spots: list(parsed.blind_spots).map(text).filter(Boolean)
    }

    return analysis
}
