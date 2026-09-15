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
.crw-head {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-3);
    flex: none;
}
.crw-headline {
    flex: 1;
}
.crw-corpora {
    flex: none;
    max-height: 40%;
    overflow: auto;
}
.crw-bar {
    flex: none;
    flex-wrap: wrap;
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
.crw-out {
    display: flex;
    flex: 1;
    min-height: 0;
}
.crw-out > .dya-empty {
    flex: 1;
}
.crw-log {
    flex: 1;
    min-height: 60px;
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
    gap: 2px;
    flex: none;
    width: 210px;
    overflow: auto;
}
.crw-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--dya-space-2);
    min-width: 0;
}
.crw-yaml {
    flex: 1;
    min-height: 140px;
    resize: none;
    tab-size: 2;
}
/* Beside a profile the log is a footnote, not the subject: it takes the room its lines need and
   no more, so an empty one does not hold half the panel open for nothing. */
.crw-editor .crw-log {
    flex: none;
    min-height: 0;
    max-height: 32%;
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
`

function injectStyles(pluginId, css) {
    const id = `dyarchia-${pluginId}-styles`
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
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
    ctx.registerPanel({ id: 'crawlee', title: 'Crawlee', icon: ICON }, (container) =>
        mount(ctx, container)
    )
}

function mount(ctx, container) {
    const root = el('div', 'crw-root')

    const tabs = el('div', 'dya-tabs crw-tabs')
    const rounds = el('div', 'crw-view')
    const targets = el('div', 'crw-view')

    /*
     * One job at a time on the Python side, so one place for its output at a time here. The sink
     * is chosen when the job is started, by whichever view started it.
     */
    let sink = null
    let busy = false

    const views = [
        { id: 'rounds', title: 'Rounds', node: rounds },
        { id: 'targets', title: 'Targets', node: targets },
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

    root.append(tabs, rounds, targets)
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

    return () => {
        unsubscribeLine()
        unsubscribeDone()
        root.remove()
    }


    function buildRounds() {
        const head = el('div', 'crw-head')
        const headline = el('span', 'dya-value crw-headline', 'reading the corpus…')
        const refresh = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Refresh')
        head.append(el('span', 'dya-eyebrow', 'corpus'), headline, refresh)

        const table = el('table', 'dya-table')
        const wrap = el('div', 'crw-corpora')
        wrap.appendChild(table)

        const bar = el('div', 'dya-bar--inset crw-bar')
        const scope = el('select', 'dya-field dya-field--auto crw-scope')
        const scopeBox = el('span', 'dya-select')
        scopeBox.appendChild(scope)
        const commitBox = el('label', 'crw-check')
        const commit = el('input', 'dya-checkbox')
        commit.type = 'checkbox'
        commit.checked = true
        commitBox.append(commit, el('span', 'dya-key-label', 'commit'))
        const run = el('button', 'dya-button', 'Run')
        const stop = el('button', 'dya-button dya-button--danger', 'Stop')
        stop.hidden = true
        const status = el('span', 'dya-text crw-status', '')
        bar.append(el('span', 'dya-key-label', 'round'), scopeBox, commitBox, run, stop, status)

        const out = el('div', 'crw-out')
        const idle = el('div', 'dya-empty', 'nothing has run yet')
        const log = el('pre', 'dya-log crw-log')
        log.hidden = true
        out.append(idle, log)
        rounds.append(head, wrap, bar, out)

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
                headline.textContent = String(error)
            }
        }

        function render(state) {
            headline.className = 'dya-value crw-headline'
            headline.textContent = state.headline || 'no corpora'

            const corpora = (state.repositories || []).flatMap((repo) => repo.corpora || [])
            table.replaceChildren()
            const header = el('tr', 'dya-row')
            for (const label of ['target', 'group', 'pages', 'size', 'swept', 'state']) {
                header.appendChild(el('th', undefined, label))
            }
            table.appendChild(header)
            for (const corpus of corpora) {
                const row = el('tr', 'dya-row')
                row.appendChild(el('td', 'dya-mono', corpus.name))
                row.appendChild(el('td', undefined, corpus.group || '-'))
                row.appendChild(el('td', undefined, String(corpus.pages)))
                row.appendChild(el('td', undefined, bytes(corpus.bytes)))
                row.appendChild(el('td', undefined, day(corpus.swept_at)))
                row.appendChild(verdictCell(corpus))
                table.appendChild(row)
            }

            const groups = [...new Set(corpora.map((corpus) => corpus.group).filter(Boolean))]
            scope.replaceChildren()
            scope.appendChild(new Option('every target that asks for snapshots', 'all'))
            for (const group of groups) scope.appendChild(new Option(`group ${group}`, `group:${group}`))
            for (const corpus of corpora) {
                scope.appendChild(new Option(`target ${corpus.name}`, `name:${corpus.name}`))
            }
        }

        function verdictCell(corpus) {
            const [text, tone] = corpus.error
                ? ['unreadable', ' dya-badge--danger']
                : corpus.changed
                  ? [`+${corpus.added} ~${corpus.modified} -${corpus.removed}`, ' dya-badge--warning']
                  : corpus.stale
                    ? ['stale', '']
                    : ['quiet', ' dya-badge--success']
            const cell = el('td')
            const badge = el('span', `dya-badge dya-badge--soft${tone}`, text)
            badge.title = corpus.error || (corpus.stale ? 'not swept since it last moved' : '')
            cell.appendChild(badge)
            return cell
        }

        async function startRound() {
            const [kind, value] = scope.value.split(':')
            const payload = { commit: commit.checked }
            if (kind === 'group') payload.group = value
            if (kind === 'name') payload.names = [value]
            await begin('run', payload, log, status, { run, stop, idle })
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


    function buildTargets() {
        const split = el('div', 'crw-split')
        const list = el('div', 'crw-list')
        const editor = el('div', 'crw-editor')

        const bar = el('div', 'dya-bar--inset crw-bar')
        const title = el('span', 'dya-mono crw-status', 'pick a target, or add one')
        const inspect = el('button', 'dya-button dya-button--quiet dya-button--sm', 'Inspect')
        const save = el('button', 'dya-button dya-button--sm', 'Save')
        bar.append(title, inspect, save)

        const yaml = el('textarea', 'dya-field dya-mono crw-yaml')
        yaml.spellcheck = false
        const note = el('div', 'dya-text crw-note')
        const log = el('pre', 'dya-log crw-log')
        log.hidden = true

        const form = buildForm()
        editor.append(bar, form.node, yaml, note, log)
        split.append(list, editor)
        targets.appendChild(split)

        let current = null

        inspect.addEventListener('click', () => void probe())
        save.addEventListener('click', () => void write())

        async function refreshList() {
            list.replaceChildren()
            const add = el('button', 'dya-button dya-button--quiet dya-button--sm', '+ New target')
            add.addEventListener('click', () => form.open())
            list.appendChild(add)
            try {
                const profiles = await ctx.invoke('profiles')
                for (const profile of profiles) {
                    const entry = el('button', 'dya-entry', profile.name)
                    entry.dataset.name = profile.name
                    entry.title = profile.description || profile.name
                    entry.addEventListener('click', () => void open(profile.name))
                    list.appendChild(entry)
                }
                mark(current)
            } catch (error) {
                list.appendChild(el('div', 'dya-empty dya-text--danger', String(error)))
            }
        }

        async function open(name) {
            form.close()
            say('')
            try {
                yaml.value = await ctx.invoke('show', name)
                current = name
                title.textContent = name
                mark(name)
            } catch (error) {
                say(String(error), false)
            }
        }

        function mark(name) {
            for (const entry of list.querySelectorAll('[data-name]')) {
                entry.className = entry.dataset.name === name ? 'dya-entry dya-entry--active' : 'dya-entry'
            }
        }

        async function write() {
            if (!current) {
                say('nothing to save: pick a target or add one', false)
                return
            }
            say('saving…')
            try {
                say(String(await ctx.invoke('save', current, yaml.value)), true)
                await refreshList()
            } catch (error) {
                say(String(error), false)
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
                const input = el('input', 'dya-field')
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
        if (controls.idle) controls.idle.hidden = true
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
            status.textContent = String(error)
        }
    }
}
