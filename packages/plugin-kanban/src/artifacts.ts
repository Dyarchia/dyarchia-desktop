import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative } from 'node:path'
import { attachmentsRoot } from './boards.js'

const TRIES = 5
const WAIT_MS = 400

export interface Harvest {
    kept: string[]
    missing: string[]
}

function inside(root: string, path: string): boolean {
    const step = relative(root, path)
    return step !== '' && !step.startsWith('..') && !isAbsolute(step)
}

export async function harvest(
    slug: string,
    cardId: string,
    workspace: string,
    declared: string[]
): Promise<Harvest> {
    const kept: string[] = []
    const missing: string[] = []
    if (!declared.length) return { kept, missing }

    const target = attachmentsRoot(slug, cardId)
    await mkdir(target, { recursive: true })

    for (const entry of declared) {
        const name = String(entry ?? '').trim()
        if (!name) continue

        const source = normalize(join(workspace, name))
        if (!inside(workspace, source)) {
            missing.push(name)
            continue
        }

        const info = await stat(source).catch(() => null)
        if (!info?.isFile()) {
            missing.push(name)
            continue
        }

        const flat = name.split(/[\\/]/).filter(Boolean).join('-')
        await copyFile(source, join(target, flat))
        kept.push(flat)
    }

    return { kept, missing }
}

export function nextName(taken: Set<string>, name: string): string {
    if (!taken.has(name)) return name

    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const extension = dot > 0 ? name.slice(dot) : ''

    for (let attempt = 2; attempt < 1000; attempt += 1) {
        const candidate = `${stem}-${attempt}${extension}`
        if (!taken.has(candidate)) return candidate
    }
    return `${stem}-${Date.now()}${extension}`
}

export async function strays(root: string, keep: Set<string>): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    return entries
        .filter((entry) => entry.isDirectory() && !keep.has(entry.name))
        .map((entry) => entry.name)
}

export async function reclaim(workspace: string, root: string): Promise<boolean> {
    if (!inside(root, workspace)) return false

    for (let attempt = 0; attempt < TRIES; attempt += 1) {
        try {
            await rm(workspace, { recursive: true, force: true })
            return true
        } catch {
            await new Promise((resume) => setTimeout(resume, WAIT_MS))
        }
    }
    return false
}

