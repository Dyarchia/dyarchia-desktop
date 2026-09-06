import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PanelStore, SavedPanel } from '../types.js'

const MAX_PANELS = 40

function root(): string {
    return join(app.getPath('userData'), 'eforoi')
}

export function panelsPath(): string {
    return join(root(), 'panels.json')
}

async function load(): Promise<SavedPanel[]> {
    try {
        const parsed = JSON.parse(await readFile(panelsPath(), 'utf-8')) as unknown
        return Array.isArray(parsed) ? (parsed as SavedPanel[]) : []
    } catch {
        return []
    }
}

async function persist(items: SavedPanel[]): Promise<void> {
    await mkdir(root(), { recursive: true })
    await writeFile(panelsPath(), JSON.stringify(items, null, 4), 'utf-8')
}

export async function panels(): Promise<PanelStore> {
    return { path: panelsPath(), items: await load() }
}

export async function savePanel(entry: SavedPanel): Promise<PanelStore> {
    const name = entry.name.trim()
    if (!name) throw new Error('the panel needs a name')
    if (!entry.panel.length) throw new Error('the panel is empty')

    const items = (await load()).filter((item) => item.name !== name)
    items.unshift({ ...entry, name })
    await persist(items.slice(0, MAX_PANELS))
    return panels()
}

export async function deletePanel(name: string): Promise<PanelStore> {
    await persist((await load()).filter((item) => item.name !== name))
    return panels()
}
