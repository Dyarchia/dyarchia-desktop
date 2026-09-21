/*
 * The panel. Plain DOM and no build step: the shell serves this file as it is written, and the
 * only thing it needs from the SDK is a style tag, which is six lines and is inlined below rather
 * than imported. A plugin that cannot be read without first being compiled is harder to trust.
 */

const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/></svg>'

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
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
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
        font-family: var(--dya-font-mono);
        font-size: var(--dya-size-label-sm);
        letter-spacing: var(--dya-tracking-label);
        text-transform: uppercase;
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
 * The rule on this bar divides it from whatever is above it, and in the search view there is
 * nothing above it but the tab strip, which draws its own. Two rules twelve pixels apart with a
 * gap of background between them is not two boundaries; it is one boundary drawn twice.
 */
.crw-view > .crw-bar:first-child {
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
.crw-split {
    display: flex;
    flex: 1;
    gap: var(--dya-space-4);
    min-height: 0;
}
.crw-list {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    flex: none;
    width: 210px;
    overflow: auto;
}
.crw-list > .dya-button {
    align-self: flex-start;
    margin-bottom: var(--dya-space-1);
}
.crw-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--dya-space-2);
    min-width: 0;
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
/*
 * With nothing picked there is no profile to edit and nothing for the bar to act on, so the
 * column is empty and the list is the whole view. The bar comes back with the target.
 */
.crw-editor[data-empty='true'] > .crw-bar {
    display: none;
}
/* Beside a profile the console starts shorter: the subject of that view is the target being
   written, and the output of a probe is a footnote to it. It resizes like the other one. */
