/*
 * The panel. Plain DOM and no build step: the shell serves this file as it is written, and the
 * only thing it needs from the SDK is a style tag, which is six lines and is inlined below rather
 * than imported. A plugin that cannot be read without first being compiled is harder to trust.
 */

const ICON =
    '<svg viewBox="9.15 5 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M39.843 34.81h-29.4c-.42 0-.683-.474-.473-.855l7.35-13.24 7.351-13.238a.537.537 0 0 1 .947 0l4.728 8.517a6.521 6.521 0 0 0 1.57 12.848c1.765 0 3.369-.7 4.542-1.843l3.861 6.956c.21.378-.053.854-.473.854h-.003Z" fill="url(#crawlee-body)" stroke="url(#crawlee-body)" stroke-width="1.039"/><path d="M37.855 25.017a6.519 6.519 0 0 1-5.938 3.825 6.518 6.518 0 0 1-6.52-6.52 6.518 6.518 0 0 1 9.343-5.878" stroke="url(#crawlee-arc)" stroke-width="2"/><defs><linearGradient id="crawlee-body" x1="40.393" y1="7.193" x2="12.912" y2="37.541" gradientUnits="userSpaceOnUse"><stop stop-color="#FFB200"/><stop offset=".53" stop-color="#F98618"/><stop offset="1" stop-color="#EB284B"/></linearGradient><linearGradient id="crawlee-arc" x1="37.855" y1="15.803" x2="24.829" y2="28.247" gradientUnits="userSpaceOnUse"><stop stop-color="#FFB200"/><stop offset=".53" stop-color="#F98618"/><stop offset="1" stop-color="#EB284B"/></linearGradient></defs></svg>'

const PLUS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'

const BOOK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>'

const STYLE = `
.crw-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--dya-space-3);
    padding: var(--dya-space-4);
    overflow: hidden;
}
.crw-tabs {
    flex: none;
}
.crw-view {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--dya-space-3);
    min-height: 0;
}
/*
 * The head and the footer sit on the table's left edge, not on the panel's. A cell carries its own
 * padding, so a bar flush with the panel starts a whole cell inset to the left of every value
 * under it and nothing in the view lines up with anything.
 */
.crw-head {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-3);
    flex: none;
    padding-inline: var(--dya-space-3);
}
.crw-headline {
    flex: none;
    min-width: 0;
    overflow-wrap: anywhere;
}
.crw-where {
    flex: 1;
    min-width: 60px;
}
.crw-corpora {
    flex: 1 1 auto;
    min-height: 160px;
    overflow: auto;
}

/*
 * Six columns and a state badge stop fitting well before the pane runs out of uses. Below 640px a
 * corpus becomes a card carrying the labels the header row was holding, so the table never scrolls
 * sideways in a split pane.
 */
@container pane (max-width: 640px) {
    .crw-corpora {
        overflow-x: hidden;
    }

    .crw-corpora table,
    .crw-corpora tbody,
    .crw-corpora tr,
    .crw-corpora td {
        display: block;
    }

    .crw-corpora tr:has(th) {
        display: none;
    }

    .crw-corpora tr {
        margin-bottom: var(--dya-space-1);
        padding: var(--dya-space-2) 0;
        border: var(--dya-border-width) solid var(--dya-border);
        border-radius: var(--dya-radius);
        background: var(--dya-surface-1);
    }

    .crw-corpora td {
        display: grid;
        grid-template-columns: 8ch 1fr;
        align-items: baseline;
        gap: var(--dya-space-3);
        border: 0;
        border-radius: 0;
        padding: 1px var(--dya-space-3);
        background: none;
        text-align: left;
    }

    .crw-corpora td::before {
        content: attr(data-label);
        font-family: var(--dya-font-sans);
        font-size: var(--dya-size-body-xs);
        letter-spacing: var(--dya-tracking-ui);
        color: var(--dya-text-4);
    }
}
.crw-bar {
    flex: none;
    flex-wrap: wrap;
    gap: var(--dya-space-5);
    padding: var(--dya-space-3);
    border-top: var(--dya-border-width) solid var(--dya-border);
}
/*
 * The rule on this bar divides it from whatever is above it, and where it is the first thing in
 * whatever holds it there is nothing above it but that container's own edge -- the tab strip in
 * the search view, the sheet's border in the target editor. Two rules twelve pixels apart with a
 * gap of background between them is not two boundaries; it is one boundary drawn twice.
 *
 * The selector used to say .crw-view >, which is narrower than the sentence above it and is why
 * the sheet drew the second line: its bar is the first child of the sheet, not of the view.
 */
.crw-bar:first-child {
    border-top: none;
}
.crw-scope {
    min-width: 220px;
}
.crw-check {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-2);
    flex: none;
}
.crw-meter {
    flex-wrap: wrap;
    max-width: 40%;
}
.crw-status {
    flex: 1;
    min-width: 120px;
}
/*
 * The console and the handle that sizes it. Everything else in this application can be resized —
 * the window, the dock, every panel in it — and the one region that fills with text a line at a
 * time was 120 pixels tall for ever, so a round's output was read four lines at a time through a
 * slot. The handle sits inside the region so that one :has() rule hides both when there is no output.
 */
.crw-out {
    display: flex;
    flex-direction: column;
    flex: none;
    gap: var(--dya-space-2);
    height: 180px;
    min-height: 72px;
}
.crw-out:has(> .dya-log[hidden]) {
    display: none;
}
.crw-log {
    flex: 1;
    min-height: 0;
}
/*
 * The targets, as a grid that reflows from one column to as many as the window affords. A rail of
 * names 210px wide made a 1400px window 85% black, and told the reader nothing about a target
 * except that it exists.
 */
.crw-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    align-content: start;
    gap: var(--dya-space-3);
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 2px;
}
.crw-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dya-space-1) var(--dya-space-2);
    min-width: 0;
}
/*
 * The group, the pages and the time are one line of data about the target, so they share its
 * type, and the line wraps between them rather than cutting the last one off: a card too narrow
 * for a salesforce-ai group, its pages and the time put the group on two lines and ended the time
 * in an ellipsis.
 */
.crw-facts > .dya-legend {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-3);
    white-space: nowrap;
}
.crw-facts > .dya-meta {
    flex: none;
}
.crw-target,
.crw-new {
    min-width: 0;
}
.crw-new {
    border: var(--dya-border-width) dashed var(--dya-dashed);
    background: transparent;
    box-shadow: none;
}
.crw-new:hover {
    background-color: var(--dya-flat-hover);
}
.crw-sheet-bar {
    padding-inline: 0;
}
.crw-library {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
}
.crw-libhead {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--dya-space-3);
}
.crw-libhead > .dya-button {
    margin-inline-start: auto;
}
/*
 * A profile is the one thing in this panel somebody writes by hand, and it was a wall of one
 * ink. The same arrangement the reader uses: the text highlighted in a pre, and a textarea with
 * no colour of its own lying exactly on top of it. Every metric that decides where a glyph lands
 * is set on both, and neither may drift from the other.
 */
.crw-yaml {
    position: relative;
    flex: 1;
    min-height: 140px;
    overflow: auto;
}
.crw-yaml[hidden] {
    display: none;
}
.crw-yaml > pre,
.crw-yaml > textarea {
    margin: 0;
    padding: 0;
    border: none;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    line-height: var(--dya-leading-body);
    letter-spacing: var(--dya-tracking-mono);
    tab-size: 2;
    white-space: pre-wrap;
    overflow-wrap: break-word;
}
.crw-yaml > pre {
    min-height: 100%;
    background: transparent;
    border-radius: 0;
    overflow-x: visible;
    pointer-events: none;
}
.crw-yaml > textarea {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    resize: none;
    background: transparent;
    color: transparent;
    caret-color: var(--dya-accent);
    outline: none;
    overflow: hidden;
}
.crw-yaml > textarea::selection {
    background: var(--dya-selected);
    color: transparent;
}
/* Inside the sheet the console starts shorter: the subject there is the target being written, and
   the output of a probe is a footnote to it. It resizes like the other one. */
.crw-sheet .crw-out {
    height: 120px;
}
.crw-form {
    display: grid;
    grid-template-columns: 110px 1fr;
    align-items: center;
    gap: var(--dya-space-2);
    max-width: 560px;
    flex: none;
}
.crw-form button {
    justify-self: start;
}
.crw-note {
    min-height: 1.4em;
}
.crw-query {
    flex: 1;
    min-width: 200px;
}
.crw-hits {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
}
.crw-hits > .dya-empty {
    flex: 1;
}
.crw-hit {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    padding: var(--dya-space-3);
    border: var(--dya-border-width) solid var(--dya-border);
    border-radius: var(--dya-radius);
    background: var(--dya-surface-1);
}
.crw-hit-head {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-2);
    flex-wrap: wrap;
}
/*
 * The title is the one thing a reader scans down, so it carries the top ink rank. Everything else
 * in the head is where the passage came from, and sits a rank below in mono at label size.
 */
.crw-hit-title {
    color: var(--dya-text);
    overflow-wrap: anywhere;
}
.crw-hit-where {
    margin-left: auto;
}
.crw-hit-url {
    color: var(--dya-text-4);
    user-select: all;
    overflow-wrap: anywhere;
}
.crw-hit-snippet {
    color: var(--dya-text-3);
}
.crw-hit-snippet mark {
    background: var(--dya-accent-soft);
    color: var(--dya-text);
}
.crw-hit-actions {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    flex-wrap: wrap;
}
`

