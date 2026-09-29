/*
 * The panel. Plain DOM and no build step: the shell serves this file as it is written, and the
 * only thing it needs from the SDK is a style tag, which is six lines and is inlined below rather
 * than imported. A plugin that cannot be read without first being compiled is harder to trust.
 */

const ICON =
    '<svg viewBox="9.15 5 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M39.843 34.81h-29.4c-.42 0-.683-.474-.473-.855l7.35-13.24 7.351-13.238a.537.537 0 0 1 .947 0l4.728 8.517a6.521 6.521 0 0 0 1.57 12.848c1.765 0 3.369-.7 4.542-1.843l3.861 6.956c.21.378-.053.854-.473.854h-.003Z" fill="url(#crawlee-body)" stroke="url(#crawlee-body)" stroke-width="1.039"/><path d="M37.855 25.017a6.519 6.519 0 0 1-5.938 3.825 6.518 6.518 0 0 1-6.52-6.52 6.518 6.518 0 0 1 9.343-5.878" stroke="url(#crawlee-arc)" stroke-width="2"/><defs><linearGradient id="crawlee-body" x1="40.393" y1="7.193" x2="12.912" y2="37.541" gradientUnits="userSpaceOnUse"><stop stop-color="#FFB200"/><stop offset=".53" stop-color="#F98618"/><stop offset="1" stop-color="#EB284B"/></linearGradient><linearGradient id="crawlee-arc" x1="37.855" y1="15.803" x2="24.829" y2="28.247" gradientUnits="userSpaceOnUse"><stop stop-color="#FFB200"/><stop offset=".53" stop-color="#F98618"/><stop offset="1" stop-color="#EB284B"/></linearGradient></defs></svg>'

const CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'

const PLUS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'

const BOOK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>'

/*
 * The shared action glyphs, drawn as packages/sdk/src/glyphs.ts draws them. This file is served
 * unbuilt, so it carries its own copy of the few it uses.
 */
const SEARCH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.5-4.5"/></svg>'

const SAVE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 3v5h7V3"/><path d="M8 21v-7h8v7"/></svg>'

const INSPECT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'

const DELETE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>'

const FOLDER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>'

const OPEN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'