.crw-editor .crw-out {
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
.crw-hit-in,
.crw-hit-where {
    font-size: var(--dya-size-mono-xs);
    color: var(--dya-text-4);
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
.crw-hit-at {
    color: var(--dya-text-4);
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

function day(iso) {
    return iso ? String(iso).slice(0, 10) : '-'
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
    let busy = false

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
        sink.textContent += `${String(text)}\n`
        if (atBottom) sink.scrollTop = sink.scrollHeight
    })

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
        const refresh = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Refresh')
        head.append(el('span', 'dya-eyebrow', 'corpus'), headline, refresh)

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
        bar.append(scopeGroup, actionGroup, status)

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
                table.replaceChildren()
                return
            }

            headline.textContent = state.headline || 'no corpora'

            const corpora = (state.repositories || []).flatMap((repo) => repo.corpora || [])
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
                row.append(
                    el('td', 'dya-mono', corpus.name),
                    el('td', undefined, corpus.group || '-'),
                    el('td', 'dya-table__num', String(corpus.pages)),
                    el('td', 'dya-table__num', bytes(corpus.bytes)),
                    el('td', undefined, day(corpus.swept_at)),
                    verdictCell(corpus)
                )
                row.querySelectorAll('td').forEach((cell, column) => {
                    cell.dataset.label = labels[column] ?? ''
                })
                body.appendChild(row)
            }
            table.append(thead, body)

            const groups = [...new Set(corpora.map((corpus) => corpus.group).filter(Boolean))]
            scope.replaceChildren()
            scope.appendChild(new Option('all targets', 'all'))
            for (const group of groups) scope.appendChild(new Option(group, `group:${group}`))
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

            if (corpus.error) {
                const badge = el('span', 'dya-badge dya-badge--soft dya-badge--danger', 'unreadable')
                badge.title = corpus.error
                cell.appendChild(badge)
                return cell
            }

            if (!corpus.changed) {
                const [text, tone] = corpus.stale ? ['stale', ''] : ['quiet', ' dya-badge--success']
                const badge = el('span', `dya-badge dya-badge--soft${tone}`, text)
                if (corpus.stale) badge.title = 'not swept since it last moved'
                cell.appendChild(badge)
                return cell
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
            cell.appendChild(pills)
            return cell
        }

        async function startRound() {
            const [kind, value] = scope.value.split(':')
            const payload = { commit: commit.checked }
            if (kind === 'group') payload.group = value
            if (kind === 'name') payload.names = [value]
            await begin('run', payload, log, status, { run, stop })
        }

        return {
            refresh: refreshState,
            finished(report) {
                stop.hidden = true
                run.disabled = false
                status.className = `dya-text crw-status ${report.code === 1 ? 'dya-text--danger' : ''}`
                status.textContent = report.digest
                    ? `${report.verdict}. Digest at ${report.digest}`
                    : report.verdict
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
            actions.append(el('span', 'dya-key-label crw-hit-at', `line ${hit.line}`))
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
                if (hit.heading) head.append(el('span', 'dya-mono crw-hit-in', hit.heading))
                head.append(el('span', 'dya-mono crw-hit-where', `${hit.repository} / ${hit.target}`))
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
        const split = el('div', 'crw-split')
        const list = el('div', 'crw-list')
        const editor = el('div', 'crw-editor')

        /*
         * Nothing is picked yet, so there is nothing to inspect, nothing to save and no profile to
         * edit. The bar used to carry two live buttons that answered with a sentence saying they
         * had nothing to work on, above an empty box holding four fifths of the panel open — the
         * same void the round output grew out of. The editor exists once a target does.
         */
        const bar = el('div', 'dya-bar dya-bar--inset crw-bar')
        const title = el('span', 'dya-mono crw-status')
        const inspect = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Inspect')
        const save = el('button', 'dya-button dya-button--sm', 'Save')
        bar.append(title, inspect, save)

        const yaml = buildYaml()
        const note = el('div', 'dya-text crw-note')
        const output = buildConsole('crawlee.console.targets')
        const log = output.log

        const form = buildForm()
        editor.append(bar, form.node, yaml.node, note, output.node)
        split.append(list, editor)
        targets.appendChild(split)

        let current = null

        function picked(name) {
            current = name
            title.textContent = name ?? ''
            yaml.node.hidden = name === null
            editor.dataset.empty = String(name === null)
        }

        picked(null)

        inspect.addEventListener('click', () => void probe())
        save.addEventListener('click', () => void write())

        async function refreshList() {
            list.replaceChildren()
            const add = el('button', 'dya-button dya-button--quiet dya-button--sm', '+ New target')
            add.addEventListener('click', () => form.open())
            list.appendChild(add)
            try {
                const profiles = await ctx.invoke('profiles')
                if (profiles && profiles.needsEnvironment) {
                    list.appendChild(
                        el(
                            'div',
                            'dya-empty dya-empty--inline',
                            'needs its Python environment — turn this plugin on in Setup'
                        )
                    )
                    return
                }
                for (const profile of profiles) {
                    const entry = el('button', 'dya-entry', profile.name)
                    entry.dataset.name = profile.name
                    entry.title = profile.description || profile.name
                    entry.addEventListener('click', () => void open(profile.name))
                    list.appendChild(entry)
                }
                mark(current)
            } catch (error) {
                list.appendChild(el('div', 'dya-empty dya-text--danger', reason(error)))
            }
        }

        async function open(name) {
            form.close()
            say('')
            try {
                yaml.value = await ctx.invoke('show', name)
                picked(name)
                mark(name)
            } catch (error) {
                say(reason(error), false)
            }
        }

        function mark(name) {
            for (const entry of list.querySelectorAll('[data-name]')) {
                entry.className = entry.dataset.name === name ? 'dya-entry dya-entry--active' : 'dya-entry'
            }
        }

        async function write() {
            if (!current) return
            say('saving…')
            try {
                say(String(await ctx.invoke('save', current, yaml.value)), true)
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
                current = name
                title.textContent = name
                mark(name)
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
        into.textContent = ''
        into.hidden = false
        controls.run.disabled = true
        if (controls.stop) controls.stop.hidden = false
        status.className = 'dya-text crw-status'
        try {
            status.textContent = `running ${String(await ctx.invoke('start', kind, payload))}`
        } catch (error) {
            busy = false
            controls.run.disabled = false
            if (controls.stop) controls.stop.hidden = true
            status.className = 'dya-text crw-status dya-text--danger'
            status.textContent = reason(error)
        }
    }
}
