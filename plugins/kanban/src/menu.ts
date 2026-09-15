const GAP = 4
const EDGE = 8
const FILTER_FROM = 9

export interface MenuLeaf {
    label: string
    value: string
    disabled?: boolean
    reason?: string
    selected?: boolean
}

export interface MenuRow {
    key: string
    label: string
    group: string
    leaves: MenuLeaf[]
    selected?: boolean
    tier?: string
    note?: string
    direct?: boolean
}

export interface MenuOptions {
    anchor: HTMLElement
    rows: MenuRow[]
    filter?: string
    onPick(row: MenuRow, leaf: MenuLeaf): void
}

interface Placement {
    left: number
    top: number
}

function place(anchor: DOMRect, size: DOMRect): Placement {
    const below = window.innerHeight - anchor.bottom - EDGE
    const above = anchor.top - EDGE

    const top =
        size.height <= below || below >= above
            ? Math.min(anchor.bottom + GAP, window.innerHeight - size.height - EDGE)
            : Math.max(anchor.top - size.height - GAP, EDGE)

    const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - size.width - EDGE))
    return { left, top: Math.max(EDGE, top) }
}

function placeSide(anchor: DOMRect, size: DOMRect): Placement {
    const right = window.innerWidth - anchor.right - EDGE
    const left =
        size.width <= right || right >= anchor.left - EDGE
            ? anchor.right + GAP
            : anchor.left - size.width - GAP

    const top = Math.max(EDGE, Math.min(anchor.top, window.innerHeight - size.height - EDGE))
    return { left: Math.max(EDGE, left), top }
}

function matches(row: MenuRow, needle: string): boolean {
    if (!needle) return true
    const haystack = `${row.label} ${row.group} ${row.note ?? ''}`.toLowerCase()
    return needle
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack.includes(token))
}

export interface Surface {
    root: HTMLElement
    place(): void
    close(): void
}

/*
 * One floating surface under the anchor, on the overlay elevation, closed by a click outside,
 * a resize or the window losing focus. The picker and the health popover both sit on it; the
 * caller fills it and asks for placement once the content has a size.
 */
export function openSurface(anchor: HTMLElement, className: string, within?: (target: Node) => boolean): Surface {
    const root = document.createElement('div')
    root.className = `dya-menu kanban-menu ${className}`.trim()
    document.body.appendChild(root)

    const close = (): void => {
        root.remove()
        document.removeEventListener('mousedown', onOutside, true)
        window.removeEventListener('resize', close)
        window.removeEventListener('blur', close)
    }

    function onOutside(event: MouseEvent): void {
        const target = event.target as Node
        if (root.contains(target) || anchor.contains(target) || within?.(target)) return
        close()
    }

    const placeIt = (): void => {
        const spot = place(anchor.getBoundingClientRect(), root.getBoundingClientRect())
        root.style.left = `${spot.left}px`
        root.style.top = `${spot.top}px`
    }

    document.addEventListener('mousedown', onOutside, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)

    return { root, place: placeIt, close }
}

function item(label: string, note?: string): { button: HTMLButtonElement; text: HTMLElement } {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dya-menu__item kanban-menu-item'

    const text = document.createElement('span')
    text.className = 'kanban-menu-text'
    const name = document.createElement('span')
    name.className = 'kanban-menu-label'
    name.textContent = label
    text.appendChild(name)
    if (note) {
        const hint = document.createElement('span')
        hint.className = 'kanban-menu-note'
        hint.textContent = note
        text.appendChild(hint)
    }
    button.appendChild(text)
    return { button, text }
}

/*
 * A picker: rows grouped under headings, a filter field once the list is long enough to
 * need one, arrow keys between rows, a side panel for a row with more than one leaf.
 * Labels wrap rather than truncate; a note sits under its label in sentence case.
 */
