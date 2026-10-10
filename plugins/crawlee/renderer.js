/*
 * The panel. Plain DOM and no build step: the shell serves this file as it is written, and the
 * only thing it needs from the SDK is a style tag, which is six lines and is inlined below rather
 * than imported. A plugin that cannot be read without first being compiled is harder to trust.
 */

const ICON =
    '<svg viewBox="9.15 5 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M39.843 34.81h-29.4c-.42 0-.683-.474-.473-.855l7.35-13.24 7.351-13.238a.537.537 0 0 1 .947 0l4.728 8.517a6.521 6.521 0 0 0 1.57 12.848c1.765 0 3.369-.7 4.542-1.843l3.861 6.956c.21.378-.053.854-.473.854h-.003Z" fill="url(#crawlee-body)" stroke="url(#crawlee-body)" stroke-width="1.039"/><path d="M37.855 25.017a6.519 6.519 0 0 1-5.938 3.825 6.518 6.518 0 0 1-6.52-6.52 6.518 6.518 0 0 1 9.343-5.878" stroke="url(#crawlee-arc)" stroke-width="2"/><defs><linearGradient id="crawlee-body" x1="40.393" y1="7.193" x2="12.912" y2="37.541" gradientUnits="userSpaceOnUse"><stop stop-color="#FFB200"/><stop offset=".53" stop-color="#F98618"/><stop offset="1" stop-color="#EB284B"/></linearGradient><linearGradient id="crawlee-arc" x1="37.855" y1="15.803" x2="24.829" y2="28.247" gradientUnits="userSpaceOnUse"><stop stop-color="#FFB200"/><stop offset=".53" stop-color="#F98618"/><stop offset="1" stop-color="#EB284B"/></linearGradient></defs></svg>'

