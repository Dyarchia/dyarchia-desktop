import type { TerminalBlock } from './harness/types.js'
import type { BlockKind, Verdict } from './types.js'

export const MARKER = '===KANBAN==='

export function parseTerminal(text: string): TerminalBlock | null {
    const at = text.lastIndexOf(MARKER)
    if (at < 0) return null

    const rest = text.slice(at + MARKER.length)
    const open = rest.indexOf('{')
    if (open < 0) return null

    let depth = 0
    let end = -1
    for (let index = open; index < rest.length; index += 1) {
        if (rest[index] === '{') depth += 1
        else if (rest[index] === '}') {
            depth -= 1
            if (depth === 0) {
                end = index + 1
                break
            }
        }
    }
    if (end < 0) return null

    try {
        const raw = JSON.parse(rest.slice(open, end)) as Record<string, unknown>
        const outcome = raw.outcome === 'blocked' ? 'blocked' : 'completed'
        const followups = Array.isArray(raw.followups) ? raw.followups : []
        return {
            outcome,
            verdict:
                raw.verdict === 'approved' || raw.verdict === 'changes'
                    ? (raw.verdict as Verdict)
                    : null,
            blockKind: (raw.blockKind as BlockKind) ?? null,
            summary: typeof raw.summary === 'string' ? raw.summary : '',
            artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.map(String) : [],
            followups: followups
                .map((entry) => entry as Record<string, unknown>)
                .filter((entry) => typeof entry?.title === 'string')
                .map((entry) => ({ title: String(entry.title), body: String(entry.body ?? '') }))
        }
    } catch {
        return null
    }
}
