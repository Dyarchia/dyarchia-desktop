/*
 * The glyphs of the actions every panel shares, drawn for this system on a 24 unit grid with a
 * 2 unit round stroke in currentColor, so a key's ink is its glyph's. An action a reader knows by
 * its glyph is an icon key with a tip, never a key spelling the verb, and every panel draws that
 * glyph from here, so browse is the same folder in the board and in the crawler.
 */
const OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'

const PATHS = {
    add: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    delete: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/><path d="M10 11v5"/><path d="M14 11v5"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    launcher: '<circle cx="5" cy="5" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="19" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/>',
    pin: '<path d="M12 17v5"/><path d="M8 3h8"/><path d="M9 3v6l-3 4v2h12v-2l-3-4V3"/>',
    folder: '<path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8.5L9.3 4.4A1 1 0 0 0 8.5 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/>',
    open: '<path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.5-4.5"/>',
    save: '<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 3v5h7V3"/><path d="M8 21v-7h8v7"/>',
    inspect: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
    'new-file': '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="M9 14h6"/>',
    rename: '<rect x="3" y="8" width="11" height="8" rx="1"/><path d="M18 5v14"/><path d="M16 5h4"/><path d="M16 19h4"/>',
    attach: '<path d="m21 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3L16 6.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    move: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    fold: '<path d="M2 12h6"/><path d="m5 9 3 3-3 3"/><path d="M22 12h-6"/><path d="m19 9-3 3 3 3"/><path d="M12 3v4"/><path d="M12 10v4"/><path d="M12 17v4"/>',
    unfold: '<path d="M9 12H3"/><path d="m6 9-3 3 3 3"/><path d="M15 12h6"/><path d="m18 9 3 3-3 3"/><path d="M12 3v4"/><path d="M12 10v4"/><path d="M12 17v4"/>',
    terminal: '<path d="m5 7 5 5-5 5"/><path d="M12 18h7"/>',
    expand: '<path d="M15 4h5v5"/><path d="M9 20H4v-5"/><path d="m20 4-6 6"/><path d="m4 20 6-6"/>',
    contract: '<path d="M4 10h5V5"/><path d="M20 14h-5v5"/><path d="M9 10 3 4"/><path d="m15 14 6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
}

export type GlyphName = keyof typeof PATHS

export function glyph(name: GlyphName): string {
    return `${OPEN}${PATHS[name]}</svg>`
}
