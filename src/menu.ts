const GAP = 4
const EDGE = 8

export interface MenuLeaf {
    label: string
    value: string
    disabled?: boolean
    reason?: string
    selected?: boolean
}

export interface MenuRow {
    label: string
    group: string
    leaves: MenuLeaf[]
    selected?: boolean
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
    const haystack = `${row.label} ${row.group}`.toLowerCase()
    return needle
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack.includes(token))
}

export function openMenu(options: MenuOptions): () => void {
    const root = document.createElement('div')
    root.className = 'eforoi-menu'
    root.setAttribute('role', 'menu')

    const search = document.createElement('input')
    search.className = 'eforoi-menu-search'
    search.type = 'text'
    search.placeholder = options.filter ?? 'filter'
    search.spellcheck = false

    const list = document.createElement('div')
    list.className = 'eforoi-menu-list'

    root.append(search, list)
    document.body.appendChild(root)

    let submenu: HTMLElement | null = null
    let active = -1
    let rendered: { row: MenuRow; element: HTMLElement }[] = []

    const closeSubmenu = (): void => {
        submenu?.remove()
        submenu = null
    }

    const close = (): void => {
        closeSubmenu()
        root.remove()
        document.removeEventListener('mousedown', onOutside, true)
        window.removeEventListener('resize', close)
        window.removeEventListener('blur', close)
    }

    function onOutside(event: MouseEvent): void {
        const target = event.target as Node
        if (root.contains(target) || submenu?.contains(target) || options.anchor.contains(target)) return
        close()
    }

    const openSubmenu = (index: number): void => {
        closeSubmenu()
        const entry = rendered[index]
        if (!entry) return

        const panel = document.createElement('div')
        panel.className = 'eforoi-menu eforoi-submenu'
        panel.setAttribute('role', 'menu')

        for (const leaf of entry.row.leaves) {
            const item = document.createElement('button')
            item.type = 'button'
            item.className = 'eforoi-menu-item'
            item.disabled = leaf.disabled === true
            item.dataset.selected = String(leaf.selected === true)
            item.title = leaf.reason ?? ''

            const label = document.createElement('span')
            label.textContent = leaf.label
            const hint = document.createElement('span')
            hint.className = 'eforoi-menu-hint'
            hint.textContent = leaf.disabled ? 'unavailable' : ''
            item.append(label, hint)

            item.addEventListener('click', () => {
                options.onPick(entry.row, leaf)
                close()
            })
            panel.appendChild(item)
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
                const heading = document.createElement('div')
                heading.className = 'eforoi-menu-group'
                heading.textContent = group
                list.appendChild(heading)
            }

            const item = document.createElement('button')
            item.type = 'button'
            item.className = 'eforoi-menu-item'
            item.dataset.selected = String(row.selected === true)

            const label = document.createElement('span')
            label.textContent = row.label
            const arrow = document.createElement('span')
            arrow.className = 'eforoi-menu-arrow'
            arrow.textContent = '›'
            item.append(label, arrow)

            const index = rendered.length
            item.addEventListener('mouseenter', () => {
                focus(index)
                openSubmenu(index)
            })
            item.addEventListener('click', () => openSubmenu(index))
            list.appendChild(item)
            rendered.push({ row, element: item })
        }

        if (!rendered.length) {
            const empty = document.createElement('div')
            empty.className = 'eforoi-menu-empty'
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
            if (active >= 0) openSubmenu(active)
            submenu?.querySelector<HTMLButtonElement>('.eforoi-menu-item:not([disabled])')?.focus()
            return
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            closeSubmenu()
            search.focus()
        }
    })

    render()
    const spot = place(options.anchor.getBoundingClientRect(), root.getBoundingClientRect())
    root.style.left = `${spot.left}px`
    root.style.top = `${spot.top}px`
    search.focus()

    document.addEventListener('mousedown', onOutside, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)

    return close
}
