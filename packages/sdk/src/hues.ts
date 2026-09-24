/*
 * The six categorical hues kanon declares, by the name its `dya-hue--<name>` classes use.
 *
 * Hue says which one of several things of one kind something is. A plugin never chooses a colour:
 * it declares one of these names in its manifest for itself, and asks `hues` for the things inside
 * it that come in sets -- groups of corpora, agents, boards.
 */
export const HUES = ['amber', 'mint', 'cyan', 'blue', 'violet', 'pink'] as const

export type Hue = (typeof HUES)[number]

export function isHue(value: unknown): value is Hue {
    return typeof value === 'string' && (HUES as readonly string[]).includes(value)
}

function hash(key: string): number {
    let value = 0x811c9dc5
    for (let index = 0; index < key.length; index++) {
        value ^= key.charCodeAt(index)
        value = Math.imul(value, 0x01000193)
    }
    return value >>> 0
}

/*
 * A hue for each key, distinct while there are six or fewer, and as stable as a set allows.
 *
 * Each key hashes to the hue it would like, so a key keeps its colour across sessions and across
 * machines without anything being stored. Keys are placed in sorted order and a key whose hue is
 * taken moves to the next free one: two groups never share a colour while there are colours to
 * spare, and a key only moves when a key sorting before it arrives wanting the same hue. Past six,
 * hues repeat; a seventh category is a reason to show a name, not to invent a colour.
 */
export function hues(keys: Iterable<string>): Record<string, Hue> {
    const assigned: Record<string, Hue> = {}
    let taken = new Set<number>()
    for (const key of [...new Set(keys)].sort()) {
        if (taken.size === HUES.length) taken = new Set()
        let slot = hash(key) % HUES.length
        while (taken.has(slot)) slot = (slot + 1) % HUES.length
        taken.add(slot)
        assigned[key] = HUES[slot]
    }
    return assigned
}