const STYLE = `
.crw-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--dya-space-3);
    padding: var(--dya-space-4);
    overflow: hidden;
}
.crw-view {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--dya-space-4);
    min-height: 0;
}
/*
 * A view's own controls: one row at the one height, starting on the left edge of the table or the
 * list under it, so the first key and the first row stand on one vertical line.
 */
.crw-bar {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dya-space-3);
    min-height: var(--dya-size-control);
    min-width: 0;
}
.crw-status {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-width: 0;
}
.crw-status:empty,
.crw-headline:empty {
    display: none;
}
.crw-headline {
    flex: none;
}
.crw-search,
.crw-hits {
    max-width: 880px;
}
/*
 * Rounds: the changed targets in a column of their own and the article taking the rest; in a panel
 * too narrow for both, they take turns, the article a level in.
 */
.crw-split {
    display: flex;
    flex: 1 1 auto;
    min-height: 160px;
}
.crw-changed {
    flex: none;
    width: 264px;
    overflow: auto;
    padding-inline-end: var(--dya-space-4);
    border-inline-end: var(--dya-border-width) solid var(--dya-hairline);
}
.crw-changed > .dya-files,
.crw-suite > .dya-files {
    margin-inline-start: calc(-1 * var(--dya-space-2));
}
.crw-suite + .crw-suite,
.crw-changed > .dya-files + .crw-suite {
    margin-top: var(--dya-space-4);
}
.crw-article {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--dya-space-4);
    min-width: 0;
    overflow: auto;
    padding: var(--dya-space-2) var(--dya-space-6) var(--dya-space-6);
}
.crw-article > * {
    flex: none;
}
.crw-article > .dya-sheet__head {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--dya-space-1);
    height: auto;
}
.crw-article .dya-code {
    max-width: 880px;
}
@container pane (max-width: 899.98px) {
    .crw-changed {
        flex: 1;
        width: auto;
        padding-inline-end: 0;
        border: none;
    }
    .crw-article,
    .crw-split[data-drilled='true'] > .crw-changed {
        display: none;
    }
    .crw-split[data-drilled='true'] > .crw-article {
        display: flex;
        padding-inline: 0;
    }
}
.crw-list {
    flex: 1;
    min-width: 0;
    overflow: auto;
}
.crw-cards {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
}
.crw-actions {
    width: max-content;
    min-width: min(100%, 320px);
    margin-inline-start: calc(-1 * var(--dya-space-2));
}
.crw-card {
    flex: none;
    padding-bottom: var(--dya-space-2);
}
.crw-card > .dya-table {
    width: 100%;
    table-layout: fixed;
}
.crw-card .dya-table__name {
    width: auto;
}
.crw-card .dya-table__num {
    width: 80px;
    padding-inline: var(--dya-space-2);
}
.crw-card .crw-swept {
    width: 112px;
}
.crw-card .crw-pick {
    width: 40px;
    padding-inline: var(--dya-space-4) 0;
}
.crw-card .dya-card__header > label {
    display: flex;
    align-items: center;
    gap: var(--dya-space-3);
    cursor: pointer;
}
.crw-card .dya-table td {
    white-space: nowrap;
}
.crw-targets .dya-row {
    cursor: pointer;
}

.crw-changes {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.crw-change-head > .dya-name {
    flex: 1;
    min-width: 0;
}
/*
 * The console and the handle that sizes it. The handle sits inside the region so that one :has()
 * rule hides both when there is no output.
 */
.crw-out {
    display: flex;
    flex-direction: column;
    flex: 0 0 50%;
    gap: var(--dya-space-2);
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
    margin-inline-start: var(--dya-size-control);
}
.crw-out:has(> .dya-log[data-running]) .crw-out-head > .dya-key {
    visibility: hidden;
}
.crw-log {
    flex: 1;
    min-height: 0;
    margin: 0;
}
/*
 * The sheet that writes a target: what is written on the left, at a form's width, and what is
 * known about it on the right, taking the rest. A sheet narrower than two such regions stacks them.
 */
.crw-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--dya-space-5);
    min-height: 0;
}
.crw-main,
.crw-aside {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    gap: var(--dya-space-4);
    min-width: 0;
    min-height: 0;
}
.crw-aside {
    overflow: auto;
}
.crw-main:has(> .dya-form:not([hidden])) {
    flex: none;
}
@container (min-width: 960px) {
    .crw-body {
        flex-direction: row;
    }
    .crw-main,
    .crw-main:has(> .dya-form:not([hidden])) {
        flex: 0 1 720px;
    }
}
.crw-region {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
    min-width: 0;
}
.crw-region > .dya-code {
    margin: 0;
}
.crw-probe {
    flex: 1;
    min-height: 160px;
}
.crw-probe:has(> .dya-log[data-running]) .dya-sheet__end {
    visibility: hidden;
}
/*
 * The profile is a field holding an editor: the field is the well and its inset, the editor fills
 * it and scrolls, so the text behind and the textarea over it start on the same pixel.
 */
.crw-yaml {
    display: flex;
    flex: 1;
    height: auto;
    min-height: 140px;
    padding-block: var(--dya-space-3);
}
.crw-yaml > .dya-editor {
    flex: 1;
    min-width: 0;
}
.crw-library {
    min-height: 0;
    overflow: auto;
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
.crw-hit > .dya-entry__head {
    flex-wrap: wrap;
    min-height: var(--dya-size-control);
}
.crw-hit-url {
    user-select: all;
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

function button(className, text) {
    const node = el('button', className, text)
    node.type = 'button'
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
    const setup = button('dya-button', 'Setup')
    setup.addEventListener('click', () => void ctx.shell.show('settings'))
    actions.append(setup)
    box.append(el('span', 'dya-title', 'No Python environment'), actions)
    return box
}

const KINDS = { added: 'Added', modified: 'Changed', removed: 'Removed' }

function plural(count, noun) {
    return `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`
}

/*
 * What a target's last sweep left, as the words the rounds table and a card both carry: nothing
 * for a quiet target, the number of pages that moved for one that changed, `New` for a first
 * snapshot, `Not crawled` before one, and `Unreadable` in red for a corpus that cannot be read.
 */
function stateOf(corpus) {
    if (corpus.error) return { text: 'Unreadable', tone: 'danger' }
    if (corpus.never_crawled) return { text: 'Not crawled' }
    if (!corpus.changed) return corpus.first_run ? { text: 'New' } : null
    const moved = ['added', 'modified', 'removed'].reduce((sum, key) => sum + (Number(corpus[key]) || 0), 0)
    return { text: moved ? `${moved.toLocaleString('en')} changed` : 'Changed', moved }
}

/*
 * A unified diff as it comes, one element per line, its added and removed lines in kanon's quiet
 * git colours. The two file lines go: they name the page the fold already names. A hunk's place
 * steps down to the faint ink, since it says where, not what.
 */
function diffBlock(text) {
    const pre = el('pre', 'dya-code dya-code--wrap')
    for (const line of String(text).split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---')) continue
        const tone = line.startsWith('+')
            ? 'dya-code__addition'
            : line.startsWith('-')
              ? 'dya-code__deletion'
              : line.startsWith('@@')
                ? 'dya-code__comment'
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
    const lines = name ? [`name: ${scalar(name)}`] : []
    if (description) lines.push(`description: ${scalar(description)}`)
    if (group) lines.push(`group: ${scalar(group)}`)
    if (url) lines.push(url.endsWith('.xml') ? 'sitemap_urls:' : 'start_urls:', `  - ${url}`)
    if (snapshot) lines.push('snapshot: true')
    return `${lines.join('\n')}\n`
}

function firstUrl(yaml) {
    const found = yaml.match(/^\s*-\s*(https?:\/\/\S+)/m)
    return found ? found[1] : ''
}

/*
 * A control that asks before it does the thing it says. The first press turns it into a red key
 * that says in words what cannot be undone, since a glyph cannot; the second press is the one
 * that acts, and the caller owns both. A few seconds of nothing puts it back, because an armed
 * button left armed is a trap the next click springs. While it spells a word it carries no tip.
 *
 * Not `window.confirm`: that is an operating-system window over a panel, it stops the renderer
 * dead while it is up, and it is the one thing on screen this design system does not draw.
 */
function arming(control, prompt) {
    const face = control.innerHTML
    const tone = control.className
    const tip = control.getAttribute('interestfor')
    let armed = false
    let timer = 0

    const reset = () => {
        armed = false
        window.clearTimeout(timer)
        control.innerHTML = face
        control.className = tone
        if (tip) control.setAttribute('interestfor', tip)
    }

    const arm = (words = prompt) => {
        armed = true
        control.textContent = words
        control.className = 'dya-button dya-button--danger'
        control.removeAttribute('interestfor')
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

    /*
     * The corpus answers the palette too. Each question starts the CLI, so it is asked only from
     * three letters on; a page is offered once, only when it holds every word, and a corpus that
     * is not set up answers nothing.
     */
    ctx.registerSearch(async (query) => {
        if (query.length < 3) return []
        const found = await ctx.invoke('search', { query, limit: 12 }).catch(() => [])
        const seen = new Set()
        return found
            .filter((hit) => hit.file && hit.match !== 'any' && !seen.has(hit.file) && seen.add(hit.file))
            .slice(0, 4)
            .map((hit) => ({
                id: `${hit.file}:${hit.line}`,
                title: hit.title && hit.title !== hit.url ? hit.title : hit.url,
                detail: hit.target,
                run: async () => {
                    if (!(ctx.shell.canOpen(hit.file) && (await ctx.shell.open({ path: hit.file, line: hit.line })))) {
                        await ctx.shell.reveal(hit.file)
                    }
                }
            }))
    })
}

function mount(ctx, container, handle) {
    const root = el('div', 'crw-root')

    /*
     * A glyph key's tip is kanon's hint popover, kept in one holder under the root that takes no
     * room in the layout. As the SDK's `tips()` does, a control that spells anything gets none,
     * because its tip could only repeat what is already on screen.
     */
    const tipHolder = el('div')
    tipHolder.style.display = 'contents'
    function withTip(control, text) {
        const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.textContent.trim() && !node.parentElement?.closest('svg')) return
        }
        const tip = el('div', 'dya-tip', text)
        tip.id = `dya-tip-${crypto.randomUUID()}`
        tip.setAttribute('popover', 'hint')
        tipHolder.append(tip)
        control.setAttribute('interestfor', tip.id)
    }

    function iconKey(name, label, tone = '') {
        const key = button(tone ? `dya-key ${tone}` : 'dya-key')
        key.innerHTML = ctx.glyph(name)
        key.setAttribute('aria-label', label)
        if (name === 'log') withTip(key, label)
        return key
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
     * What the next round runs is picked in Targets and run from the header's key: a suite by its
     * name when exactly one whole suite is picked, the picked targets by theirs otherwise, and
     * everything when nothing is.
     */
    const picked = new Set()

    function scope(everything) {
        if (!picked.size) return {}
        const groups = [...new Set(everything.map((corpus) => corpus.group).filter(Boolean))]
        const whole = groups.filter((group) => everything.filter((corpus) => corpus.group === group).every((corpus) => picked.has(corpus.name)))
        if (whole.length === 1 && everything.filter((corpus) => corpus.group === whole[0]).length === picked.size) return { group: whole[0] }
        return { names: [...picked] }
    }

    function box(checked, mixed, toggle) {
        const node = el('input', 'dya-checkbox')
        node.type = 'checkbox'
        node.checked = checked
        node.indeterminate = mixed
        node.addEventListener('click', (event) => event.stopPropagation())
        node.addEventListener('change', toggle)
        return node
    }

    /*
     * A suite as a card holding its table: a target per row with the box that picks it, its pages,
     * its size, what its last sweep changed and when, and under the rows what the suite adds up to.
     * The card's head is the suite and the box that picks all of it.
     */
    function targetTable(group, members, onOpen, repaint) {
        const node = el('article', 'dya-card crw-card')
        if (group) {
            const head = el('header', 'dya-card__header')
            const names = members.map((corpus) => corpus.name)
            const some = names.filter((name) => picked.has(name)).length
            const all = box(some > 0 && some === names.length, some > 0 && some < names.length, () => {
                if (some === names.length) names.forEach((name) => picked.delete(name))
                else names.forEach((name) => picked.add(name))
                repaint()
            })
            const pick = el('label')
            pick.append(all, el('span', 'dya-eyebrow', group))
            head.append(pick)
            node.append(head)
        }
        const table = el('table', 'dya-table dya-table--bare')
        const thead = el('thead')
        const header = el('tr')
        header.append(
            el('th', 'crw-pick'),
            el('th', undefined, 'Target'),
            el('th', 'dya-table__num', 'Pages'),
            el('th', 'dya-table__num', 'Size'),
            el('th', 'dya-table__num', 'Changed'),
            el('th', 'dya-table__num crw-swept', 'Swept')
        )
        thead.append(header)
        const body = el('tbody')
        for (const corpus of members) {
            const row = el('tr', 'dya-row')
            row.dataset.name = corpus.name
            const swept = el('td', 'dya-table__num crw-swept')
            if (corpus.swept_at) swept.append(el('span', 'dya-meta', ctx.when(corpus.swept_at)))
            const pick = el('td', 'crw-pick')
            pick.append(box(picked.has(corpus.name), false, () => {
                if (picked.has(corpus.name)) picked.delete(corpus.name)
                else picked.add(corpus.name)
                repaint()
            }))
            const moved = el('td', 'dya-table__num')
            const state = stateOf(corpus)
            if (state) moved.append(el('span', state.tone ? `dya-text--${state.tone}` : state.moved ? 'dya-name' : 'dya-meta', state.moved ? state.moved.toLocaleString('en') : state.text))
            row.append(
                pick,
                el('td', 'dya-table__name', corpus.name),
                el('td', 'dya-table__num', corpus.never_crawled ? '' : (corpus.pages ?? 0).toLocaleString('en')),
                el('td', 'dya-table__num', corpus.never_crawled ? '' : bytes(corpus.bytes ?? 0)),
                moved,
                swept
            )
            row.addEventListener('click', () => onOpen(corpus, row))
            body.append(row)
        }
        const sum = (take) => members.reduce((total, corpus) => total + (Number(take(corpus)) || 0), 0)
        const movedTotal = sum((corpus) => stateOf(corpus)?.moved)
        const figure = (text) => {
            const cell = el('td', 'dya-table__num')
            if (text) cell.append(el('span', 'dya-meta', text))
            return cell
        }
        const foot = el('tfoot')
        const subtotal = el('tr', 'crw-subtotal')
        subtotal.append(
            el('td'),
            el('td'),
            figure(sum((corpus) => corpus.pages).toLocaleString('en')),
            figure(bytes(sum((corpus) => corpus.bytes))),
            figure(movedTotal ? movedTotal.toLocaleString('en') : ''),
            el('td')
        )
        foot.append(subtotal)
        table.append(thead, body, foot)
        node.append(table)
        return node
    }

    const views = [
        { id: 'rounds', title: 'Rounds', node: rounds },
        { id: 'targets', title: 'Targets', node: targets },
        { id: 'search', title: 'Search', node: searching },
    ]
    const buttons = views.map((view) => {
        const tab = button('dya-tab', view.title)
        tab.addEventListener('click', () => select(view.id))
        tabs.appendChild(tab)
        return tab
    })

    /*
     * The views visited are a trail: back returns to the one before, home to Rounds, where the
     * panel opens.
     */
    const trail = []
    let at = null

    function select(id, going = true) {
        if (going && at && at !== id) trail.push(at)
        at = id
        views.forEach((view, index) => {
            const active = view.id === id
            view.node.hidden = !active
            buttons[index].setAttribute('aria-selected', String(active))
        })
        if (id === 'search') searchView.focus()
        nav()
    }

    /*
     * Back leaves a target opened a level in first, then walks the trail; home leaves both.
     */
    function nav() {
        const deep = at === 'rounds' && roundsView?.drilled()
        handle.navigate({
            back: deep ? () => roundsView.back() : trail.length ? () => select(trail.pop(), false) : null,
            home: deep || at !== 'rounds' ? () => {
                trail.length = 0
                if (roundsView?.drilled()) roundsView.back()
                select('rounds', false)
            } : null
        })
    }

    let roundsView = null
    roundsView = buildRounds()
    const targetsView = buildTargets()
    const searchView = buildSearch()

    handle.toolbar.append(tabs, roundsView.verbs)
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
     * One job at a time: the output goes to `into`, and the caller draws what running looks like.
     */
    async function begin(kind, payload, into, show = true) {
        if (busy) throw new Error('Busy')
        busy = true
        sink = into
        ansi = plainAnsi()
        into.textContent = ''
        if (show) into.hidden = false
        into.dataset.running = 'true'
        try {
            await ctx.invoke('start', kind, payload)
        } catch (error) {
            busy = false
            delete into.dataset.running
            throw error
        }
    }

    /*
     * What one target's last snapshot changed, page by page, each page opening onto its diff. The
     * head is whatever names the region where it is drawn, then the date and the tally; with no
     * heading there is no head, because the region beside a table row is named by the row.
     */
    async function changesInto(region, corpus, heading, still) {
        const head = el('div', 'dya-sheet__head')
        if (heading) head.append(heading)
        const top = heading ? [head] : []
        if (corpus.error) {
            region.replaceChildren(...top, el('p', 'dya-problem', corpus.error))
            return
        }
        if (corpus.never_crawled) {
            region.replaceChildren(...top)
            return
        }
        region.replaceChildren(...top, el('span', 'dya-loading'))
        let found = null
        try {
            found = await ctx.invoke('changes', corpus.name)
        } catch (error) {
            if (still()) region.replaceChildren(...top, el('p', 'dya-problem', reason(error)))
            return
        }
        if (!still()) return
        const pages = (found?.pages || []).filter((page) => !page.reordered)
        const when = ctx.when(found?.generated_at)
        if (pages.length === 0) {
            if (when) head.append(el('span', 'dya-meta', `Unchanged since ${when}`))
            region.replaceChildren(...top)
            return
        }
        const tally = Object.entries(KINDS)
            .map(([kind, word]) => [pages.filter((page) => page.kind === kind).length, word.toLowerCase()])
            .filter(([count]) => count)
            .map(([count, word]) => `${count.toLocaleString('en')} ${word}`)
        head.append(el('span', 'dya-meta', [when, ...tally].filter(Boolean).join(' - ')))
        const changes = el('div', 'crw-changes')
        const mixed = new Set(pages.map((page) => page.kind)).size > 1
        for (const page of pages) {
            const item = el('details', 'dya-fold')
            const line = el('summary', 'dya-fold__head crw-change-head')
            const mark = el('span', 'dya-fold__mark')
            mark.innerHTML = ctx.glyph('chevron')
            line.append(mark, el('span', 'dya-name', page.title || page.url))
            if (mixed) line.append(el('span', 'dya-meta', KINDS[page.kind] ?? page.kind))
            item.append(line)
            if (page.diff) item.append(diffBlock(page.diff))
            changes.append(item)
        }
        region.replaceChildren(...top, changes)
    }

    /*
     * A console somebody can make bigger. The handle drags, the arrow keys move it for anybody not
     * using a pointer, and a double-click swaps between the height it was given and most of the
     * view - which is what a reader wants the moment a round starts failing and the interesting
     * line is forty lines up. It opens on half the view, since it is shown only when asked for, and
     * its share of the view is remembered, so the panel opens the way it was left.
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
        const close = iconKey('close', 'Close')
        const shut = new Set()
        close.addEventListener('click', () => {
            log.hidden = true
            for (const listener of shut) listener()
        })
        const head = el('div', 'crw-out-head')
        head.append(grip, close)
        pane.append(head, log)

        let share = 0
        try {
            share = Number(localStorage.getItem(key)) || 0
        } catch {}
        let folded = 0
        if (share > 0 && share < 1) pane.style.flexBasis = `${share * 100}%`

        const whole = () => pane.parentElement?.getBoundingClientRect().height || 0
        const room = () => Math.max(MIN, whole() - 120)

        function size(next, remember) {
            const height = Math.max(MIN, Math.min(Math.round(next), room()))
            const of = whole()
            if (!of) return height
            pane.style.flexBasis = `${(height / of) * 100}%`
            if (remember) {
                try {
                    localStorage.setItem(key, String(height / of))
                } catch {}
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

        return { node: pane, log, closed: (listener) => shut.add(listener) }
    }

    function buildRounds() {
        /*
         * Rounds is for reading what changed. On the left, only the targets whose last sweep moved
         * something, under the suite each belongs to, every suite folding away; on the right, the
         * one chosen as an article: its name, when, and a section per changed page that opens onto
         * what went and what came. Everything about the targets themselves (pages, size, the boxes
         * that pick what runs) is Targets'. Run is a key in the header; while a round runs it is
         * Stop, its ring beside it, and the list shows where the round is. In a narrow panel the
         * list and the article take turns: a target opens a level in, and back returns.
         */
        const headline = el('div', 'crw-headline')
        const changed = el('nav', 'crw-changed')
        changed.setAttribute('aria-label', 'Changed targets')
        const article = el('article', 'crw-article')
        const split = el('div', 'crw-split')
        split.append(changed, article)

        const run = iconKey('play', 'Run')
        const ring = el('span', 'dya-ring')
        ring.hidden = true
        const logKey = iconKey('log', 'Log')
        logKey.hidden = true
        const verbs = el('div', 'dya-toolbar crw-verbs')
        verbs.append(ring, run, logKey)

        const output = buildConsole('crawlee.console.rounds')
        const log = output.log
        rounds.append(headline, split, output.node)

        const showLog = (on) => {
            log.hidden = !on
            logKey.classList.toggle('dya-key--active', on)
            logKey.setAttribute('aria-pressed', String(on))
        }
        const offerLog = () => {
            logKey.hidden = !going && !log.textContent
        }
        logKey.addEventListener('click', () => showLog(log.hidden))
        output.closed(() => showLog(false))

        let going = false
        let chosen = null
        let asked = 0
        let everything = []
        let drilled = false
        const shut = new Set()

        const round = { total: 0, done: 0, current: '' }
        const results = new Map()

        const running = (on) => {
            going = on
            run.innerHTML = ctx.glyph(on ? 'stop' : 'play')
            run.setAttribute('aria-label', on ? 'Stop' : 'Run')
            ring.hidden = !on
            offerLog()
            paint()
        }

        const pips = () => {
            const steps = Math.min(round.total, 24)
            ring.style.setProperty('--dya-ring-n', String(steps || 1))
            ring.style.setProperty('--dya-ring-done', String(Math.floor((round.done / (round.total || 1)) * steps)))
            ring.classList.toggle('dya-ring--current', Boolean(round.current))
            ring.classList.toggle('dya-ring--busy', round.total === 0)
        }

        const heard = (event) => {
            if (event.event === 'round') {
                Object.assign(round, { total: event.total, done: 0, current: '' })
            } else if (event.event === 'target') {
                round.current = event.name
                results.set(event.name, 'sweeping')
            } else if (event.event === 'finished') {
                round.done += 1
                const name = event.name ?? round.current
                if (name) results.set(name, event.error ? 'failed' : event.changed ? 'changed' : 'quiet')
                round.current = ''
            }
            pips()
            paint()
            offerLog()
        }

        run.addEventListener('click', () => (going ? void ctx.invoke('stop') : void startRound(scope(everything))))

        async function refreshState() {
            try {
                render(await ctx.invoke('state'))
            } catch (error) {
                headline.replaceChildren(el('p', 'dya-problem', reason(error)))
            }
        }

        function render(state) {
            if (state.needsEnvironment) {
                headline.replaceChildren(needsEnvironment(ctx))
                everything = []
                changed.replaceChildren()
                article.replaceChildren()
                verbs.hidden = true
                return
            }
            verbs.hidden = false
            headline.replaceChildren()
            everything = (state.repositories || []).flatMap((repo) => repo.corpora || [])
            const known = new Set(everything.map((corpus) => corpus.name))
            for (const name of [...picked]) if (!known.has(name)) picked.delete(name)
            paint()
        }

        /*
         * A target belongs on the left when there is something to read about it: what its last
         * sweep moved, a corpus that cannot be read, or what the round under way is doing to it.
         */
        function worth(corpus) {
            const now = results.get(corpus.name)
            if (now === 'sweeping' || now === 'failed' || now === 'changed') return true
            return Boolean(corpus.error) || Boolean(stateOf(corpus)?.moved)
        }

        function tally(corpus) {
            const now = results.get(corpus.name)
            if (now === 'sweeping') return el('span', 'dya-light dya-light--busy')
            if (now === 'failed' || corpus.error) return el('span', 'dya-text--danger', 'Failed')
            const moved = stateOf(corpus)?.moved
            return el('span', 'dya-meta', moved ? moved.toLocaleString('en') : '')
        }

        function paint() {
            const shown = everything.filter(worth)
            const order = [...new Set(shown.map((corpus) => corpus.group || ''))].sort((a, b) =>
                a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)
            )
            const groups = order.map((group) => {
                const members = shown.filter((corpus) => (corpus.group || '') === group)
                const files = el('ul', 'dya-files')
                for (const corpus of members) {
                    const item = el('li')
                    const row = button('dya-file')
                    row.setAttribute('aria-current', String(corpus.name === chosen))
                    row.append(el('span', 'dya-file__name', corpus.name), tally(corpus))
                    row.addEventListener('click', () => void open(corpus))
                    item.append(row)
                    files.append(item)
                }
                if (!group) return files
                const fold = el('details', 'dya-fold crw-suite')
                fold.open = !shut.has(group)
                fold.addEventListener('toggle', () => (fold.open ? shut.delete(group) : shut.add(group)))
                const head = el('summary', 'dya-fold__head')
                const mark = el('span', 'dya-fold__mark')
                mark.innerHTML = ctx.glyph('chevron')
                head.append(mark, el('span', 'dya-eyebrow', group))
                fold.append(head, files)
                return fold
            })
            changed.replaceChildren(...groups)
            if (!shown.length && everything.length) {
                const empty = el('div', 'dya-empty')
                const rows = el('ul', 'dya-files')
                const item = el('li')
                const again = button('dya-file')
                again.innerHTML = ctx.glyph('play')
                again.append(el('span', 'dya-file__name', 'Run every target'))
                again.addEventListener('click', () => void startRound({}))
                item.append(again)
                rows.append(item)
                empty.append(rows)
                changed.replaceChildren(empty)
                article.replaceChildren()
            }
            offerLog()
        }

        function open(corpus) {
            if (split.clientWidth < 900) drilled = Boolean(corpus)
            split.dataset.drilled = String(drilled)
            nav()
            return show(corpus)
        }

        function back() {
            drilled = false
            split.dataset.drilled = 'false'
            nav()
        }

        async function show(corpus) {
            chosen = corpus?.name ?? null
            for (const row of changed.querySelectorAll('.dya-file')) {
                row.setAttribute('aria-current', String(row.querySelector('.dya-file__name')?.textContent === chosen))
            }
            if (!corpus) {
                article.replaceChildren()
                return
            }
            const ticket = ++asked
            const title = el('h2', 'dya-title', corpus.name)
            await changesInto(article, corpus, title, () => ticket === asked)
        }

        async function startRound(scope) {
            if (going) return
            Object.assign(round, { total: 0, done: 0, current: '' })
            results.clear()
            headline.replaceChildren()
            try {
                await begin('run', { commit: true, ...scope }, log, false)
            } catch (error) {
                headline.replaceChildren(el('p', 'dya-problem', reason(error)))
                return
            }
            pips()
            running(true)
        }

        return {
            verbs,
            drilled: () => drilled,
            back,
            start: () => void startRound({}),
            refresh: async () => {
                await refreshState()
                if (chosen === null) void show(everything.find(worth) ?? null)
            },
            heard,
            /*
             * A round that ends leaves its failures on their rows until the next one; what it
             * changed is read back from the state, which knows how many pages moved.
             */
            finished(report) {
                for (const [name, result] of results) if (result !== 'failed') results.delete(name)
                round.current = ''
                running(false)
                if (report.code === 1 && results.size === 0 && report.verdict) {
                    headline.replaceChildren(el('p', 'dya-problem', report.verdict))
                }
                void refreshState().then(() => {
                    const again = everything.find((corpus) => corpus.name === chosen)
                    if (again) void show(again)
                })
            },
        }
    }

    /*
     * What a reader can do with a hit, which is the difference between being told a page exists
     * and being shown it. The snapshot is a file on disk, so there are two ways in: hand it to
     * whatever plugin in this installation renders that kind of file, at the line the passage
     * starts on, or show it where it lives. Which is offered is decided by asking the shell
     * whether anything opens it, never by naming a plugin.
     */
    function hitKeys(hit) {
        if (!hit.file) return null
        const strip = el('div', 'dya-join')
        if (ctx.shell.canOpen(hit.file)) {
            const open = iconKey('open', 'Open')
            open.onclick = () => void ctx.shell.open({ path: hit.file, line: hit.line })
            strip.append(open)
        }
        const reveal = iconKey('folder', 'Show')
        reveal.onclick = () => void ctx.shell.reveal(hit.file)
        strip.append(reveal)
        return strip
    }

    function buildSearch() {
        /*
         * The words, where to look and the key that looks, as one strip: a field with its keys
         * is a join. The field carries no placeholder, because the only word it could hold is the
         * one the key beside it already means.
         */
        const bar = el('div', 'crw-bar')
        const query = el('input', 'dya-field')
        query.type = 'search'
        query.setAttribute('aria-label', 'Query')
        const scope = el('select', 'dya-field dya-field--auto')
        scope.setAttribute('aria-label', 'Repository')
        const scopeBox = el('span', 'dya-select')
        scopeBox.appendChild(scope)
        const go = iconKey('search', 'Search')
        const strip = el('div', 'dya-join crw-search')
        strip.append(query, scopeBox, go)
        bar.append(strip)

        const hits = el('div', 'crw-hits')
        searching.append(bar, hits)

        go.addEventListener('click', () => void run())
        query.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') void run()
        })

        /*
         * The repository choice exists only where there is a choice: with one repository the
         * select could only ever say the same thing, so it leaves the strip.
         */
        async function refresh() {
            try {
                const state = await ctx.invoke('state')
                scope.replaceChildren(new Option('All repositories', ''))
                const names = (state.repositories || [])
                    .map((repo) => String(repo.root || '').split(/[\\/]/).pop())
                    .filter(Boolean)
                for (const name of names) scope.appendChild(new Option(name, name))
                if (names.length > 1) strip.insertBefore(scopeBox, go)
                else scopeBox.remove()
            } catch (error) {
                hits.replaceChildren(el('p', 'dya-problem', reason(error)))
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
                hits.replaceChildren(el('p', 'dya-problem', reason(error)))
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
                 * panel chose, so they keep their case. A page whose title is its own address
                 * says its address twice, so it gets the address alone. Where it lives and the
                 * keys that open it end the head.
                 */
                const row = el('div', 'dya-entry crw-hit')
                const head = el('div', 'dya-entry__head')
                const titled = hit.title && hit.title !== hit.url
                head.append(el('span', 'dya-name', titled ? hit.title : hit.url))
                if (hit.heading) head.append(el('span', 'dya-meta', hit.heading))
                const end = el('div', 'dya-sheet__end')
                const where = [`${hit.repository} / ${hit.target}`]
                if (hit.line > 1) where.push(`line ${hit.line}`)
                end.append(el('span', 'dya-meta', where.join(' - ')))
                const keys = hitKeys(hit)
                if (keys) end.append(keys)
                head.append(end)
                const snippet = el('div', 'dya-entry__text')
                for (const [index, part] of String(hit.snippet).split(/[\[\]]/).entries()) {
                    snippet.append(index % 2 ? el('mark', undefined, part) : part)
                }
                row.append(head)
                if (titled) row.append(el('div', 'dya-meta dya-meta--wrap crw-hit-url', hit.url))
                row.append(snippet)
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
         * cards that reflows from one column to five, a shelf per folder under its name. Opening one raises a sheet over the grid,
         * because a column that pushed the grid aside would leave a list too narrow to read and an
         * editor too narrow to write in.
         */
        const grid = el('div', 'crw-list crw-cards crw-targets')
        const scrim = el('div', 'dya-scrim')
        scrim.hidden = true

        /*
         * The sheet's head is the target and the keys that act on it: Delete, which unmakes, at
         * the far end of the strip from Save, which is the one primary; Inspect between them; the
         * close on its own after the strip. A new target is a form whose profile is written out
         * beside it as it is typed; Save writes that profile and the sheet becomes its editor.
         */
        const sheet = el('section', 'dya-sheet crw-sheet')
        sheet.setAttribute('role', 'dialog')
        sheet.setAttribute('aria-modal', 'true')
        sheet.hidden = true
        const title = el('span', 'dya-title')
        const state = el('span', 'crw-status')
        const remove = iconKey('delete', 'Delete', 'dya-key--danger')
        const inspect = button('dya-button', 'Inspect')
        const save = button('dya-button dya-button--primary', 'Save')
        const actions = el('div', 'dya-join')
        const close = iconKey('close', 'Close')
        const end = el('div', 'dya-sheet__end')
        end.append(actions, close)
        const head = el('header', 'dya-sheet__head')
        head.append(title, state, end)
        const problem = el('p', 'dya-problem dya-problem--box')
        problem.hidden = true

        const form = buildForm()
        const yaml = buildYaml()
        const main = el('div', 'crw-main')
        main.append(form.node, yaml.node)

        const preview = el('div', 'crw-region')
        const previewCode = el('pre', 'dya-code')
        preview.append(regionHead(el('span', 'dya-eyebrow', 'Profile')), previewCode)
        const history = el('div', 'crw-region')
        const probe = buildProbe()
        const aside = el('div', 'crw-aside')
        aside.append(preview, history, probe.node)
        const body = el('div', 'crw-body')
        body.append(main, aside)
        sheet.append(head, problem, body)

        /*
         * The profiles this plugin ships, offered as a sheet of their own: one table, a section per
         * group with the key that installs what of it is missing. Each group installs as a whole,
         * and a profile already on the disk is never replaced, since it may have been edited.
         */
        const library = el('section', 'dya-sheet dya-sheet--modal crw-sheet')
        library.setAttribute('role', 'dialog')
        library.setAttribute('aria-modal', 'true')
        library.hidden = true
        const libraryState = el('span', 'crw-status')
        const libraryClose = iconKey('close', 'Close')
        const libraryEnd = el('div', 'dya-sheet__end')
        libraryEnd.append(libraryClose)
        const libraryHead = el('header', 'dya-sheet__head')
        libraryHead.append(el('span', 'dya-title', 'Library'), libraryState, libraryEnd)
        const libraryProblem = el('p', 'dya-problem dya-problem--box')
        libraryProblem.hidden = true
        const shelves = el('div', 'crw-library')
        library.append(libraryHead, libraryProblem, shelves)

        targets.append(grid, scrim, sheet, library)

        let mode = null
        let current = null
        let raisedBy = null
        let landed = ''
        let probing = null
        let asked = 0
        let corpora = new Map()

        function regionHead(...parts) {
            const line = el('div', 'dya-sheet__head')
            line.append(...parts)
            return line
        }

        /*
         * The inspection of the target being written, in the region beside it. Its head names it
         * and carries its light: a hollow ring while it runs, then the outcome.
         */
        function buildProbe() {
            const node = el('div', 'crw-region crw-probe')
            const light = el('span', 'dya-light dya-light--busy')
            const shut = iconKey('close', 'Close')
            const tail = el('div', 'dya-sheet__end')
            tail.append(shut)
            const log = el('pre', 'dya-log crw-log')
            log.hidden = true
            node.append(regionHead(el('span', 'dya-eyebrow', 'Inspect'), light, tail), log)
            shut.addEventListener('click', () => {
                log.hidden = true
                arrange()
            })
            return {
                node,
                log,
                lit(tone) {
                    light.className = tone ? `dya-light dya-light--${tone}` : 'dya-light dya-light--busy'
                }
            }
        }

        /*
         * What the region beside the writing holds: the profile a new target will be while it is
         * typed, the target's last changes once it exists, and an inspection in place of either
         * while there is one. With none of them it is not there.
         */
        function arrange() {
            const probed = !probe.log.hidden
            preview.hidden = mode !== 'new'
            history.hidden = mode !== 'edit' || probed || !history.hasChildNodes()
            probe.node.hidden = !probed
            aside.hidden = preview.hidden && history.hidden && probe.node.hidden
        }

        /*
         * The sheet's state, in its head: a pill while something is under way, a word that leaves
         * on its own when it is done, and a problem under the head, where it can wrap, when not.
         */
        function note(text, kind) {
            problem.hidden = true
            state.replaceChildren()
            if (!text) return
            if (kind === 'error') {
                problem.textContent = text
                problem.hidden = false
            } else if (kind === 'busy') {
                state.append(el('span', 'dya-badge dya-badge--busy', text))
            } else {
                state.append(el('span', 'dya-key-label dya-key-label--leave', text))
            }
        }

        function libraryNote(text, kind) {
            libraryProblem.hidden = true
            libraryState.replaceChildren()
            if (!text) return
            if (kind === 'error') {
                libraryProblem.textContent = text
                libraryProblem.hidden = false
            } else if (kind === 'busy') {
                libraryState.append(el('span', 'dya-badge dya-badge--busy', text))
            } else {
                libraryState.append(el('span', 'dya-key-label dya-key-label--leave', text))
            }
        }

        /*
         * Opening the sheet takes the view it opened over: the grid is `inert` while the sheet is
         * up, so there is nothing behind to press, tab into or scroll, and the scrim says so.
         */
        function raise(next, name, source) {
            mode = next
            current = name
            raisedBy = source ?? null
            title.textContent = name ?? 'New target'
            form.node.hidden = next !== 'new'
            yaml.node.hidden = next !== 'edit'
            actions.replaceChildren(...(next === 'edit' ? [remove, inspect, save] : [inspect, save]))
            save.disabled = next === 'edit'
            inspect.disabled = busy
            landed = ''
            note('')
            history.replaceChildren()
            hush()
            confirmClose.reset()
            confirmDelete.reset()
            grid.inert = true
            scrim.hidden = false
            sheet.hidden = false
            arrange()
        }

        /*
         * An inspection's output belongs to the target it was run on, so it goes when the sheet
         * closes or turns to another target, a new one included.
         */
        function hush() {
            probe.log.textContent = ''
            probe.log.hidden = true
        }

        function drop() {
            mode = null
            current = null
            landed = ''
            confirmClose.reset()
            confirmDelete.reset()
            sheet.hidden = true
            scrim.hidden = true
            grid.inert = false
            note('')
            hush()
            if (raisedBy && raisedBy.isConnected) raisedBy.focus()
            raisedBy = null
        }

        const dirty = () => (mode === 'edit' ? yaml.value !== landed : mode === 'new' && form.filled())
        const confirmClose = arming(close, 'Discard')
        const confirmDelete = arming(remove, 'Delete')

        const leave = () => {
            if (confirmClose.armed || !dirty()) {
                confirmClose.reset()
                drop()
                return
            }
            confirmClose.arm()
        }

        close.addEventListener('click', leave)
        scrim.addEventListener('click', () => (library.hidden ? leave() : shut()))
        libraryClose.addEventListener('click', () => shut())

        function browse(source) {
            raisedBy = source ?? null
            libraryNote('')
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
                const table = el('table', 'dya-table')
                const rows = el('tbody')
                for (const shelf of catalog) rows.append(...shelfRows(shelf))
                table.append(rows)
                shelves.replaceChildren(table)
            } catch (error) {
                libraryNote(reason(error), 'error')
            }
        }

        function shelfRows(shelf) {
            const missing = shelf.profiles.filter((profile) => !profile.installed).length
            const section = el('tr', 'dya-table__section')
            const end = el('td', 'dya-table__end')
            if (missing) {
                const install = button('dya-button', 'Install')
                install.addEventListener('click', () => void put(shelf.group, install))
                end.append(install)
            } else {
                end.append(el('span', 'dya-meta', 'Installed'))
            }
            section.append(el('td', 'dya-table__fit', shelf.group), el('td'), end)
            const rows = [section]
            for (const profile of shelf.profiles) {
                const row = el('tr')
                const mark = el('td', 'dya-table__end')
                if (profile.installed && missing) mark.append(el('span', 'dya-meta', 'Installed'))
                row.append(
                    el('td', 'dya-table__name', profile.name),
                    el('td', 'dya-table__prose', profile.description),
                    mark
                )
                rows.push(row)
            }
            return rows
        }

        async function put(group, key) {
            key.disabled = true
            libraryNote('Installing', 'busy')
            try {
                await ctx.invoke('install', group)
                libraryNote('Installed')
                await Promise.all([shelve(), refreshList(), roundsView.refresh()])
            } catch (error) {
                key.disabled = false
                libraryNote(reason(error), 'error')
            }
        }

        /*
         * Deleting a target is the profile, the snapshot and the exports, because that is what a
         * target is. The first press says what comes off the disk, the second does it.
         */
        remove.addEventListener('click', () => {
            if (confirmDelete.armed) {
                confirmDelete.reset()
                void erase()
                return
            }
            if (!current) return
            const pages = corpora.get(current)?.pages
            confirmDelete.arm(pages ? `Delete ${plural(pages, 'page')}` : 'Delete')
        })

        async function erase() {
            const name = current
            if (!name) return
            note('Deleting', 'busy')
            try {
                await ctx.invoke('delete', name, true)
                landed = yaml.value
                drop()
                await Promise.all([refreshList(), roundsView.refresh()])
            } catch (error) {
                note(reason(error), 'error')
            }
        }

        /*
         * Pressing the scrim must not take the focus with it, or Escape reaches nothing. Escape
         * belongs to the panel, not to the sheet, so it closes from wherever the focus is.
         */
        scrim.addEventListener('mousedown', (event) => event.preventDefault())
        root.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            if (targets.hidden || (sheet.hidden && library.hidden)) return
            event.preventDefault()
            if (library.hidden) leave()
            else shut()
        })

        inspect.addEventListener('click', () => void inspectTarget())
        save.addEventListener('click', () => void write())

        /*
         * Targets is the place for the targets themselves: what to do first, as rows from the top
         * left (a new target, the library of shipped ones), then a card per suite with its table,
         * whose boxes pick what the header's Run sweeps. A row opens the target's editor.
         */
        let listed = []

        function actionRows() {
            const rows = el('ul', 'dya-files crw-actions')
            for (const [icon, words, act] of [
                ['add', 'New target', (source) => create(source)],
                ['book', 'Library', (source) => browse(source)]
            ]) {
                const item = el('li')
                const row = button('dya-file')
                row.innerHTML = ctx.glyph(icon)
                row.append(el('span', 'dya-file__name', words))
                row.addEventListener('click', () => act(row))
                item.append(row)
                rows.append(item)
            }
            return rows
        }

        function paintList() {
            const groups = [...new Set(listed.map((corpus) => corpus.group || ''))].sort((a, b) =>
                a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)
            )
            grid.replaceChildren(
                actionRows(),
                ...groups.map((group) =>
                    targetTable(group, listed.filter((corpus) => (corpus.group || '') === group), (corpus, row) => void open(corpus.name, row), paintList)
                )
            )
        }

        async function refreshList() {
            try {
                const [profiles, known] = await Promise.all([ctx.invoke('profiles'), ctx.invoke('state')])
                if (profiles && profiles.needsEnvironment) {
                    grid.replaceChildren(needsEnvironment(ctx))
                    return
                }
                const byName = new Map()
                for (const repo of (known && known.repositories) || []) {
                    for (const corpus of repo.corpora || []) byName.set(corpus.name, corpus)
                }
                corpora = byName
                listed = profiles.map((profile) => ({ never_crawled: true, ...byName.get(profile.name), name: profile.name, group: profile.group || byName.get(profile.name)?.group }))
                paintList()
            } catch (error) {
                grid.replaceChildren(el('p', 'dya-problem', reason(error)))
            }
        }

        function create(source) {
            raise('new', null, source)
            form.reset()
            paintPreview()
            form.focus()
        }

        async function open(name, source) {
            raise('edit', name, source)
            const ticket = ++asked
            const corpus = corpora.get(name)
            if (corpus) {
                void changesInto(history, corpus, el('span', 'dya-eyebrow', 'Changes'), () => ticket === asked && current === name).then(arrange)
            }
            try {
                yaml.value = await ctx.invoke('show', name)
                landed = yaml.value
                yaml.focus()
            } catch (error) {
                note(reason(error), 'error')
            }
        }

        function paintPreview() {
            previewCode.innerHTML = ctx.highlight(draft(form.values()), 'yaml')
        }

        async function write() {
            if (mode === 'new') {
                const values = form.values()
                if (!values.name || !values.url) {
                    note('Name and URL required', 'error')
                    return
                }
                note('Saving', 'busy')
                try {
                    await ctx.invoke('save', values.name, draft(values))
                } catch (error) {
                    note(reason(error), 'error')
                    return
                }
                await Promise.all([refreshList(), roundsView.refresh()])
                await open(values.name, raisedBy)
                note('Saved')
                return
            }
            if (!current) return
            note('Saving', 'busy')
            try {
                await ctx.invoke('save', current, yaml.value)
                landed = yaml.value
                save.disabled = true
                note('Saved')
                await Promise.all([refreshList(), roundsView.refresh()])
            } catch (error) {
                note(reason(error), 'error')
            }
        }

        async function inspectTarget() {
            const url = mode === 'new' ? form.values().url : firstUrl(yaml.value)
            if (!url) {
                note('No URL', 'error')
                return
            }
            note('')
            probing = current
            try {
                await begin('inspect', { url }, probe.log)
            } catch (error) {
                note(reason(error), 'error')
                return
            }
            inspect.disabled = true
            probe.lit('')
            arrange()
        }

        /*
         * A field that is two elements, offered as one. The textarea is as tall as its own text so it
         * never scrolls on its own and there are not two scroll positions to hold in step; the frame
         * scrolls, and the caret stays in view because it is inside the frame.
         */
        function buildYaml() {
            const node = el('div', 'dya-field crw-yaml')
            const frame = el('div', 'dya-editor')
            node.append(frame)
            const behind = el('pre', 'dya-code')
            const field = el('textarea')
            field.spellcheck = false
            field.setAttribute('aria-label', 'Profile')

            const repaint = () => {
                behind.innerHTML = ctx.highlight(`${field.value}\n`, 'yaml')
                field.style.height = `${Math.max(behind.scrollHeight, frame.clientHeight)}px`
            }

            field.addEventListener('input', () => {
                repaint()
                save.disabled = field.value === landed
                confirmClose.reset()
                if (!problem.hidden) note('')
            })
            new ResizeObserver(repaint).observe(frame)
            frame.append(behind, field)

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

        /*
         * A new target, as a form of label and value on the one grid, every row the height of a
         * control. The profile it makes is written out beside it as it is typed, and Enter in any
         * field saves it.
         */
        function buildForm() {
            const node = el('div', 'dya-form')
            node.hidden = true
            const fields = {}
            for (const [key, label, placeholder] of [
                ['name', 'Name', 'claude-docs'],
                ['url', 'URL or sitemap', 'https://example.com/sitemap.xml'],
                ['group', 'Group', 'docs-labs'],
                ['description', 'Description', 'Optional'],
            ]) {
                const input = el('input', 'dya-field')
                input.id = `crw-${key}-${crypto.randomUUID()}`
                input.placeholder = placeholder
                input.spellcheck = false
                fields[key] = input
                const name = el('label', 'dya-label', label)
                name.htmlFor = input.id
                node.append(name, input)
            }
            const snapshot = el('input', 'dya-checkbox')
            snapshot.type = 'checkbox'
            snapshot.id = `crw-track-${crypto.randomUUID()}`
            const trackLabel = el('label', 'dya-label', 'Track changes')
            trackLabel.htmlFor = snapshot.id
            const trackValue = el('div', 'dya-form__value')
            trackValue.append(snapshot)
            node.append(trackLabel, trackValue)

            node.addEventListener('input', () => {
                paintPreview()
                confirmClose.reset()
                if (!problem.hidden) note('')
            })
            node.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') {
                    event.preventDefault()
                    void write()
                }
            })

            return {
                node,
                values: () => ({
                    name: fields.name.value.trim(),
                    url: fields.url.value.trim(),
                    group: fields.group.value.trim(),
                    description: fields.description.value.trim(),
                    snapshot: snapshot.checked,
                }),
                filled: () => Object.values(fields).some((input) => input.value.trim()),
                reset() {
                    for (const input of Object.values(fields)) input.value = ''
                    snapshot.checked = true
                },
                focus: () => fields.name.focus(),
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
                create(null)
            },
            finished(report) {
                inspect.disabled = false
                if (probing !== current) return
                probe.lit(report.code === 0 ? 'success' : 'danger')
            },
        }
    }
}
