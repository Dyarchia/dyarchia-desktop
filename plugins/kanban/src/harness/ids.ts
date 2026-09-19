/*
 * The harness names, and nothing else. It is a leaf on purpose: `index.ts` reaches the drivers,
 * and the drivers reach `node:fs`, so anything importing a harness id from there cannot be
 * bundled for the renderer. The board's runner resolution has to be one function shared by the
 * dispatcher and the card that shows what the dispatcher will do, which puts the names here.
 */
export const HARNESS_IDS = ['claude', 'codex', 'grok', 'opencode'] as const

export type HarnessId = (typeof HARNESS_IDS)[number]

export const DEFAULT_HARNESS: HarnessId = 'claude'

export function isHarness(value: unknown): value is HarnessId {
    return typeof value === 'string' && (HARNESS_IDS as readonly string[]).includes(value)
}
