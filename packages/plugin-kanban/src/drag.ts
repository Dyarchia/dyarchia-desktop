import type { Status } from './types.js'

const THRESHOLD = 4
const EDGE = 36
const SPEED = 14

export interface DragColumn {
    status: Status
    root: HTMLElement
    scroller: HTMLElement
    list: HTMLElement
    indicator: HTMLElement
}

export interface DragHost {
    columns(): DragColumn[]
    cardAt(target: EventTarget | null): HTMLElement | null
    idOf(card: HTMLElement): string
    statusOf(card: HTMLElement): Status
    canDrop(id: string, to: Status): boolean
    commit(id: string, to: Status): void
    refuse(id: string, to: Status): void
    gesture(active: boolean): void
}

interface Bound {
    id: string
    top: number
    bottom: number
    mid: number
}

interface Measured {
    column: DragColumn
    rect: DOMRect
    bounds: Bound[]
    legal: boolean
}

export function installDrag(root: HTMLElement, host: DragHost): () => void {
    let pointer = -1
    let source: HTMLElement | null = null
    let sourceId = ''
    let sourceStatus: Status = 'triage'
    let started = false
    let originX = 0
    let originY = 0
    let pointerX = 0
    let pointerY = 0
    let ghost: HTMLElement | null = null
    let measured: Measured[] = []
    let target: Measured | null = null
    let frame = 0

    const measure = (): void => {
        measured = host.columns().map((column) => {
            const rect = column.scroller.getBoundingClientRect()
            const offset = column.scroller.scrollTop
            const bounds: Bound[] = []

            for (const node of Array.from(column.list.children)) {
                const element = node as HTMLElement
                if (!element.dataset.card) continue
                const box = element.getBoundingClientRect()
                const top = box.top - rect.top + offset
                const bottom = box.bottom - rect.top + offset
                bounds.push({ id: element.dataset.card, top, bottom, mid: (top + bottom) / 2 })
            }

            return {
                column,
                rect,
                bounds,
                legal: column.status === sourceStatus || host.canDrop(sourceId, column.status)
            }
        })
    }

    const columnAt = (x: number, y: number): Measured | null =>
        measured.find(
            (entry) =>
                x >= entry.rect.left && x <= entry.rect.right && y >= entry.rect.top && y <= entry.rect.bottom
        ) ?? null

    const placeIndicator = (entry: Measured): void => {
        const content = pointerY - entry.rect.top + entry.column.scroller.scrollTop
        const before = entry.bounds.find((bound) => content < bound.mid)
        const last = entry.bounds[entry.bounds.length - 1]
        const offset = before ? before.top : last ? last.bottom : 0

        entry.column.indicator.hidden = false
        entry.column.indicator.style.transform = `translateY(${Math.max(0, offset)}px)`
    }

    const clearIndicators = (): void => {
        for (const entry of measured) {
            entry.column.indicator.hidden = true
            delete entry.column.root.dataset.drop
        }
    }

    const paint = (): void => {
        if (ghost) ghost.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`

        const hovered = columnAt(pointerX, pointerY)
        if (hovered !== target) {
            clearIndicators()
            target = hovered
        }

        if (target) {
            target.column.root.dataset.drop = target.legal ? 'accept' : 'refuse'
            if (target.legal) placeIndicator(target)
            else target.column.indicator.hidden = true
        }
    }

    const autoscroll = (): void => {
        if (!target) return
        const { scroller } = target.column
        const above = pointerY - target.rect.top
        const below = target.rect.bottom - pointerY

        if (above < EDGE) scroller.scrollTop -= Math.ceil(((EDGE - above) / EDGE) * SPEED)
        else if (below < EDGE) scroller.scrollTop += Math.ceil(((EDGE - below) / EDGE) * SPEED)
    }

    const tick = (): void => {
        frame = requestAnimationFrame(tick)
        autoscroll()
        paint()
    }

    const begin = (): void => {
        started = true
        host.gesture(true)
        measure()

        const box = (source as HTMLElement).getBoundingClientRect()
        const copy = (source as HTMLElement).cloneNode(true) as HTMLElement
        copy.classList.add('kanban-ghost')
        copy.style.width = `${box.width}px`
        copy.style.marginLeft = `${box.left - pointerX}px`
        copy.style.marginTop = `${box.top - pointerY}px`
        document.body.appendChild(copy)
        ghost = copy

        ;(source as HTMLElement).dataset.dragging = 'true'
        root.dataset.dragging = 'true'
        frame = requestAnimationFrame(tick)
        paint()
    }

    const finish = (commit: boolean): void => {
        if (frame) cancelAnimationFrame(frame)
        frame = 0

        const landing = target
        clearIndicators()
        ghost?.remove()
        ghost = null

        if (source) delete source.dataset.dragging
        delete root.dataset.dragging

        if (started) host.gesture(false)

        if (commit && started && landing && landing.column.status !== sourceStatus) {
            if (landing.legal) host.commit(sourceId, landing.column.status)
            else host.refuse(sourceId, landing.column.status)
        }

        pointer = -1
        source = null
        started = false
        measured = []
        target = null
    }

    const onDown = (event: PointerEvent): void => {
        if (event.button !== 0 || pointer !== -1) return

        const card = host.cardAt(event.target)
        if (!card || card.dataset.locked === 'true' || card.dataset.pending === 'true') return
        if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return

        pointer = event.pointerId
        source = card
        sourceId = host.idOf(card)
        sourceStatus = host.statusOf(card)
        originX = event.clientX
        originY = event.clientY
        pointerX = event.clientX
        pointerY = event.clientY
    }

    const onMove = (event: PointerEvent): void => {
        if (event.pointerId !== pointer || !source) return

        pointerX = event.clientX
        pointerY = event.clientY

        if (started) {
            event.preventDefault()
            paint()
            return
        }

        if (Math.hypot(pointerX - originX, pointerY - originY) < THRESHOLD) return
        try {
            source.setPointerCapture(pointer)
        } catch {
            /* a pointer the browser no longer tracks still gives a usable gesture */
        }
        begin()
    }

    const onUp = (event: PointerEvent): void => {
        if (event.pointerId !== pointer) return
        finish(true)
    }

    const onCancel = (event: PointerEvent): void => {
        if (event.pointerId !== pointer) return
        finish(false)
    }

    const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || !started) return
        event.preventDefault()
        event.stopPropagation()
        target = null
        finish(false)
    }

    const onResize = (): void => {
        if (started) measure()
    }

    const observer = new ResizeObserver(onResize)
    observer.observe(root)

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)

    return () => {
        if (started) finish(false)
        observer.disconnect()
        root.removeEventListener('pointerdown', onDown)
        root.removeEventListener('pointermove', onMove)
        root.removeEventListener('pointerup', onUp)
        root.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey, true)
        window.removeEventListener('resize', onResize)
    }
}
