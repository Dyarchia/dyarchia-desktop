import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { BoardDraft, BoardMeta, Settings } from './types.js'
import { Refusal } from './refusal.js'

export const PER_BOARD = 1
export const GLOBAL = 2
const CAP_CEILING = 10

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/
const RESERVED = new Set([
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'com5',
    'com6',
    'com7',
    'com8',
    'com9',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
    'lpt5',
    'lpt6',
    'lpt7',
    'lpt8',
    'lpt9'
])

export function root(): string {
    return join(app.getPath('userData'), 'kanban')
}

function registryPath(): string {
    return join(root(), 'boards.json')
}

function settingsPath(): string {
    return join(root(), 'settings.json')
}

export function assertCap(value: unknown): number {
    const cap = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(cap)) throw new Refusal('a cap is a whole number of cards')
    if (cap < 0) throw new Refusal('a cap cannot be negative; 0 pauses instead')
    if (cap > CAP_CEILING) throw new Refusal(`${CAP_CEILING} at once is as high as this goes`)
    return cap
}

export async function settings(): Promise<Settings> {
    try {
        const parsed = JSON.parse(await readFile(settingsPath(), 'utf-8')) as Partial<Settings>
        return { maxRunning: assertCap(parsed?.maxRunning) }
    } catch {
        return { maxRunning: GLOBAL }
    }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = await settings()
    const next: Settings = {
        maxRunning: patch.maxRunning === undefined ? current.maxRunning : assertCap(patch.maxRunning)
    }
    await mkdir(root(), { recursive: true })
    await writeAtomic(settingsPath(), JSON.stringify(next, null, 4))
    return next
}

export function boardRoot(slug: string): string {
    return join(root(), 'boards', assertSlug(slug))
}

export function boardPath(slug: string): string {
    return join(boardRoot(slug), 'board.json')
}

export function workspacesParent(): string {
    return join(tmpdir(), 'dyarchia-kanban')
}

export function workspacesRoot(slug: string): string {
    return join(workspacesParent(), assertSlug(slug))
}

export function attachmentsRoot(slug: string, cardId: string): string {
    return join(boardRoot(slug), 'attachments', cardId)
}

export function assertSlug(slug: string): string {
    const value = String(slug ?? '')
    if (!SLUG.test(value)) throw new Refusal(`'${value}' is not a valid board slug`)
    if (RESERVED.has(value)) throw new Refusal(`'${value}' is a reserved device name`)
    return value
}

export function assertFileName(name: string): string {
    const value = String(name ?? '').trim()
    if (!value || value === '.' || value === '..') throw new Refusal('that is not a file name')
    if (/[\\/:*?"<>|]/.test(value)) throw new Refusal(`'${value}' is not a file name`)
    return value
}

export function slugify(name: string): string {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
    if (!base || !/^[a-z0-9]/.test(base)) return `board-${Date.now().toString(36)}`
    return RESERVED.has(base) ? `${base}-board` : base
}

export async function assertWorkdir(workdir: string): Promise<string> {
    const value = String(workdir ?? '').trim()
    if (!value) throw new Refusal('the board needs a project directory')
    if (!isAbsolute(value)) throw new Refusal(`'${value}' is not an absolute path`)
    const info = await stat(value).catch(() => null)
    if (!info?.isDirectory()) throw new Refusal(`'${value}' is not an existing directory`)
    return value
}

const writing = new Map<string, Promise<unknown>>()

async function replace(path: string, text: string): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
        await writeFile(temporary, text, 'utf-8')
        await rename(temporary, path)
    } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined)
        throw error
    }
}

export async function writeAtomic(path: string, text: string): Promise<void> {
    const queued = (writing.get(path) ?? Promise.resolve()).then(
        () => replace(path, text),
        () => replace(path, text)
    )
    writing.set(
        path,
        queued.catch(() => undefined)
    )
    try {
        await queued
    } finally {
        if (writing.get(path) === queued) writing.delete(path)
    }
}

export async function list(): Promise<BoardMeta[]> {
    try {
        const parsed = JSON.parse(await readFile(registryPath(), 'utf-8')) as unknown
        if (!Array.isArray(parsed)) return []
        return (parsed as BoardMeta[])
            .map((entry) => ({
                ...entry,
                maxRunning: typeof entry.maxRunning === 'number' ? entry.maxRunning : null
            }))
            .sort((a, b) => a.order - b.order)
    } catch {
        return []
    }
}

async function persist(boards: BoardMeta[]): Promise<void> {
    await mkdir(root(), { recursive: true })
    await writeAtomic(registryPath(), JSON.stringify(boards, null, 4))
}

export async function find(slug: string): Promise<BoardMeta> {
    const board = (await list()).find((entry) => entry.slug === slug)
    if (!board) throw new Refusal(`no board '${slug}'`)
    return board
}

export async function create(draft: BoardDraft): Promise<BoardMeta> {
    const name = String(draft.name ?? '').trim()
    if (!name) throw new Refusal('the board needs a name')

    const slug = assertSlug(draft.slug?.trim() ? draft.slug.trim() : slugify(name))
    const workdir = await assertWorkdir(draft.workdir)

    const boards = await list()
    if (boards.some((entry) => entry.slug === slug)) throw new Refusal(`board '${slug}' already exists`)

    const board: BoardMeta = {
        slug,
        name,
        workdir,
        archived: false,
        createdAt: Date.now(),
        order: boards.length,
        maxRunning: draft.maxRunning === undefined || draft.maxRunning === null ? null : assertCap(draft.maxRunning)
    }

    await mkdir(boardRoot(slug), { recursive: true })
    await persist([...boards, board])
    return board
}

export async function update(slug: string, patch: Partial<BoardDraft>): Promise<BoardMeta> {
    const boards = await list()
    const index = boards.findIndex((entry) => entry.slug === slug)
    if (index < 0) throw new Refusal(`no board '${slug}'`)

    const name = patch.name === undefined ? boards[index].name : String(patch.name).trim()
    if (!name) throw new Refusal('the board needs a name')

    const workdir =
        patch.workdir === undefined ? boards[index].workdir : await assertWorkdir(patch.workdir)

    const maxRunning =
        patch.maxRunning === undefined
            ? boards[index].maxRunning
            : patch.maxRunning === null
              ? null
              : assertCap(patch.maxRunning)

    boards[index] = { ...boards[index], name, workdir, maxRunning }
    await persist(boards)
    return boards[index]
}

export async function forget(slug: string): Promise<void> {
    const boards = await list()
    if (!boards.some((entry) => entry.slug === slug)) throw new Refusal(`no board '${slug}'`)
    await persist(boards.filter((entry) => entry.slug !== slug))
}

export async function setArchived(slug: string, archived: boolean): Promise<BoardMeta> {
    const boards = await list()
    const index = boards.findIndex((entry) => entry.slug === slug)
    if (index < 0) throw new Refusal(`no board '${slug}'`)

    boards[index] = { ...boards[index], archived }
    await persist(boards)
    return boards[index]
}
