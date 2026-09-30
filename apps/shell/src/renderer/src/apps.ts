import { useEffect, useState } from 'react'
import type { PanelDescriptor } from './panels/registry'

/*
 * The order of the launcher's tiles: pinned first, in the order they were pinned, then the rest
 * by name. The pins live in the main process beside the layout, read once at start.
 */
interface AppsState {
    pinned: string[]
}

let state: AppsState = { pinned: [] }
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
    state = { pinned: strings(saved.pinned) }
    for (const listener of listeners) listener()
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

export function orderApps(panels: PanelDescriptor[]): PanelDescriptor[] {
    const rank = (id: string): number => {
        const pin = state.pinned.indexOf(id)
        return pin === -1 ? Infinity : pin
    }
    return [...panels].sort((a, b) => rank(a.id) - rank(b.id) || a.title.localeCompare(b.title))
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
