import { useEffect, useState } from 'react'
import type { PanelDescriptor } from './panels/registry'

/*
 * The order of the launcher's tiles: pinned first, in the order they were pinned, then most
 * recently opened, then the rest in manifest order. It lives in the main process beside the
 * layout, so it survives an update and belongs to the one root, and it is read once at start.
 */
interface AppsState {
    pinned: string[]
    recent: string[]
}

const RECENT_LIMIT = 24

let state: AppsState = { pinned: [], recent: [] }
let saveTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function changed(): void {
    for (const listener of listeners) listener()
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void window.dyarchia?.invoke('shell:launcher:save', state), 300)
}

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export async function loadApps(): Promise<void> {
    const saved = (await window.dyarchia?.invoke('shell:launcher:load').catch(() => null)) as
        | Partial<AppsState>
        | null
        | undefined
    if (!saved) return
    state = { pinned: strings(saved.pinned), recent: strings(saved.recent) }
    for (const listener of listeners) listener()
}

export function touchApp(id: string): void {
    if (state.recent[0] === id) return
    state = { ...state, recent: [id, ...state.recent.filter((other) => other !== id)].slice(0, RECENT_LIMIT) }
    changed()
}

export function togglePin(id: string): void {
    const pinned = state.pinned.includes(id)
        ? state.pinned.filter((other) => other !== id)
        : [...state.pinned, id]
    state = { ...state, pinned }
    changed()
}

export function isPinned(id: string): boolean {
    return state.pinned.includes(id)
}

function byToolbar(a: PanelDescriptor, b: PanelDescriptor): number {
    return (a.toolbar ?? Infinity) - (b.toolbar ?? Infinity) || a.title.localeCompare(b.title)
}

export function orderApps(panels: PanelDescriptor[]): PanelDescriptor[] {
    const rank = (id: string): number => {
        const pin = state.pinned.indexOf(id)
        if (pin !== -1) return pin
        const recent = state.recent.indexOf(id)
        if (recent !== -1) return 1000 + recent
        return Infinity
    }
    return [...panels].sort((a, b) => rank(a.id) - rank(b.id) || byToolbar(a, b))
}

export function useApps(): AppsState {
    const [current, setCurrent] = useState(state)
    useEffect(() => {
        const listener = (): void => setCurrent(state)
        listeners.add(listener)
        setCurrent(state)
        return () => {
            listeners.delete(listener)
        }
    }, [])
    return current
}