function injectStyles(pluginId, css) {
    const id = `dyarchia-${pluginId}-styles`
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
}

/*
 * What went wrong, without the word `Error` in front of it. Passing an exception through `String`
 * prints its class name, which is plumbing: nobody reading a panel needs to be told that a failure
 * was a failure.
 */
function reason(error) {
    return error instanceof Error ? error.message : String(error)
}

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

/*
 * A line as its program coloured it. Crawlee colours its own log -- the crawler's name grey, the
 * level in its colour -- and the console printed the escapes, so every line opened with a box
 * and `[90m`. Only SGR is read, since colour is the only thing a log line asks for; any other
 * escape is dropped rather than shown. The state is the sink's, because a colour set on one line
 * holds until something resets it, which may be lines later.
 */
const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const ESCAPE = /\x1b\[([\d;]*)([A-Za-z])/g

function plainAnsi() {
    return { fg: '', bold: false, dim: false }
}

function applySgr(state, parameters) {
    const codes = parameters.split(';').filter(Boolean).map(Number)
    if (codes.length === 0) codes.push(0)
    for (let index = 0; index < codes.length; index++) {
        const code = codes[index]
        if (code === 0) Object.assign(state, plainAnsi())
        else if (code === 1) state.bold = true
        else if (code === 2) state.dim = true
        else if (code === 22) Object.assign(state, { bold: false, dim: false })
        else if (code === 39) state.fg = ''
        else if (code >= 30 && code <= 37) state.fg = ANSI_NAMES[code - 30]
        else if (code >= 90 && code <= 97) state.fg = `bright-${ANSI_NAMES[code - 90]}`
        else if (code === 38 || code === 48) index += codes[index + 1] === 5 ? 2 : 4
    }
}

function paintAnsi(text, state) {
    const fragment = document.createDocumentFragment()
    const push = (part) => {
        if (!part) return
        const classes = []
        if (state.fg) classes.push(`dya-ansi--${state.fg}`)
        if (state.dim) classes.push('dya-ansi--dim')
        if (state.bold) classes.push('dya-ansi--bold')
        fragment.append(classes.length ? el('span', classes.join(' '), part) : part)
    }
    let last = 0
    for (const match of text.matchAll(ESCAPE)) {
        push(text.slice(last, match.index))
        if (match[2] === 'm') applySgr(state, match[1])
        last = match.index + match[0].length
    }
    push(text.slice(last))
    return fragment
}

function bytes(value) {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = Number(value) || 0
    let unit = 0
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
    }
    return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`
}

function stateBadge(corpus) {
    if (corpus.error) {
        const badge = el('span', 'dya-badge dya-badge--soft dya-badge--danger', 'unreadable')
        badge.title = corpus.error
        return badge
    }

    if (!corpus.changed) {
        const [text, tone] = corpus.stale ? ['stale', ''] : ['quiet', ' dya-badge--success']
        const badge = el('span', `dya-badge dya-badge--soft${tone}`, text)
        if (corpus.stale) badge.title = 'not swept since it last moved'
        return badge
    }

    const pills = el('span', 'dya-pills')
    const counts = [
        [corpus.added, '+', ' dya-badge--success', 'added'],
        [corpus.modified, '~', ' dya-badge--warning', 'changed'],
        [corpus.removed, '−', ' dya-badge--danger', 'removed']
    ]
    for (const [count, sign, tone, what] of counts) {
        if (!count) continue
        const badge = el('span', `dya-badge dya-badge--soft${tone}`, `${sign}${count}`)
        badge.title = `${count} ${what}`
        pills.appendChild(badge)
    }
    return pills
}


/*
 * When a corpus was last swept, as the date and the minute on this machine's clock. It was the date
 * alone, cut off the stored timestamp, and that timestamp is UTC: two rounds on one day read the
 * same, and a round run at half past midnight in Madrid was dated the day before.
 */
function swept(iso) {
    const at = iso ? new Date(iso) : null
    if (!at || Number.isNaN(at.getTime())) return '-'
    const two = (value) => String(value).padStart(2, '0')
    return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`
}

