import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { BoardDraft, BoardMeta } from './types.js'

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

function root(): string {
    return join(app.getPath('userData'), 'kanban')
}

function registryPath(): string {
    return join(root(), 'boards.json')
}

export function boardRoot(slug: string): string {
    return join(root(), 'boards', assertSlug(slug))
}

export function boardPath(slug: string): string {
    return join(boardRoot(slug), 'board.json')
}

export function runsRoot(slug: string): string {
    return join(boardRoot(slug), 'runs')
}

export function assertSlug(slug: string): string {
    const value = String(slug ?? '')
    if (!SLUG.test(value)) throw new Error(`'${value}' is not a valid board slug`)
    if (RESERVED.has(value)) throw new Error(`'${value}' is a reserved device name`)
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
    if (!value) throw new Error('the board needs a project directory')
    if (!isAbsolute(value)) throw new Error(`'${value}' is not an absolute path`)
    const info = await stat(value).catch(() => null)
    if (!info?.isDirectory()) throw new Error(`'${value}' is not an existing directory`)
    return value
}

export async function writeAtomic(path: string, text: string): Promise<void> {
    const temporary = `${path}.tmp`
    await writeFile(temporary, text, 'utf-8')
    await rename(temporary, path)
}

export async function list(): Promise<BoardMeta[]> {
    try {
        const parsed = JSON.parse(await readFile(registryPath(), 'utf-8')) as unknown
        if (!Array.isArray(parsed)) return []
        return (parsed as BoardMeta[]).slice().sort((a, b) => a.order - b.order)
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
    if (!board) throw new Error(`no board '${slug}'`)
    return board
}

export async function create(draft: BoardDraft): Promise<BoardMeta> {
    const name = String(draft.name ?? '').trim()
    if (!name) throw new Error('the board needs a name')

    const slug = assertSlug(draft.slug?.trim() ? draft.slug.trim() : slugify(name))
    const workdir = await assertWorkdir(draft.workdir)

    const boards = await list()
    if (boards.some((entry) => entry.slug === slug)) throw new Error(`board '${slug}' already exists`)

    const board: BoardMeta = {
        slug,
        name,
        workdir,
        archived: false,
        createdAt: Date.now(),
        order: boards.length
    }

    await mkdir(boardRoot(slug), { recursive: true })
    await mkdir(runsRoot(slug), { recursive: true })
    await persist([...boards, board])
    return board
}

export async function update(slug: string, patch: Partial<BoardDraft>): Promise<BoardMeta> {
    const boards = await list()
    const index = boards.findIndex((entry) => entry.slug === slug)
    if (index < 0) throw new Error(`no board '${slug}'`)

    const name = patch.name === undefined ? boards[index].name : String(patch.name).trim()
    if (!name) throw new Error('the board needs a name')

    const workdir =
        patch.workdir === undefined ? boards[index].workdir : await assertWorkdir(patch.workdir)

    boards[index] = { ...boards[index], name, workdir }
    await persist(boards)
    return boards[index]
}

export async function setArchived(slug: string, archived: boolean): Promise<BoardMeta> {
    const boards = await list()
    const index = boards.findIndex((entry) => entry.slug === slug)
    if (index < 0) throw new Error(`no board '${slug}'`)

    boards[index] = { ...boards[index], archived }
    await persist(boards)
    return boards[index]
}