const STYLE = `
.crw-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--dya-space-3);
    padding: var(--dya-space-4);
    overflow: hidden;
}
/*
 * What a round covers and the key that runs it, heading the list they act on. They lived in the
 * dock's tab row, which on a wide window put them two thousand pixels from the first target.
 */
.crw-bar.crw-runbar {
    gap: var(--dya-space-2);
}
.crw-runbar > .dya-ring {
    margin-inline-start: var(--dya-space-3);
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
 * The problem line and the footer sit on the table's left edge, not on the panel's. A cell carries
 * its own padding, so a line flush with the panel starts a whole cell inset to the left of every
 * value under it and nothing in the view lines up with anything.
 */
.crw-headline {
    flex: none;
    padding-inline: var(--dya-space-3);
    overflow-wrap: anywhere;
}
.crw-headline:empty {
    display: none;
}
/*
 * The list and the selected target's changes side by side once the panel can hold both: the list
 * at its content's width up to 640px, the changes taking the rest. Narrower, the list is alone.
 */
.crw-split {
    display: flex;
    flex: 1 1 auto;
    gap: var(--dya-space-6);
    min-height: 160px;
}
.crw-list {
    flex: 1;
    min-width: 0;
    overflow: auto;
}
.crw-summary {
    padding: var(--dya-space-3) var(--dya-space-4);
}
.crw-summary:empty {
    display: none;
}
.crw-detail {
    display: none;
    flex: 1;
    flex-direction: column;
    gap: var(--dya-space-3);
    min-width: 0;
    overflow: auto;
}
@container pane (min-width: 1100px) {
    .crw-list {
        flex: 0 1 auto;
        max-width: 640px;
    }
    .crw-detail {
        display: flex;
    }
    .crw-list .dya-row {
        cursor: pointer;
    }
}
.crw-detail-head {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-3);
    flex-wrap: wrap;
}
.crw-changes {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
}
.crw-change-head {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    padding: var(--dya-space-2) 0;
    cursor: pointer;
    list-style: none;
}
.crw-change-head::-webkit-details-marker {
    display: none;
}
.crw-diff {
    max-height: 420px;
    overflow: auto;
}

.crw-bar {
    flex: none;
    flex-wrap: wrap;
    gap: var(--dya-space-5);
    padding: var(--dya-space-3);
}
.crw-scope {
    min-width: 180px;
}
.crw-check {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-2);
    flex: none;
}
.crw-status {
    flex: none;
    padding-inline: var(--dya-space-4);
}
.crw-status:empty {
    display: none;
}
/*
 * The console and the handle that sizes it. Everything else in this application can be resized -
 * the window, the dock, every panel in it - and the one region that fills with text a line at a
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
.crw-out-head {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.crw-out-head > .dya-splitter {
    flex: 1;
    margin-inline-start: var(--dya-size-control-sm);
}
.crw-out-head > .dya-key {
    width: var(--dya-size-control-sm);
    height: var(--dya-size-control-sm);
}
.crw-out:has(> .dya-log[data-running]) .crw-out-head > .dya-key {
    visibility: hidden;
}
.crw-log {
    flex: 1;
    min-height: 0;
}
/*
 * The targets, as a gallery of cards of one width. A rail of names 210px wide made a 1400px window
 * 85% black, and told the reader nothing about a target except that it exists.
 */
.crw-grid {
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
.crw-facts > .dya-meta {
    flex: none;
}
.crw-target,
.crw-new {
    min-width: 0;
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
    flex: 1;
    min-height: 140px;
}
.crw-yaml[hidden] {
    display: none;
}
/* Inside the sheet the console starts shorter: the subject there is the target being written, and
   the output of a probe is a footnote to it. It resizes like the other one. */
.crw-sheet .crw-out {
    height: 120px;
}
.crw-form {
    max-width: 560px;
    flex: none;
}
.crw-note {
    min-height: 1.4em;
}
.crw-query {
    flex: 0 1 560px;
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
    gap: var(--dya-space-1);
}
.crw-hit-head {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-2);
    flex-wrap: wrap;
}
.crw-hit-where {
    margin-left: auto;
}
.crw-hit-url {
    user-select: all;
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

function needsEnvironment(ctx) {
    const box = el('div', 'dya-empty')
    const actions = el('div', 'dya-empty__actions')
    const setup = el('button', 'dya-button', 'Setup')
    setup.type = 'button'
    setup.addEventListener('click', () => void ctx.shell.show('settings'))
    actions.append(setup)
    box.append(el('span', 'dya-title', 'No Python environment'), actions)
    return box
}

const KINDS = { added: 'Added', modified: 'Changed', removed: 'Removed' }

function plural(count, noun) {
    return `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`
}

function stateBadge(corpus) {
    if (corpus.error) return el('span', 'dya-badge dya-badge--danger', 'Unreadable')

    /*
     * A sweep that found nothing writes no change report, so the one on disk is older than the
     * sweep. That is the quiet outcome, not a warning: it wore the yellow light as `stale` and
     * twelve of fourteen corpora looked like trouble. Only a change asks to be looked at, and a
     * quiet target carries nothing: `unchanged` on twelve of fourteen is a word read twelve times
     * to learn nothing. A first snapshot says `New`, a failure says so in red.
     *
     * The change is one number and a word, in a neutral pill: finding changes is what a round is
     * for, not a warning. `+1 ~71` was three signs to decode; the detail says which, page by page.
     */
    if (!corpus.changed) return corpus.first_run ? el('span', 'dya-tag', 'New') : null

    const moved = ['added', 'modified', 'removed'].reduce((sum, key) => sum + (Number(corpus[key]) || 0), 0)
    return el('span', 'dya-tag', moved ? `${moved.toLocaleString('en')} changed` : 'Changed')
}


/*
 * A unified diff with its added lines in green and its removed lines in red, one element per line.
 */
function diffBlock(text) {
    const pre = el('pre', 'dya-code crw-diff')
    for (const line of String(text).split('\n')) {
        const tone = line.startsWith('+') && !line.startsWith('+++')
            ? 'dya-code__addition'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'dya-code__deletion'
              : line.startsWith('@@')
                ? 'dya-code__meta'
                : undefined
        pre.append(el('span', tone ? `dya-code__line ${tone}` : 'dya-code__line', line))
    }
    return pre
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
 * A control that asks before it does the thing it says. The first press turns it into a red key
 * that says in words what is about to happen, since a glyph cannot; the second press is the one
 * that acts, and the caller owns both. A few seconds of nothing puts it back, because an armed button left armed is a trap the
 * next click springs.
 *
 * Not `window.confirm`: that is an operating-system window over a panel, it stops the renderer
 * dead while it is up, and it is the one thing on screen this design system does not draw.
 */
function arming(button, prompt) {
    const face = button.innerHTML
    const tone = button.className
    let armed = false
    let timer = 0

    const reset = () => {
        armed = false
        window.clearTimeout(timer)
        button.innerHTML = face
        button.className = tone
    }

    const arm = () => {
        armed = true
        button.textContent = prompt
        button.className = 'dya-button dya-button--sm dya-button--danger'
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

/*
 * The palette's commands act on a panel that may not be open. `shell.show` answers with the
 * instance as soon as the dock has it, which is before the panel has mounted, so an action for
 * an instance not mounted yet waits here and the mount takes it.
 */
const mounted = new Map()
const waiting = new Map()

export function activate(ctx) {
    injectStyles(ctx.pluginId, STYLE)
    ctx.registerPanel(
        {
            id: 'crawlee',
            title: 'Crawlee',
            icon: ICON
        },
        (container, handle) => mount(ctx, container, handle)
    )
    for (const [id, title] of [
        ['run', 'Run round'],
        ['new', 'New target'],
        ['search', 'Search corpus']
    ]) {
        ctx.registerCommand({
            id,
            title,
            run: async () => {
                const instance = await ctx.shell.show('crawlee')
                if (!instance) return
                const perform = mounted.get(instance)
                if (perform) perform(id)
                else waiting.set(instance, id)
            }
        })
    }
}

function mount(ctx, container, handle) {
    const root = el('div', 'crw-root')

    /*
     * A glyph key's tip is kanon's hint popover, the same as every other panel's, kept in one
     * holder under the root that takes no room in the layout.
     */
    const tipHolder = el('div')
    tipHolder.style.display = 'contents'
    function withTip(control, text) {
        const tip = el('div', 'dya-tip', text)
        tip.id = `dya-tip-${crypto.randomUUID()}`
        tip.setAttribute('popover', 'hint')
        tipHolder.append(tip)
        control.setAttribute('interestfor', tip.id)
    }

    function iconKey(glyph, label, tone = '') {
        const button = el('button', tone ? `dya-key ${tone}` : 'dya-key')
        button.type = 'button'
        button.innerHTML = glyph
        button.setAttribute('aria-label', label)
        withTip(button, label)
        return button
    }

    const tabs = el('div', 'dya-tabs')
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
     * A group is information, so it is a pill, and a neutral one: colour is status, and a group is
     * not a state.
     */
    const groupTag = (group) => el('span', 'dya-tag', group)

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
        if (id === 'search') searchView.focus()
    }

    const roundsView = buildRounds()
    const targetsView = buildTargets()
    const searchView = buildSearch()

    handle.toolbar.append(tabs)
    root.append(rounds, targets, searching, tipHolder)
    container.appendChild(root)
    select('rounds')

    const act = (action) => {
        if (action === 'run') {
            select('rounds')
            roundsView.start()
        } else if (action === 'new') {
            select('targets')
            targetsView.create()
        } else if (action === 'search') {
            select('search')
        }
    }
    mounted.set(handle.instanceId, act)
    const waited = waiting.get(handle.instanceId)
    waiting.delete(handle.instanceId)
    if (waited) act(waited)

    const unsubscribeLine = ctx.on('line', (text) => {
        if (!sink) return
        const atBottom = sink.scrollHeight - sink.scrollTop - sink.clientHeight < 40
        sink.append(paintAnsi(`${String(text)}\n`, ansi))
        if (atBottom) sink.scrollTop = sink.scrollHeight
    })

    const unsubscribeProgress = ctx.on('progress', (event) => roundsView.heard(event))

    const unsubscribeDone = ctx.on('done', (report) => {
        busy = false
        if (sink) delete sink.dataset.running
        if (report.kind === 'run') roundsView.finished(report)
        else targetsView.finished(report)
    })

    void roundsView.refresh()
    void targetsView.refresh()
    void searchView.refresh()

    return () => {
        mounted.delete(handle.instanceId)
        unsubscribeLine()
        unsubscribeProgress()
        unsubscribeDone()
        root.remove()
    }


    /*
     * A console somebody can make bigger. The handle drags, the arrow keys move it for anybody not
     * using a pointer, and a double-click swaps between the height it was given and most of the
     * view - which is what a reader wants the moment a round starts failing and the interesting
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
        grip.setAttribute('aria-label', 'Resize')
        const log = el('pre', 'dya-log crw-log')
        log.hidden = true
        const close = iconKey(CLOSE, 'Close')
        close.addEventListener('click', () => {
            log.hidden = true
        })
        const head = el('div', 'crw-out-head')
        head.append(grip, close)
        pane.append(head, log)

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
        /*
         * Nothing above the table but a problem when there is one. The counts are the summary
         * under it, the folder is Setup's, and the state is read again whenever it can have moved:
         * on open, after a round, after a target is saved.
         */
        const headline = el('div', 'dya-value crw-headline')

        const table = el('table', 'dya-table crw-table')
        const summary = el('p', 'dya-meta crw-summary')
        const list = el('div', 'crw-list')
        const vacant = el('div', 'dya-empty')
        const vacantActions = el('div', 'dya-empty__actions')
        const first = el('button', 'dya-button', 'New target')
        first.type = 'button'
        first.addEventListener('click', () => act('new'))
        vacantActions.append(first)
        vacant.append(vacantActions)
        vacant.hidden = true
        list.append(table, summary, vacant)

        /*
         * What the selected target's last change was, page by page with its diff. It is a region
         * of its own, beside the list, only where the panel is wide enough for both; a narrow panel
         * is the list alone.
         */
        const detail = el('section', 'crw-detail')
        const split = el('div', 'crw-split')
        split.append(list, detail)

        /*
         * The scope is one choice for two things: which targets the list shows and which the round
         * runs. A list of fourteen beside a round of one was a picker that looked as if it did
         * nothing until the key beside it was pressed.
         */
        const scope = el('select', 'dya-field dya-field--auto crw-scope')
        scope.setAttribute('aria-label', 'Targets')
        const scopeBox = el('span', 'dya-select')
        scopeBox.appendChild(scope)

        const run = el('button', 'dya-button dya-button--primary', 'Run')
        run.type = 'button'
        const stop = el('button', 'dya-button dya-button--danger', 'Stop')
        stop.type = 'button'
        stop.hidden = true
        const ring = el('span', 'dya-ring')
        ring.hidden = true

        const status = el('span', 'dya-text crw-status', '')
        const controls = el('div', 'dya-bar dya-bar--inset crw-bar crw-runbar')
        controls.append(scopeBox, run, stop, ring, status)

        /*
         * Where a round is, while it runs: a ring of one segment per target beside the key, and a
         * line after it with the target by its place and name, what changed and failed so
         * far, and the time it has been running. Until the command has said how many targets it
         * holds, the line is the time alone.
         */
        const round = { total: 0, done: 0, changed: 0, failed: 0, current: '', index: 0, started: 0, timer: 0 }

        const elapsed = () => {
            const seconds = Math.floor((Date.now() - round.started) / 1000)
            return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
        }

        const paintRound = () => {
            status.className = 'dya-text crw-status'
            if (!round.total) {
                status.textContent = elapsed()
                return
            }
            const parts = round.current
                ? [`${round.index}/${round.total}`, round.current]
                : [`${round.done}/${round.total}`]
            if (round.changed) parts.push(`${round.changed} changed`)
            if (round.failed) parts.push(`${round.failed} failed`)
            parts.push(elapsed())
            status.textContent = parts.join(' - ')
        }

        const pips = () => {
            const steps = Math.min(round.total, 24)
            ring.style.setProperty('--dya-ring-n', String(steps || 1))
            ring.style.setProperty('--dya-ring-done', String(Math.floor((round.done / (round.total || 1)) * steps)))
            ring.classList.toggle('dya-ring--current', round.done < round.total && Boolean(round.current))
            ring.hidden = round.total === 0
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

        const output = buildConsole('crawlee.console.rounds')
        const log = output.log
        rounds.append(controls, headline, split, output.node)

        run.addEventListener('click', () => void startRound())
        stop.addEventListener('click', () => void ctx.invoke('stop'))

        let chosen = null
        let asked = 0
        let everything = []

        scope.addEventListener('change', () => paint())

        async function refreshState() {
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

            if (state.needsEnvironment) {
                headline.replaceChildren(needsEnvironment(ctx))
                everything = []
                vacant.hidden = true
                table.replaceChildren()
                summary.textContent = ''
                detail.replaceChildren()
                return
            }

            headline.textContent = ''
            everything = (state.repositories || []).flatMap((repo) => repo.corpora || [])

            const sweptGroups = [...new Set(everything.map((corpus) => corpus.group).filter(Boolean))].sort()
            const kept = scope.value
            scope.replaceChildren()
            scope.appendChild(new Option('All targets', 'all'))
            if (sweptGroups.length) scope.appendChild(el('hr'))
            for (const group of sweptGroups) scope.appendChild(new Option(group, `group:${group}`))
            if (everything.length) scope.appendChild(el('hr'))
            for (const corpus of everything) {
                scope.appendChild(new Option(corpus.name, `name:${corpus.name}`))
            }
            if (kept && [...scope.options].some((option) => option.value === kept)) scope.value = kept

            paint()
        }

        function scoped() {
            const [kind, value] = picked()
            if (kind === 'group') return everything.filter((corpus) => corpus.group === value)
            if (kind === 'name') return everything.filter((corpus) => corpus.name === value)
            return everything
        }

        function picked() {
            const at = scope.value.indexOf(':')
            return at < 0 ? [scope.value, ''] : [scope.value.slice(0, at), scope.value.slice(at + 1)]
        }

        function paint() {
            const corpora = scoped()
            const labels = ['target', 'pages', 'size', 'change']
            const thead = el('thead')
            const header = el('tr')
            for (const label of labels) {
                header.appendChild(el('th', label === 'pages' || label === 'size' ? 'dya-table__num' : undefined, label))
            }
            thead.appendChild(header)

            /*
             * One section per group, headed once by the group and when it was last swept, instead
             * of a pill and a date repeated on every row. A target with no group goes first,
             * under no heading.
             */
            const order = [...new Set(corpora.map((corpus) => corpus.group || ''))].sort((a, b) =>
                a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)
            )
            const body = el('tbody')
            for (const group of order) {
                const members = corpora.filter((corpus) => (corpus.group || '') === group)
                if (group) {
                    const latest = members.map((corpus) => corpus.swept_at).filter(Boolean).sort().at(-1)
                    const section = el('tr', 'dya-table__section')
                    const cell = el('td', undefined, group)
                    if (latest) cell.append(' - ', el('span', 'dya-meta', ctx.when(latest)))
                    cell.colSpan = labels.length
                    section.append(cell)
                    body.append(section)
                }
                for (const corpus of members) {
                    const row = el('tr', 'dya-row')
                    row.dataset.name = corpus.name
                    row.append(
                        el('td', 'dya-table__name', corpus.name),
                        el('td', 'dya-table__num', corpus.pages.toLocaleString('en')),
                        el('td', 'dya-table__num', bytes(corpus.bytes)),
                        mark(corpus)
                    )
                    row.addEventListener('click', () => void show(corpus))
                    body.appendChild(row)
                }
            }
            table.replaceChildren(...(corpora.length ? [thead, body] : []))
            vacant.hidden = everything.length > 0
            run.disabled = everything.length === 0

            const total = (key) => corpora.reduce((sum, corpus) => sum + (Number(corpus[key]) || 0), 0)
            summary.textContent = corpora.length
                ? [plural(corpora.length, 'target'), plural(total('pages'), 'page'), bytes(total('bytes'))].join(' - ')
                : ''

            const again = corpora.find((corpus) => corpus.name === chosen)
            void show(again ?? corpora.find((corpus) => corpus.changed) ?? corpora[0] ?? null)
        }

        function mark(corpus) {
            const cell = el('td')
            const badge = stateBadge(corpus)
            if (badge) cell.appendChild(badge)
            return cell
        }

        async function show(corpus) {
            chosen = corpus?.name ?? null
            for (const row of table.querySelectorAll('tr.dya-row')) {
                row.classList.toggle('dya-row--selected', row.dataset.name === chosen)
            }
            if (!corpus) {
                detail.replaceChildren()
                return
            }
            const ticket = ++asked
            const head = el('div', 'crw-detail-head')
            head.append(el('span', 'dya-title', corpus.name))
            if (corpus.error) {
                detail.replaceChildren(head, el('p', 'dya-problem', corpus.error))
                return
            }
            detail.replaceChildren(head, el('span', 'dya-loading'))
            let found = null
            try {
                found = await ctx.invoke('changes', corpus.name)
            } catch (error) {
                if (ticket !== asked) return
                detail.replaceChildren(head, el('p', 'dya-problem', reason(error)))
                return
            }
            if (ticket !== asked) return
            const pages = (found?.pages || []).filter((page) => !page.reordered)
            const when = ctx.when(found?.generated_at)
            if (pages.length === 0) {
                head.append(el('span', 'dya-meta', when ? `No change since ${when}` : 'No change yet'))
                detail.replaceChildren(head)
                return
            }
            head.append(el('span', 'dya-meta', found.stale ? `Last change ${when}` : when))
            const tally = el('span', 'dya-pills')
            for (const [kind, word] of Object.entries(KINDS)) {
                const count = pages.filter((page) => page.kind === kind).length
                if (count) tally.append(el('span', 'dya-tag', `${count.toLocaleString('en')} ${word.toLowerCase()}`))
            }
            head.append(tally)
            const changes = el('div', 'crw-changes')
            for (const page of pages) {
                const item = el('details', 'crw-change')
                const line = el('summary', 'crw-change-head')
                line.append(el('span', 'dya-tag', KINDS[page.kind] ?? page.kind), el('span', 'dya-name', page.title || page.url))
                item.append(line)
                if (page.diff) item.append(diffBlock(page.diff))
                changes.append(item)
            }
            changes.firstElementChild?.setAttribute('open', '')
            detail.replaceChildren(head, changes)
        }

        async function startRound() {
            if (busy || run.hidden) {
                status.className = 'dya-text crw-status'
                status.textContent = 'Busy'
                return
            }
            Object.assign(round, { total: 0, done: 0, changed: 0, failed: 0, current: '', index: 0, started: Date.now() })
            pips()
            window.clearInterval(round.timer)
            const [kind, value] = picked()
            const payload = { commit: true }
            if (kind === 'group') payload.group = value
            if (kind === 'name') payload.names = [value]
            if (await begin('run', payload, log, status, { run, stop }, elapsed())) {
                round.timer = window.setInterval(paintRound, 1000)
            }
        }

        return {
            start: () => void startRound(),
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
                const head = failed ? 'Finished with failures' : stopped ? 'Stopped' : 'Finished'
                const parts = [`${head} at ${at}`]
                if (total) {
                    parts.push(`${done} of ${total}`)
                    const changed = report.changed ?? round.changed
                    if (changed) parts.push(`${changed} changed`)
                    if (report.failed) parts.push(`${report.failed} failed`)
                } else if (report.verdict) {
                    parts.push(report.verdict)
                }
                parts.push(report.minutes ? `${report.minutes} min` : elapsed())
                status.className = `dya-text crw-status ${failed ? 'dya-text--danger' : stopped ? '' : 'dya-text--success'}`
                status.textContent = parts.join(' - ')
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
            actions.append(el('span', 'dya-meta', `line ${hit.line}`))
        }
        if (ctx.shell.canOpen(hit.file)) {
            const open = iconKey(OPEN, 'Open')
            open.onclick = () => void ctx.shell.open({ path: hit.file, line: hit.line })
            actions.append(open)
        }
        const reveal = iconKey(FOLDER, 'Show')
        reveal.onclick = () => void ctx.shell.reveal(hit.file)
        actions.append(reveal)
        return actions
    }

    function buildSearch() {
        const bar = el('div', 'dya-bar dya-bar--inset crw-bar')
        const query = el('input', 'dya-field dya-field--prose crw-query')
        query.type = 'search'
        query.placeholder = 'Search'
        const scope = el('select', 'dya-field dya-field--auto crw-scope')
        const scopeBox = el('span', 'dya-select')
        scopeBox.appendChild(scope)
        const go = iconKey(SEARCH, 'Search')
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
                const every = el('option', undefined, 'All repositories')
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
            hits.replaceChildren(el('div', 'dya-loading'))
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
                hits.appendChild(el('div', 'dya-empty', 'No match'))
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
                const row = el('div', 'dya-entry crw-hit')
                const head = el('div', 'crw-hit-head')
                const titled = hit.title && hit.title !== hit.url
                head.append(
                    titled
                        ? el('span', 'dya-name', hit.title)
                        : el('span', 'dya-name', hit.url)
                )
                if (hit.heading) head.append(el('span', 'dya-meta', hit.heading))
                head.append(el('span', 'dya-meta crw-hit-where', `${hit.repository} / ${hit.target}`))
                const url = el('div', 'dya-meta dya-meta--wrap crw-hit-url', hit.url)
                const snippet = el('div', 'dya-entry__text')
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

        return {
            refresh,
            focus: () => query.focus()
        }
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
        const grid = el('div', 'dya-grid crw-grid')
        const scrim = el('div', 'dya-scrim')
        scrim.hidden = true
        const sheet = el('div', 'dya-sheet crw-sheet')
        sheet.hidden = true

        const bar = el('div', 'dya-bar dya-bar--inset crw-bar crw-sheet-bar')
        const title = el('span', 'dya-mono crw-status')
        const remove = iconKey(DELETE, 'Delete', 'dya-key--danger')
        const inspect = iconKey(INSPECT, 'Inspect')
        const save = iconKey(SAVE, 'Save')
        const close = iconKey(CLOSE, 'Close')
        const sheetKeys = el('div', 'dya-bar__group')
        sheetKeys.append(remove, inspect, save, close)
        bar.append(title, sheetKeys)

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
        const libraryClose = iconKey(CLOSE, 'Close')
        libraryBar.append(el('span', 'dya-title crw-status', 'Library'), libraryClose)
        const shelves = el('div', 'crw-library')
        const libraryNote = el('div', 'dya-text crw-note')
        library.append(libraryBar, shelves, libraryNote)

        targets.append(grid, status, scrim, sheet, library)

        let current = null
        let raisedBy = null
        let landed = ''
        let probing = null
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
            title.textContent = name ?? 'New target'
            yaml.node.hidden = name === null
            inspect.disabled = name === null
            save.disabled = name === null
            landed = ''
            report('')
            hush()
            confirmClose.reset()
            confirmDelete.reset()
            remove.disabled = name === null
            grid.inert = true
            scrim.hidden = false
            sheet.hidden = false
        }

        /*
         * An inspection's output belongs to the target it was run on, so it goes when the sheet
         * closes or turns to another target, a new one included.
         */
        function hush() {
            log.textContent = ''
            log.hidden = true
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
            hush()
            /* Back where it came from, so the keyboard is not returned to the top of the grid. */
            if (raisedBy && raisedBy.isConnected) raisedBy.focus()
            raisedBy = null
        }

        /* An unsaved profile is work, and closing over it silently is how it is lost. */
        const dirty = () => Boolean(current) && yaml.value !== landed
        const confirmClose = arming(close, 'Discard')
        const confirmDelete = arming(remove, 'Delete')

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
            say('Not saved', false)
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
                    shelves.replaceChildren(needsEnvironment(ctx))
                    return
                }
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
            head.append(groupTag(shelf.group))
            if (!missing) head.append(el('span', 'dya-badge dya-badge--success', 'Installed'))
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
                    end.append(el('span', 'dya-badge dya-badge--success', 'Installed'))
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
            libraryNote.textContent = 'Installing…'
            try {
                const done = await ctx.invoke('install', group)
                const count = done.installed.length
                libraryNote.className = 'dya-text crw-note dya-text--success'
                libraryNote.textContent = `${plural(count, 'target')} installed`
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
                corpus ? `Deletes ${current} and its ${plural(corpus.pages, 'page')}` : `Deletes ${current}`,
                false
            )
        })

        async function erase() {
            const name = current
            if (!name) return
            say('Deleting…')
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
                    grid.replaceChildren(needsEnvironment(ctx))
                    return
                }

                const byName = new Map()
                for (const repo of (state && state.repositories) || []) {
                    for (const corpus of repo.corpora || []) byName.set(corpus.name, corpus)
                }
                corpora = byName

                for (const profile of profiles) grid.appendChild(targetCard(profile, byName.get(profile.name)))
            } catch (error) {
                grid.replaceChildren(el('div', 'dya-empty dya-text--danger', reason(error)))
            }
        }

        function newTargetCard() {
            const card = el('button', 'dya-tile dya-tile--new crw-new')
            const icon = el('span', 'dya-tile__icon')
            icon.innerHTML = PLUS
            card.append(icon, el('span', 'dya-tile__name', 'New target'))
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
            card.append(icon, el('span', 'dya-tile__name', 'Library'))
            card.addEventListener('click', () => browse(card))
            return card
        }

        /*
         * A target, as the thing it is rather than as its name. The state badge is the same one the
         * rounds table carries, so a corpus that changed says so in both places in the same words.
         */
        function targetCard(profile, corpus) {
            const card = el('button', 'dya-tile dya-tile--dense crw-target')
            const head = el('div', 'dya-tile__head')
            head.append(el('span', 'dya-tile__name', profile.name))
            const badge = corpus && stateBadge(corpus)
            if (badge) head.append(badge)
            card.append(head)

            if (profile.description) card.append(el('span', 'dya-tile__note', profile.description))

            const facts = corpus
                ? [plural(corpus.pages, 'page'), ctx.when(corpus.swept_at)].filter(Boolean)
                : [plural(profile.urls.length, 'start URL')]
            const line = el('div', 'crw-facts')
            if (profile.group) line.append(groupTag(profile.group))
            line.append(el('span', 'dya-meta', facts.join(' - ')))
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
            say('Saving…')
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
                say('No URL', false)
                return
            }
            probing = current
            await begin('inspect', { url }, log, note, { run: inspect, stop: null }, 'Inspecting…')
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
        const node = el('div', 'dya-field dya-editor crw-yaml')
        const behind = el('pre', 'dya-code')
        const field = el('textarea')

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
            const node = el('div', 'dya-pane dya-form crw-form')
            node.hidden = true
            const fields = {}
            for (const [key, label, placeholder] of [
                ['name', 'Name', 'claude-docs'],
                ['url', 'URL or sitemap', 'https://example.com/sitemap.xml'],
                ['group', 'Group', 'docs-labs'],
                ['description', 'Description', 'Optional'],
            ]) {
                const input = el('input', `dya-field${key === 'description' ? ' dya-field--prose' : ''}`)
                input.placeholder = placeholder
                input.addEventListener('input', () => say(''))
                fields[key] = input
                node.append(el('span', 'dya-label', label), input)
            }
            const snapshotBox = el('label', 'crw-check')
            const snapshot = el('input', 'dya-checkbox')
            snapshot.type = 'checkbox'
            snapshot.checked = true
            snapshotBox.append(snapshot, el('span', 'dya-text', 'Track'))
            const create = el('button', 'dya-button dya-button--sm', 'Draft')
            const actions = el('div', 'dya-form__actions')
            actions.append(create)
            node.append(el('span', 'dya-label', 'Changes'), snapshotBox, actions)

            create.addEventListener('click', () => {
                const name = fields.name.value.trim()
                const url = fields.url.value.trim()
                if (!name || !url) {
                    say('Name and URL required', false)
                    return
                }
                yaml.value = draft({
                    name,
                    url,
                    group: fields.group.value.trim(),
                    description: fields.description.value.trim(),
                    snapshot: snapshot.checked,
                })
                raise(name, raisedBy)
                node.hidden = true
                say('Not saved')
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
            create() {
                if (!library.hidden) shut()
                if (!sheet.hidden && dirty()) {
                    leave()
                    return
                }
                raise(null, null)
                form.open()
            },
            finished(report) {
                inspect.disabled = current === null
                if (probing !== current) return
                say(report.code === 0 ? 'Inspected' : 'Inspect failed', report.code === 0)
            },
        }
    }


    async function begin(kind, payload, into, status, controls, said) {
        const tone = (name) => {
            status.classList.remove('dya-text--danger', 'dya-text--success')
            if (name) status.classList.add(name)
        }
        if (busy) {
            tone('')
            status.textContent = 'Busy'
            return false
        }
        busy = true
        sink = into
        ansi = plainAnsi()
        into.textContent = ''
        into.hidden = false
        into.dataset.running = 'true'
        /*
         * Something that can be stopped trades its start button for the stop: a RUN left beside
         * STOP for the whole round was a control that could not be pressed, drawn as one that could.
         * A probe cannot be stopped, so its button stays where it is and waits.
         */
        controls.run.disabled = !controls.stop
        controls.run.hidden = Boolean(controls.stop)
        if (controls.stop) controls.stop.hidden = false
        tone('')
        status.textContent = said
        try {
            await ctx.invoke('start', kind, payload)
            return true
        } catch (error) {
            busy = false
            delete into.dataset.running
            controls.run.disabled = false
            controls.run.hidden = false
            if (controls.stop) controls.stop.hidden = true
            tone('dya-text--danger')
            status.textContent = reason(error)
            return false
        }
    }
}