/*
 * YAML is composed here and validated there. The model forbids unknown keys, so a field this panel
 * invents is refused by `profile save` with nothing written, which is what lets the form stay a
 * form instead of a second copy of the schema.
 */
function scalar(value) {
    return /^[\w][\w .,'()/-]*$/.test(value) ? value : JSON.stringify(value)
}

function draft({ name, url, group, description, snapshot }) {
    const lines = [`name: ${scalar(name)}`]
    if (description) lines.push(`description: ${scalar(description)}`)
    if (group) lines.push(`group: ${scalar(group)}`)
    lines.push(url.endsWith('.xml') ? 'sitemap_urls:' : 'start_urls:', `  - ${url}`)
    if (snapshot) lines.push('snapshot: true')
    return `${lines.join('\n')}\n`
}

function firstUrl(yaml) {
    const found = yaml.match(/^\s*-\s*(https?:\/\/\S+)/m)
    return found ? found[1] : ''
}

/*
 * A control that asks before it does the thing it says. The first press turns it red and relabels
 * it with what is about to happen; the second press is the one that acts, and the caller owns
 * both. A few seconds of nothing puts it back, because an armed button left armed is a trap the
 * next click springs.
 *
 * Not `window.confirm`: that is an operating-system window over a panel, it stops the renderer
 * dead while it is up, and it is the one thing on screen this design system does not draw.
 */
function arming(button, prompt) {
    const label = button.textContent
    const tone = button.className
    let armed = false
    let timer = 0

    const reset = () => {
        armed = false
        window.clearTimeout(timer)
        button.textContent = label
        button.className = tone
    }

    const loud = [...new Set(tone.split(/\s+/).filter((name) => name && name !== 'dya-button--quiet'))]
    if (!loud.includes('dya-button--danger')) loud.push('dya-button--danger')

    const arm = () => {
        armed = true
        button.textContent = prompt
        button.className = loud.join(' ')
        window.clearTimeout(timer)
        timer = window.setTimeout(reset, 5000)
    }

    return {
        arm,
        reset,
        get armed() {
            return armed
        }
    }
}

export function activate(ctx) {
    injectStyles(ctx.pluginId, STYLE)
    ctx.registerPanel(
        {
            id: 'crawlee',
            title: 'Crawlee',
            icon: ICON,
            note: 'Snapshot a site and search everything it has kept.'
        },
        (container) =>
        mount(ctx, container)
    )
}

function mount(ctx, container) {
    const root = el('div', 'crw-root')

    const tabs = el('div', 'dya-tabs crw-tabs')
    const rounds = el('div', 'crw-view')
    const targets = el('div', 'crw-view')
    const searching = el('div', 'crw-view')

    /*
     * One job at a time on the Python side, so one place for its output at a time here. The sink
     * is chosen when the job is started, by whichever view started it.
     */
    let sink = null
    let ansi = plainAnsi()
    let busy = false

    /*
     * The groups this panel has seen, from the corpora and from the profiles alike, so the rounds
     * table and the target cards give one group one hue. A group is the one category in this panel
     * that the reader chooses by, and it was printed in the same grey as the date beside it.
     */
    const groups = new Set()
    const groupTag = (group) => {
        const hue = ctx.hues([...groups])[group]
        const legend = el('span', 'dya-legend')
        legend.append(el('span', `dya-dot dya-hue--${hue}`), group)
        return legend
    }

    const views = [
        { id: 'rounds', title: 'Rounds', node: rounds },
        { id: 'targets', title: 'Targets', node: targets },
        { id: 'search', title: 'Search', node: searching },
    ]
    const buttons = views.map((view) => {
        const button = el('button', 'dya-tab', view.title)
        button.addEventListener('click', () => select(view.id))
        tabs.appendChild(button)
        return button
    })

    function select(id) {
        views.forEach((view, index) => {
            const active = view.id === id
            view.node.hidden = !active
            buttons[index].setAttribute('aria-selected', String(active))
        })
    }

    const roundsView = buildRounds()
    const targetsView = buildTargets()
    const searchView = buildSearch()

    root.append(tabs, rounds, targets, searching)
    container.appendChild(root)
    select('rounds')

    const unsubscribeLine = ctx.on('line', (text) => {
        if (!sink) return
        const atBottom = sink.scrollHeight - sink.scrollTop - sink.clientHeight < 40
        sink.append(paintAnsi(`${String(text)}\n`, ansi))
        if (atBottom) sink.scrollTop = sink.scrollHeight
    })

    const unsubscribeProgress = ctx.on('progress', (event) => roundsView.heard(event))

    const unsubscribeDone = ctx.on('done', (report) => {
        busy = false
        if (report.kind === 'run') roundsView.finished(report)
        else targetsView.finished(report)
    })

    void roundsView.refresh()
    void targetsView.refresh()
    void searchView.refresh()

    return () => {
        unsubscribeLine()
        unsubscribeProgress()
        unsubscribeDone()
        root.remove()
    }


    /*
     * A console somebody can make bigger. The handle drags, the arrow keys move it for anybody not
     * using a pointer, and a double-click swaps between the height it was given and most of the
     * view — which is what a reader wants the moment a round starts failing and the interesting
     * line is forty lines up. The height is remembered per view, so the panel opens the way it was
     * left rather than the way it was written.
     */
    function buildConsole(key) {
        const MIN = 72
        const pane = el('div', 'crw-out')
        const grip = el('div', 'dya-splitter')
        grip.setAttribute('role', 'separator')
        grip.setAttribute('aria-orientation', 'horizontal')
        grip.tabIndex = 0
        grip.title = 'drag to resize · double-click for the whole view'
        const log = el('pre', 'dya-log crw-log')
        log.hidden = true
        pane.append(grip, log)

        let stored = Number(localStorage.getItem(key)) || 0
        let folded = 0
        if (stored) pane.style.height = `${stored}px`

        function room() {
            const parent = pane.parentElement
            return parent ? Math.max(MIN, parent.getBoundingClientRect().height - 120) : 480
        }

        function size(next, remember) {
            const height = Math.max(MIN, Math.min(Math.round(next), room()))
            pane.style.height = `${height}px`
            if (remember) {
                stored = height
                localStorage.setItem(key, String(height))
            }
            return height
        }

        grip.addEventListener('pointerdown', (event) => {
            const from = event.clientY
            const start = pane.getBoundingClientRect().height
            grip.setPointerCapture(event.pointerId)
            grip.dataset.dragging = 'true'
            const move = (moved) => size(start + (from - moved.clientY), true)
            const drop = () => {
                delete grip.dataset.dragging
                grip.removeEventListener('pointermove', move)
                grip.removeEventListener('pointerup', drop)
                grip.removeEventListener('pointercancel', drop)
            }
            grip.addEventListener('pointermove', move)
            grip.addEventListener('pointerup', drop)
            grip.addEventListener('pointercancel', drop)
            event.preventDefault()
        })

        grip.addEventListener('keydown', (event) => {
            const step = event.key === 'ArrowUp' ? 24 : event.key === 'ArrowDown' ? -24 : 0
            if (!step) return
            size(pane.getBoundingClientRect().height + step, true)
            event.preventDefault()
        })

        grip.addEventListener('dblclick', () => {
            if (folded) {
                size(folded, false)
                folded = 0
                return
            }
            folded = pane.getBoundingClientRect().height
            size(room(), false)
        })

        return { node: pane, log }
    }

    function buildRounds() {
        const head = el('div', 'crw-head')
        const headline = el('span', 'dya-value crw-headline', 'reading the corpus…')
        /*
         * Where the corpora are read from, said on the screen that reports them. It is the one
         * fact a reader cannot deduce from anything else here, and a stale repositories directory
         * in one shell is enough to hide every corpus but the fallback — this panel once said
         * `9 corpora` with four more on the disk, as confidently as it would have said fourteen.
         */
        const where = el('span', 'dya-meta crw-where')
        const refresh = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Refresh')
        head.append(el('span', 'dya-eyebrow', 'corpus'), headline, where, refresh)

        const table = el('table', 'dya-table')
        const wrap = el('div', 'crw-corpora')
        wrap.appendChild(table)

        /*
         * The footer is two groups, not six controls in a row: what the round covers, and what to
         * do about it. They were evenly spaced with everything else, so the label, the select, the
         * checkbox and the button read as one undifferentiated clump, and the clump started at the
         * panel's edge while the table above started a cell's padding further in. It sits on the
         * table's own left edge now, with a rule above it, which is what makes it a footer rather
         * than a row of controls that happen to be last.
         */
        const bar = el('div', 'dya-bar dya-bar--inset crw-bar')
        const scope = el('select', 'dya-field dya-field--auto crw-scope')
        const scopeBox = el('span', 'dya-select')
        scopeBox.appendChild(scope)
        const scopeGroup = el('div', 'dya-bar__group')
        scopeGroup.append(el('span', 'dya-key-label', 'round'), scopeBox)

        const commitBox = el('label', 'crw-check')
        const commit = el('input', 'dya-checkbox')
        commit.type = 'checkbox'
        commit.checked = true
        commitBox.append(commit, el('span', 'dya-key-label', 'commit'))
        const run = el('button', 'dya-button dya-button--success', 'Run')
        const stop = el('button', 'dya-button dya-button--danger', 'Stop')
        stop.hidden = true
        const actionGroup = el('div', 'dya-bar__group')
        actionGroup.append(commitBox, run, stop)

        const status = el('span', 'dya-text crw-status', '')
        const meter = el('div', 'dya-meter crw-meter')
        meter.hidden = true
        bar.append(scopeGroup, actionGroup, meter, status)

        /*
         * Where a round is, said in the footer while it runs. A round of fourteen targets takes most
         * of an hour, and all this said for that hour was the command it had started -- the reader
         * could not tell a round on its last target from one on its first, or from one that had
         * quietly finished while they were looking at another window. One pip per target, lit as
         * each one ends; the target underway by its place in the round and by name; the time it has
         * been running. Until the command has said how many targets it holds, the line says the round
         * is starting and nothing else: `0 of …` read as a position nobody can be at, over a count
         * nobody had given.
         */
        const round = { total: 0, done: 0, changed: 0, failed: 0, current: '', index: 0, started: 0, timer: 0 }

        const elapsed = () => {
            const seconds = Math.floor((Date.now() - round.started) / 1000)
            return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
        }

        const paintRound = () => {
            status.className = 'dya-text crw-status'
            if (!round.total) {
                status.textContent = `Round starting  ·  ${elapsed()}`
                return
            }
            const parts = round.current
                ? [`Round running  ·  target ${round.index} of ${round.total}`, round.current]
                : [`Round running  ·  ${round.done} of ${round.total} done`]
            if (round.changed) parts.push(`${round.changed} changed`)
            if (round.failed) parts.push(`${round.failed} failed`)
            parts.push(elapsed())
            status.textContent = parts.join('  ·  ')
        }

        const pips = () => {
            meter.replaceChildren()
            for (let index = 0; index < round.total; index++) {
                const pip = el('span', 'dya-meter__pip')
                pip.dataset.on = String(index < round.done)
                meter.appendChild(pip)
            }
            meter.hidden = round.total === 0
        }

        const heard = (event) => {
            if (event.event === 'round') {
                Object.assign(round, { total: event.total, done: 0, changed: 0, failed: 0, current: '', index: 0 })
            } else if (event.event === 'target') {
                round.current = event.name
                round.index = event.index ?? round.done + 1
            } else if (event.event === 'finished') {
                round.done += 1
                if (event.error) round.failed += 1
                else if (event.changed) round.changed += 1
                round.current = ''
            }
            pips()
            paintRound()
        }

        /*
         * Nothing sits here until a round writes something. The area used to carry a title and a
         * sentence explaining what a round is, under a bar whose RUN button is the answer to the
         * question it was asking — a paragraph of onboarding pinned to a panel somebody opens
         * every day.
         */
        const output = buildConsole('crawlee.console.rounds')
        const log = output.log
        rounds.append(head, wrap, bar, output.node)

        refresh.addEventListener('click', () => void refreshState())
        run.addEventListener('click', () => void startRound())
        stop.addEventListener('click', () => void ctx.invoke('stop'))

        async function refreshState() {
            headline.textContent = 'reading the corpus…'
            try {
                const state = await ctx.invoke('state')
                render(state)
            } catch (error) {
                headline.className = 'dya-value crw-headline dya-text--danger'
                headline.textContent = reason(error)
            }
        }

        function render(state) {
            headline.className = 'dya-value crw-headline'

            /*
             * Every installation looks like this until Setup has built the environment, and it is
             * the first thing this panel sees when it opens. It is a state, so it is said once, in
             * the panel's own voice, without the interpreter paths that used to come with it.
             */
            if (state.needsEnvironment) {
                headline.textContent = 'needs its Python environment — turn this plugin on in Setup'
                where.textContent = ''
                table.replaceChildren()
                return
            }

            headline.textContent = state.headline || 'no corpora'
            where.textContent = state.folder ?? ''
            where.title = state.folder ? `every corpus repository under ${state.folder}` : ''

            const corpora = (state.repositories || []).flatMap((repo) => repo.corpora || [])
            for (const corpus of corpora) if (corpus.group) groups.add(corpus.group)
            table.replaceChildren()
            /*
             * A real head and a real body: the header row is not a row somebody can hover, and the
             * last row of the body is the one that drops its rule. Pages and size are figures, so
             * they are read down a right edge rather than left-aligned against words.
             */
            const labels = ['target', 'group', 'pages', 'size', 'swept', 'state']
            const numeric = new Set(['pages', 'size'])
            const thead = el('thead')
            const header = el('tr')
            for (const label of labels) {
                header.appendChild(el('th', numeric.has(label) ? 'dya-table__num' : undefined, label))
            }
            thead.appendChild(header)
            const body = el('tbody')
            for (const corpus of corpora) {
                const row = el('tr', 'dya-row')
                const groupCell = el('td')
                if (corpus.group) groupCell.append(groupTag(corpus.group))
                row.append(
                    el('td', 'dya-mono', corpus.name),
                    groupCell,
                    el('td', 'dya-table__num', String(corpus.pages)),
                    el('td', 'dya-table__num', bytes(corpus.bytes)),
                    el('td', undefined, swept(corpus.swept_at)),
                    verdictCell(corpus)
                )
                row.querySelectorAll('td').forEach((cell, column) => {
                    cell.dataset.label = labels[column] ?? ''
                })
                body.appendChild(row)
            }
            table.append(thead, body)

            const sweptGroups = [...new Set(corpora.map((corpus) => corpus.group).filter(Boolean))]
            scope.replaceChildren()
            scope.appendChild(new Option('all targets', 'all'))
            for (const group of sweptGroups) scope.appendChild(new Option(group, `group:${group}`))
            for (const corpus of corpora) {
                scope.appendChild(new Option(corpus.name, `name:${corpus.name}`))
            }
        }

        /*
         * What the round did to a corpus, in the two colours every reader already knows: what was
         * added is green, what was removed is red, and what changed in place is neither. One badge
         * reading `+4 ~66 -2` in a single warning hue asked somebody to parse three figures to
         * learn what two colours say without being read, and a corpus that had only gained pages
         * looked exactly like one that had only lost them. A figure of zero is not shown at all.
         */
        function verdictCell(corpus) {
            const cell = el('td')
            cell.appendChild(stateBadge(corpus))
            return cell
        }

        async function startRound() {
            Object.assign(round, { total: 0, done: 0, changed: 0, failed: 0, current: '', index: 0, started: Date.now() })
            pips()
            window.clearInterval(round.timer)
            round.timer = window.setInterval(paintRound, 1000)
            const [kind, value] = scope.value.split(':')
            const payload = { commit: commit.checked }
            if (kind === 'group') payload.group = value
            if (kind === 'name') payload.names = [value]
            await begin('run', payload, log, status, { run, stop })
        }

        return {
            refresh: refreshState,
            heard,
            /*
             * How it ended, as the first thing on the line: finished, finished with failures, or
             * stopped part way. The verdict the command reports, which is written for a scheduler,
             * follows it rather than standing in for it.
             */
            finished(report) {
                window.clearInterval(round.timer)
                stop.hidden = true
                run.hidden = false
                run.disabled = false
                const total = report.total || round.total
                const done = report.done ?? round.done
                const stopped = total > 0 && done < total
                const failed = (report.failed ?? round.failed) > 0 || (report.code === 1 && !stopped)
                const at = new Date().toTimeString().slice(0, 5)
                const head = failed ? 'Round finished with failures' : stopped ? 'Round stopped' : 'Round finished'
                const parts = [`${head} at ${at}`]
                /*
                 * The counts come from the progress lines the command prints. A command that
                 * printed none -- one older than the panel driving it -- would be reported as zero
                 * targets and nothing changed, whatever it did, so its own verdict is said instead.
                 */
                if (total) {
                    parts.push(`${done} of ${total}`)
                    parts.push(`${report.changed ?? round.changed} changed`)
                    if (report.failed) parts.push(`${report.failed} failed`)
                } else if (report.verdict) {
                    parts.push(report.verdict)
                }
                parts.push(report.minutes ? `${report.minutes} min` : elapsed())
                if (report.digest) parts.push(`digest at ${report.digest}`)
                status.className = `dya-text crw-status ${failed ? 'dya-text--danger' : stopped ? '' : 'dya-text--success'}`
                status.textContent = parts.join('  ·  ')
                round.done = done
                pips()
                void refreshState()
            },
        }
    }


    /*
     * The corpus as a reader uses it: words in, the chunks that carry them out. The index is the
     * CLI's, refreshed on the way in when a round moved a manifest, so the first search after a
     * round pays for the pages that changed and nothing else.
     */
    /*
     * What a reader can do with a hit, which is the difference between being told a page exists
     * and being shown it. The snapshot is a file on disk, so there are two ways in: hand it to
     * whatever plugin in this installation renders that kind of file, at the line the passage
     * starts on, or show it where it lives.
     *
     * Which of the two is offered is decided by asking the shell whether anything opens it, never
     * by naming a plugin. A reader is optional and deletable, and an installation without one
     * still gets the file manager.
     */
    function hitActions(hit) {
        if (!hit.file) return null
        const actions = el('div', 'crw-hit-actions')
        if (hit.line > 1) {
            actions.append(el('span', 'dya-meta crw-hit-at', `line ${hit.line}`))
        }
        if (ctx.shell.canOpen(hit.file)) {
            const open = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Open')
            open.title = `Open the snapshot at line ${hit.line}`
            open.onclick = () => void ctx.shell.open({ path: hit.file, line: hit.line })
            actions.append(open)
        }
        const reveal = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Reveal')
        reveal.title = hit.file
        reveal.onclick = () => void ctx.shell.reveal(hit.file)
        actions.append(reveal)
        return actions
    }

    function buildSearch() {
        const bar = el('div', 'dya-bar dya-bar--inset crw-bar')
        const query = el('input', 'dya-field dya-field--prose crw-query')
        query.type = 'search'
        query.placeholder = 'ask it in words, enter to search'
        query.spellcheck = false
        const scope = el('select', 'dya-field dya-field--auto crw-scope')
        const scopeBox = el('span', 'dya-select')
        scopeBox.appendChild(scope)
        const go = el('button', 'dya-button dya-button--primary', 'Search')
        bar.append(query, scopeBox, go)

        /*
         * The field already says to ask it in words, and it says so inside the box somebody is
         * about to type in. Saying it again in the middle of the empty half of the panel is the
         * same sentence twice, once where it is needed and once where nothing is happening.
         */
        const hits = el('div', 'crw-hits')
        searching.append(bar, hits)

        go.addEventListener('click', () => void run())
        query.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') void run()
        })

        async function refresh() {
            try {
                const state = await ctx.invoke('state')
                scope.replaceChildren()
                const every = el('option', undefined, 'every repository')
                every.value = ''
                scope.appendChild(every)
                for (const repo of state.repositories || []) {
                    const name = String(repo.root || '').split(/[\\/]/).pop()
                    if (!name) continue
                    const option = el('option', undefined, name)
                    option.value = name
                    scope.appendChild(option)
                }
            } catch (error) {
                hits.replaceChildren(el('div', 'dya-empty dya-text--danger', reason(error)))
            }
        }

        async function run() {
            const text = query.value.trim()
            if (!text) return
            hits.replaceChildren(el('div', 'dya-empty', 'searching…'))
            try {
                const found = await ctx.invoke('search', { query: text, repository: scope.value || null, limit: 20 })
                render(found)
            } catch (error) {
                hits.replaceChildren(el('div', 'dya-empty dya-text--danger', reason(error)))
            }
        }

        function render(found) {
            hits.replaceChildren()
            if (!found.length) {
                hits.appendChild(el('div', 'dya-empty', 'Nothing in the corpus holds those words.'))
                return
            }
            for (const hit of found) {
                /*
                 * A heading, a repository and a target are names a crawl found, not words this
                 * panel chose, so they keep their case. The uppercase label is for what the
                 * interface calls things, and spending it on data is how a result page ends up
                 * shouting a URL at the reader.
                 *
                 * A page whose title is its own address says its address twice, once as a title
                 * it does not have and once as the line under it. It gets the line.
                 */
                const row = el('div', 'crw-hit')
                const head = el('div', 'crw-hit-head')
                const titled = hit.title && hit.title !== hit.url
                head.append(
                    titled
                        ? el('span', 'dya-text crw-hit-title', hit.title)
                        : el('span', 'dya-mono crw-hit-title', hit.url)
                )
                if (hit.heading) head.append(el('span', 'dya-meta crw-hit-in', hit.heading))
                head.append(el('span', 'dya-meta crw-hit-where', `${hit.repository} / ${hit.target}`))
                const url = el('div', 'dya-mono crw-hit-url', hit.url)
                const snippet = el('div', 'dya-text crw-hit-snippet')
                for (const [index, part] of String(hit.snippet).split(/[\[\]]/).entries()) {
                    snippet.append(index % 2 ? el('mark', undefined, part) : part)
                }
                row.append(head)
                if (titled) row.append(url)
                row.append(snippet)
                const actions = hitActions(hit)
                if (actions) row.append(actions)
                hits.appendChild(row)
            }
        }

        return { refresh }
    }

    function buildTargets() {
        /*
         * The targets are what this view is about, so they take the room the window has: a grid of
         * cards that reflows from one column to five, not a 210px rail of names beside four fifths
         * of a window of black. Each card says what the target is, where its pages live and what
         * the last round did to it, which is everything somebody chooses between them on.
         *
         * Opening one raises a sheet over the grid. A column that pushed the grid aside would
         * leave a list too narrow to read and an editor too narrow to write in, at every width
         * this panel is ever given.
         */
        const grid = el('div', 'crw-grid')
        const scrim = el('div', 'dya-scrim')
        scrim.hidden = true
        const sheet = el('div', 'dya-sheet crw-sheet')
        sheet.hidden = true

        const bar = el('div', 'dya-bar dya-bar--inset crw-bar crw-sheet-bar')
        const title = el('span', 'dya-mono crw-status')
        const remove = el('button', 'dya-button dya-button--quiet dya-button--sm dya-button--danger', 'Delete')
        const inspect = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Inspect')
        const save = el('button', 'dya-button dya-button--sm', 'Save')
        const close = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Close')
        bar.append(title, remove, inspect, save, close)

        const yaml = buildYaml()
        const note = el('div', 'dya-text crw-note')
        const output = buildConsole('crawlee.console.targets')
        const log = output.log

        const form = buildForm()
        sheet.append(bar, form.node, yaml.node, note, output.node)

        /*
         * What the last thing to happen to this view was, and nothing when nothing has. A target
         * removed takes its own sheet with it, so the line that says what came off the disk has
         * nowhere to be said except out here; it is cleared the moment the reader does anything
         * else, because a stale confirmation is worse than none.
         */
        const status = el('div', 'dya-text crw-note')
        status.hidden = true

        /*
         * The profiles this plugin ships, offered as a sheet of their own. A corpus repository is
         * not part of this one, so a fresh installation had a Targets view holding one tile and no
         * way to learn what a working profile looks like short of writing one. Each group installs
         * as a whole, into the repository that group already lives in, and a profile already on
         * the disk is never replaced: it may have been edited since.
         */
        const library = el('div', 'dya-sheet crw-sheet')
        library.hidden = true
        const libraryBar = el('div', 'dya-bar dya-bar--inset crw-bar crw-sheet-bar')
        const libraryClose = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Close')
        libraryBar.append(el('span', 'dya-title crw-status', 'Profile library'), libraryClose)
        const shelves = el('div', 'crw-library')
        const libraryNote = el('div', 'dya-text crw-note')
        library.append(libraryBar, shelves, libraryNote)

        targets.append(grid, status, scrim, sheet, library)

        let current = null
        let raisedBy = null
        let landed = ''
        let corpora = new Map()

        const report = (text, good) => {
            status.className = `dya-text crw-note${good === false ? ' dya-text--danger' : ' dya-text--success'}`
            status.textContent = text
            status.hidden = !text
        }

        /*
         * Opening the sheet takes the view it opened over. The grid keeps showing through the
         * inset, and every card still in it used to hover, take a click and answer it by loading
         * that target over the one being written, with nothing said and the edit gone. It is
         * `inert` while the sheet is up, so there is nothing behind to press, nothing to tab into
         * and nothing for the wheel to move; the scrim is what says so before the reader tries.
         */
        function raise(name, source) {
            current = name
            raisedBy = source ?? null
            title.textContent = name ?? 'new target'
            yaml.node.hidden = name === null
            inspect.disabled = name === null
            save.disabled = name === null
            landed = ''
            report('')
            confirmClose.reset()
            confirmDelete.reset()
            remove.disabled = name === null
            grid.inert = true
            scrim.hidden = false
            sheet.hidden = false
        }

        function drop() {
            current = null
            landed = ''
            form.close()
            confirmClose.reset()
            confirmDelete.reset()
            sheet.hidden = true
            scrim.hidden = true
            grid.inert = false
            say('')
            /* Back where it came from, so the keyboard is not returned to the top of the grid. */
            if (raisedBy && raisedBy.isConnected) raisedBy.focus()
            raisedBy = null
        }

        /* An unsaved profile is work, and closing over it silently is how it is lost. */
        const dirty = () => Boolean(current) && yaml.value !== landed
        const confirmClose = arming(close, 'Discard')
        const confirmDelete = arming(remove, 'Delete for good')

        const leave = () => {
            if (confirmClose.armed) {
                confirmClose.reset()
                drop()
                return
            }
            if (!dirty()) {
                drop()
                return
            }
            confirmClose.arm()
            say('unsaved changes to this profile', false)
        }

        close.addEventListener('click', leave)
        scrim.addEventListener('click', () => (library.hidden ? leave() : shut()))
        libraryClose.addEventListener('click', () => shut())

        function browse(source) {
            raisedBy = source ?? null
            libraryNote.textContent = ''
            grid.inert = true
            scrim.hidden = false
            library.hidden = false
            void shelve()
        }

        function shut() {
            library.hidden = true
            scrim.hidden = true
            grid.inert = false
            if (raisedBy && raisedBy.isConnected) raisedBy.focus()
            raisedBy = null
        }

        async function shelve() {
            try {
                const catalog = await ctx.invoke('catalog')
                if (catalog && catalog.needsEnvironment) {
                    shelves.replaceChildren(
                        el('div', 'dya-empty', 'needs its Python environment — turn this plugin on in Setup')
                    )
                    return
                }
                for (const shelf of catalog) groups.add(shelf.group)
                shelves.replaceChildren(...catalog.map(shelfOf))
            } catch (error) {
                shelves.replaceChildren(el('div', 'dya-empty dya-text--danger', reason(error)))
            }
        }

        function shelfOf(shelf) {
            const node = el('section')
            const head = el('div', 'crw-libhead')
            const here = shelf.profiles.filter((profile) => profile.installed).length
            const missing = shelf.profiles.length - here
            const counts = [`${shelf.profiles.length} profiles`]
            if (here) counts.push(missing ? `${here} installed` : 'all installed')
            head.append(groupTag(shelf.group), el('span', 'dya-meta', counts.join('  ·  ')))
            if (missing) {
                const install = el('button', 'dya-button dya-button--sm', `Install ${missing}`)
                install.addEventListener('click', () => void put(shelf.group, install))
                head.append(install)
            }

            const table = el('table', 'dya-table')
            const body = el('tbody')
            for (const profile of shelf.profiles) {
                const row = el('tr')
                const end = el('td', 'dya-table__end')
                if (profile.installed && missing) {
                    end.append(el('span', 'dya-badge dya-badge--success dya-badge--soft', 'installed'))
                }
                row.append(
                    el('td', 'dya-table__name', profile.name),
                    el('td', 'dya-table__prose', profile.description),
                    end
                )
                body.appendChild(row)
            }
            table.appendChild(body)
            node.append(head, table)
            return node
        }

        async function put(group, button) {
            button.disabled = true
            libraryNote.className = 'dya-text crw-note'
            libraryNote.textContent = `installing ${group}…`
            try {
                const done = await ctx.invoke('install', group)
                const count = done.installed.length
                const noun = count === 1 ? 'profile' : 'profiles'
                libraryNote.className = 'dya-text crw-note dya-text--success'
                libraryNote.textContent = `${count} ${noun} of ${group} installed in ${done.repository}`
                await Promise.all([shelve(), refreshList(), roundsView.refresh()])
            } catch (error) {
                button.disabled = false
                libraryNote.className = 'dya-text crw-note dya-text--danger'
                libraryNote.textContent = reason(error)
            }
        }

        /*
         * Deleting a target is the profile, the snapshot and the exports, because that is what a
         * target is; leaving two of the three behind is how a corpus nothing can name is made.
         * The first press says exactly what comes off the disk, the second does it.
         */
        remove.addEventListener('click', () => {
            if (confirmDelete.armed) {
                confirmDelete.reset()
                void erase()
                return
            }
            if (!current) return
            const corpus = corpora.get(current)
            confirmDelete.arm()
            say(
                corpus
                    ? `${current}, its ${corpus.pages} pages and its exports come off the disk`
                    : `${current} comes off the disk`,
                false
            )
        })

        async function erase() {
            const name = current
            if (!name) return
            say('deleting…')
            try {
                const said = String(await ctx.invoke('delete', name, true))
                landed = yaml.value
                drop()
                await refreshList()
                report(said, true)
            } catch (error) {
                say(reason(error), false)
            }
        }

        /*
         * Pressing the scrim must not take the focus with it. A press that lands on it and does
         * not close -- an edit it is asking about -- otherwise leaves the focus on the document,
         * outside the panel, where Escape reaches nothing and the reader has to find the button
         * with the pointer they already have on the wrong half of the screen.
         */
        scrim.addEventListener('mousedown', (event) => event.preventDefault())

        /*
         * Escape belongs to the panel, not to the sheet. Bound to the view it only fired while the
         * focus was already inside, which is never the case for a reader who reached for the key
         * because the pointer was somewhere else.
         */
        root.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            if (targets.hidden || (sheet.hidden && library.hidden)) return
            event.preventDefault()
            if (library.hidden) leave()
            else shut()
        })

        inspect.addEventListener('click', () => void probe())
        save.addEventListener('click', () => void write())

        async function refreshList() {
            grid.replaceChildren(newTargetCard(), libraryCard())
            try {
                const [profiles, state] = await Promise.all([ctx.invoke('profiles'), ctx.invoke('state')])
                if (profiles && profiles.needsEnvironment) {
                    grid.replaceChildren(
                        el(
                            'div',
                            'dya-empty',
                            'needs its Python environment — turn this plugin on in Setup'
                        )
                    )
                    return
                }

                const byName = new Map()
                for (const repo of (state && state.repositories) || []) {
                    for (const corpus of repo.corpora || []) byName.set(corpus.name, corpus)
                }
                corpora = byName

                for (const profile of profiles) if (profile.group) groups.add(profile.group)
                for (const profile of profiles) grid.appendChild(targetCard(profile, byName.get(profile.name)))
            } catch (error) {
                grid.replaceChildren(el('div', 'dya-empty dya-text--danger', reason(error)))
            }
        }

        function newTargetCard() {
            const card = el('button', 'dya-tile crw-new')
            const icon = el('span', 'dya-tile__icon')
            icon.innerHTML = PLUS
            card.append(icon, el('span', 'dya-tile__name', 'New target'), el(
                'span',
                'dya-tile__note',
                'Point the crawler at a site or a sitemap and keep what it finds.'
            ))
            card.addEventListener('click', () => {
                raise(null, card)
                form.open()
            })
            return card
        }

        function libraryCard() {
            const card = el('button', 'dya-tile crw-new')
            const icon = el('span', 'dya-tile__icon')
            icon.innerHTML = BOOK
            card.append(icon, el('span', 'dya-tile__name', 'Profile library'), el(
                'span',
                'dya-tile__note',
                'Ready-made targets for the AI labs and Salesforce documentation.'
            ))
            card.addEventListener('click', () => browse(card))
            return card
        }

        /*
         * A target, as the thing it is rather than as its name. The state badge is the same one the
         * rounds table carries, so a corpus that changed says so in both places in one colour.
         */
        function targetCard(profile, corpus) {
            const card = el('button', 'dya-tile dya-tile--dense crw-target')
            const head = el('div', 'dya-tile__head')
            head.append(el('span', 'dya-tile__name', profile.name))
            if (corpus) head.append(stateBadge(corpus))
            card.append(head)

            if (profile.description) card.append(el('span', 'dya-tile__note', profile.description))

            const facts = corpus
                ? [`${corpus.pages} pages`, swept(corpus.swept_at)]
                : [`${profile.urls.length} start ${profile.urls.length === 1 ? 'url' : 'urls'}`]
            const line = el('div', 'crw-facts')
            if (profile.group) line.append(groupTag(profile.group))
            line.append(el('span', 'dya-meta', facts.join('  ·  ')))
            card.append(line)

            card.addEventListener('click', () => void open(profile.name, card))
            return card
        }

        async function open(name, source) {
            form.close()
            say('')
            raise(name, source)
            try {
                yaml.value = await ctx.invoke('show', name)
                landed = yaml.value
                yaml.focus()
            } catch (error) {
                say(reason(error), false)
            }
        }

        async function write() {
            if (!current) return
            say('saving…')
            try {
                say(String(await ctx.invoke('save', current, yaml.value)), true)
                landed = yaml.value
                await refreshList()
            } catch (error) {
                say(reason(error), false)
            }
        }

        async function probe() {
            const url = firstUrl(yaml.value)
            if (!url) {
                say('no URL in this profile to probe', false)
                return
            }
            log.textContent = ''
            await begin('inspect', { url }, log, note, { run: inspect, stop: null })
        }

        function say(text, good) {
            const tone =
                good === undefined
                    ? ''
                    : good
                      ? ' dya-text--success'
                      : ' dya-text--danger'
            note.className = `dya-text crw-note${tone}`
            note.textContent = text
        }

        /*
     * A field that is two elements, offered as one. The textarea is as tall as its own text so it
     * never scrolls on its own and there are not two scroll positions to hold in step; the frame
     * scrolls, and the caret stays in view because it is inside the frame.
     */
    function buildYaml() {
        const node = el('div', 'dya-field crw-yaml')
        const behind = el('pre', 'dya-code')
        const field = el('textarea')
        field.spellcheck = false

        const repaint = () => {
            behind.innerHTML = ctx.highlight(`${field.value}\n`, 'yaml')
            field.style.height = `${Math.max(behind.scrollHeight, node.clientHeight)}px`
        }

        field.addEventListener('input', repaint)
        new ResizeObserver(repaint).observe(node)
        node.append(behind, field)

        return {
            node,
            focus() {
                field.focus()
                field.setSelectionRange(0, 0)
            },
            get value() {
                return field.value
            },
            set value(next) {
                field.value = next
                repaint()
            }
        }
    }

    function buildForm() {
            const node = el('div', 'crw-form')
            node.hidden = true
            const fields = {}
            for (const [key, label, placeholder] of [
                ['name', 'name', 'claude-docs'],
                ['url', 'URL or sitemap', 'https://example.com/sitemap.xml'],
                ['group', 'group', 'docs-labs'],
                ['description', 'description', 'what this corpus is'],
            ]) {
                const input = el('input', `dya-field${key === 'description' ? ' dya-field--prose' : ''}`)
                input.placeholder = placeholder
                fields[key] = input
                node.append(el('span', 'dya-key-label', label), input)
            }
            const snapshotBox = el('label', 'crw-check')
            const snapshot = el('input', 'dya-checkbox')
            snapshot.type = 'checkbox'
            snapshot.checked = true
            snapshotBox.append(snapshot, el('span', 'dya-text', 'track its changes over time'))
            const create = el('button', 'dya-button dya-button--sm', 'Draft it')
            node.append(el('span', 'dya-key-label', 'snapshot'), snapshotBox, el('span'), create)

            create.addEventListener('click', () => {
                const name = fields.name.value.trim()
                const url = fields.url.value.trim()
                if (!name || !url) {
                    say('a target needs a name and a URL', false)
                    return
                }
                yaml.value = draft({
                    name,
                    url,
                    group: fields.group.value.trim(),
                    description: fields.description.value.trim(),
                    snapshot: snapshot.checked,
                })
                raise(name)
                node.hidden = true
                say('drafted, not saved. Read it, probe it, then save it.')
            })

            return {
                node,
                open() {
                    node.hidden = false
                    for (const input of Object.values(fields)) input.value = ''
                    fields.name.focus()
                    say('')
                },
                close() {
                    node.hidden = true
                },
            }
        }

        return {
            refresh: refreshList,
            finished(report) {
                inspect.disabled = false
                say(report.code === 0 ? 'probe finished' : `probe ${report.verdict}`, report.code === 0)
            },
        }
    }


    async function begin(kind, payload, into, status, controls) {
        if (busy) {
            status.textContent = 'something is already running in this panel'
            return
        }
        busy = true
        sink = into
        ansi = plainAnsi()
        into.textContent = ''
        into.hidden = false
        /*
         * Something that can be stopped trades its start button for the stop: a RUN left beside
         * STOP for the whole round was a control that could not be pressed, drawn as one that could.
         * A probe cannot be stopped, so its button stays where it is and waits.
         */
        controls.run.disabled = !controls.stop
        controls.run.hidden = Boolean(controls.stop)
        if (controls.stop) controls.stop.hidden = false
        status.className = 'dya-text crw-status'
        try {
            status.textContent = `running ${String(await ctx.invoke('start', kind, payload))}`
        } catch (error) {
            busy = false
            controls.run.disabled = false
            controls.run.hidden = false
            if (controls.stop) controls.stop.hidden = true
            status.className = 'dya-text crw-status dya-text--danger'
            status.textContent = reason(error)
        }
    }
}