export function openMenu(options: MenuOptions): () => void {
    let submenu: HTMLElement | null = null
    const surface = openSurface(options.anchor, '', (target) => submenu?.contains(target) === true)
    const root = surface.root
    root.setAttribute('role', 'menu')
    root.tabIndex = -1

    const search = document.createElement('input')
    search.className = 'dya-field dya-field--sm kanban-menu-search'
    search.type = 'text'
    search.placeholder = options.filter ?? 'filter'
    search.spellcheck = false
    search.hidden = options.rows.length < FILTER_FROM

    const list = document.createElement('div')
    list.className = 'kanban-menu-list'

    root.append(search, list)

    let active = -1
    let rendered: { row: MenuRow; element: HTMLElement }[] = []

    const closeSubmenu = (): void => {
        submenu?.remove()
        submenu = null
    }

    const close = (): void => {
        closeSubmenu()
        surface.close()
    }

    const openSubmenu = (index: number): void => {
        closeSubmenu()
        const entry = rendered[index]
        if (!entry) return

        const panel = document.createElement('div')
        panel.className = 'dya-menu kanban-menu kanban-submenu'
        panel.setAttribute('role', 'menu')

        for (const leaf of entry.row.leaves) {
            const { button } = item(leaf.label, leaf.disabled ? (leaf.reason ?? 'unavailable') : undefined)
            button.disabled = leaf.disabled === true
            button.classList.toggle('dya-menu__item--selected', leaf.selected === true)
            button.addEventListener('click', () => {
                options.onPick(entry.row, leaf)
                close()
            })
            panel.appendChild(button)
        }

        document.body.appendChild(panel)
        const spot = placeSide(entry.element.getBoundingClientRect(), panel.getBoundingClientRect())
        panel.style.left = `${spot.left}px`
        panel.style.top = `${spot.top}px`
        submenu = panel
    }

    const focus = (index: number): void => {
        active = index
        for (const [position, entry] of rendered.entries()) {
            entry.element.dataset.active = String(position === index)
        }
        rendered[index]?.element.scrollIntoView({ block: 'nearest' })
    }

    const render = (): void => {
        list.replaceChildren()
        closeSubmenu()
        rendered = []

        const visible = options.rows.filter((row) => matches(row, search.value))
        let group = ''

        for (const row of visible) {
            if (row.group !== group) {
                group = row.group
                if (group) {
                    const heading = document.createElement('div')
                    heading.className = 'dya-label kanban-menu-group'
                    heading.textContent = group
                    list.appendChild(heading)
                }
            }

            const { button } = item(row.label, row.note)
            button.classList.toggle('dya-menu__item--selected', row.selected === true)

            if (row.tier) {
                const tier = document.createElement('span')
                tier.className = 'dya-badge dya-badge--soft kanban-tier'
                tier.textContent = row.tier
                button.appendChild(tier)
            }

            if (!row.direct) {
                const arrow = document.createElement('span')
                arrow.className = 'kanban-menu-arrow'
                arrow.textContent = '›'
                button.appendChild(arrow)
            }

            const index = rendered.length
            button.addEventListener('mouseenter', () => {
                focus(index)
                if (!row.direct) openSubmenu(index)
            })
            button.addEventListener('click', () => {
                if (!row.direct) {
                    openSubmenu(index)
                    return
                }
                options.onPick(row, row.leaves[0])
                close()
            })
            list.appendChild(button)
            rendered.push({ row, element: button })
        }

        if (!rendered.length) {
            const empty = document.createElement('div')
            empty.className = 'dya-empty kanban-menu-empty'
            empty.textContent = 'no match'
            list.appendChild(empty)
        }
    }

    search.addEventListener('input', render)
    root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation()
            close()
            options.anchor.focus()
            return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            const next = (active + step + rendered.length) % Math.max(rendered.length, 1)
            focus(next)
            return
        }
        if (event.key === 'ArrowRight' || event.key === 'Enter') {
            event.preventDefault()
            const current = rendered[active]?.row
            if (current?.direct) {
                options.onPick(current, current.leaves[0])
                close()
                return
            }
            if (active >= 0) openSubmenu(active)
            submenu?.querySelector<HTMLButtonElement>('.kanban-menu-item:not([disabled])')?.focus()
            return
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            closeSubmenu()
            if (!search.hidden) search.focus()
        }
    })

    render()
    surface.place()
    if (search.hidden) {
        focus(Math.max(0, options.rows.findIndex((row) => row.selected)))
        root.focus()
    } else {
        search.focus()
    }

    return close
}
