/*
 * The three categorical hues kanon declares, by the name its `dya-hue--<name>` classes use.
 *
 * Hue says which one of several things of one kind something is. Green, yellow and red are not
 * among them: those three are success, warning and error everywhere, and a group coloured green
 * would read as a group that passed. A plugin never chooses a colour: it asks `hues` for the
 * things inside it that come in sets -- groups of corpora, agents, boards.
 */
const HUES = ['blue', 'purple', 'orange'] as const

export type Hue = (typeof HUES)[number]

function hash(key: string): number {
    let value = 0x811c9dc5
    for (let index = 0; index < key.length; index++) {
        value ^= key.charCodeAt(index)
        value = Math.imul(value, 0x01000193)
    }
    return value >>> 0
}

/*
 * A hue for each key, distinct while there are three or fewer, and as stable as a set allows.
 *
 * Each key hashes to the hue it would like, so a key keeps its colour across sessions and across
 * machines without anything being stored. Keys are placed in sorted order and a key whose hue is
 * taken moves to the next free one: two groups never share a colour while there are colours to
 * spare, and a key only moves when a key sorting before it arrives wanting the same hue. Past
 * three, hues repeat; a fourth category is a reason to show a name, not to invent a colour.
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
