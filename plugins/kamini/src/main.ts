import { app, BrowserWindow, dialog } from 'electron'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'
import { planAgent, planNote, planPlugin, planSkill } from './compile.js'
import type { Library } from './compile.js'
import { expand } from './discover.js'
import { blankAgent, blankNote, blankPlugin, blankSkill, parseAgent, parseNote, parsePluginManifest, parseSkill, slug } from './parse.js'
import { KINDS, TARGETS, target } from './targets.js'
import type { Kind } from './targets.js'
import type { Compiled, Definition, Found, Listing, Plugin, Skill, Written } from './types.js'

/*
 * Kamini's own store, beside kanban's under the application's root: a folder per kind with one
 * JSON per definition, a skill being a folder that also holds the files it carries, and the
 * ledger of every file an export wrote with the hash of what it wrote. The ledger is what lets an
 * export overwrite its own work and refuse anybody else's: a file that is not in it, or that
 * changed since, is a conflict until the person says to replace it.
 */
const root = (): string => join(app.getPath('userData'), 'kamini')
const folderOf = (kind: Kind): string => join(root(), kind === 'memory' ? 'memory' : `${kind}s`)
const ledgerPath = (): string => join(root(), 'exports.json')
const statePath = (): string => join(root(), 'state.json')
const home = homedir()

const hash = (content: Buffer | string): string => createHash('sha256').update(content).digest('hex')

async function readJson<T>(path: string): Promise<T | null> {
    try {
        return JSON.parse(await readFile(path, 'utf-8')) as T
    } catch {
        return null
    }
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(value, null, 4) + '\n')
}

async function ids(kind: Kind): Promise<string[]> {
    try {
        const entries = await readdir(folderOf(kind), { withFileTypes: true })
        return kind === 'skill'
            ? entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
            : entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name.slice(0, -5))
    } catch {
        return []
    }
}

function blank(kind: Kind, id: string): Definition {
    if (kind === 'agent') return blankAgent(id)
    if (kind === 'skill') return blankSkill(id)
    if (kind === 'plugin') return blankPlugin(id)
    return blankNote(kind, id)
}

const pathOf = (kind: Kind, id: string): string => (kind === 'skill' ? join(folderOf(kind), id, 'skill.json') : join(folderOf(kind), `${id}.json`))

async function listFiles(dir: string, base = dir): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true })
        const nested = await Promise.all(
            entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name), base) : [relative(base, join(dir, entry.name)).replace(/\\/g, '/')]))
        )
        return nested.flat().sort()
    } catch {
        return []
    }
}

/*
 * A definition saved by an older Kamini lacks whatever was added since; filling it from a blank one
 * keeps every reader of the store free of optional chains.
 */
async function load(kind: Kind, id: string): Promise<Definition | null> {
    const saved = await readJson<Definition>(pathOf(kind, id))
    if (!saved) return null
    const fresh = blank(kind, id)
    const targets = Object.fromEntries(TARGETS.map((each) => [each.id, { ...fresh.targets[each.id], ...saved.targets?.[each.id] }]))
    const merged = { ...fresh, ...saved, kind: fresh.kind, id, targets } as Definition
    if (merged.kind === 'plugin') merged.members = { ...(fresh as Plugin).members, ...merged.members }
    if (merged.kind === 'skill') merged.files = await listFiles(join(folderOf('skill'), id, 'files'))
    return merged
}

async function all<K extends Kind>(kind: K): Promise<Extract<Definition, { kind: K }>[]> {
    const found = await Promise.all((await ids(kind)).map((id) => load(kind, id)))
    return found.filter((item) => item !== null) as Extract<Definition, { kind: K }>[]
}

async function free(kind: Kind, wanted: string, except?: string): Promise<string> {
    const taken = new Set((await ids(kind)).filter((id) => id !== except))
    const base = slug(wanted) || kind
    let id = base
    for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
    return id
}

/*
 * Renaming a definition renames what is kept of it, and every definition naming it follows: an
 * agent's skills, a plugin's members. A rename never leaves a reference to nothing.
 */
async function save(item: Definition, previous?: string): Promise<Definition> {
    const id = await free(item.kind, item.name, previous)
    if (previous && previous !== id) {
        if (item.kind === 'skill') await rename(join(folderOf('skill'), previous), join(folderOf('skill'), id)).catch(() => undefined)
        else await rm(pathOf(item.kind, previous), { force: true })
        if (item.kind === 'skill') {
            for (const agent of await all('agent')) {
                if (agent.skills.includes(previous)) await writeJson(pathOf('agent', agent.id), { ...agent, skills: agent.skills.map((each) => (each === previous ? id : each)) })
            }
        }
        if (item.kind !== 'plugin' && item.kind !== 'memory') {
            for (const plugin of await all('plugin')) {
                const list = plugin.members[item.kind]
                if (list.includes(previous)) {
                    await writeJson(pathOf('plugin', plugin.id), { ...plugin, members: { ...plugin.members, [item.kind]: list.map((each) => (each === previous ? id : each)) } })
                }
            }
        }
    }
    const kept: Record<string, unknown> = { ...item, id }
    if (item.kind === 'skill') delete kept.files
    await writeJson(pathOf(item.kind, id), kept)
    return (await load(item.kind, id))!
}

const source = (skill: Skill, file: string): string => join(folderOf('skill'), skill.id, 'files', file)

async function library(): Promise<Library> {
    return { agent: await all('agent'), skill: await all('skill'), command: await all('command'), prompt: await all('prompt'), rule: await all('rule') }
}

async function plan(kind: Kind, id: string): Promise<Map<string, Compiled> | null> {
    const item = await load(kind, id)
    if (!item) return null
    if (item.kind === 'agent') return planAgent(item, await all('skill'), home, source)
    if (item.kind === 'skill') return planSkill(item, home, source)
    if (item.kind === 'plugin') return planPlugin(item, await library(), home, source)
    return planNote(item, home)
}

async function onDisk(path: string): Promise<Buffer | null> {
    try {
        return await readFile(path)
    } catch {
        return null
    }
}

/*
 * Write what the plan holds for every CLI with nothing wrong in it. A path is written when it is
 * new, when the ledger says Kamini wrote what is there now, or when the person named it in
 * `replace`; anything else is reported as a conflict and left alone.
 */
async function exportAll(kind: Kind, id: string, replace: string[]): Promise<{ written: Written[]; problems: string[] }> {
    const planned = await plan(kind, id)
    if (!planned) return { written: [], problems: ['Not found'] }
    const ledger = (await readJson<Record<string, string>>(ledgerPath())) ?? {}
    const written: Written[] = []
    const problems: string[] = []
    const seen = new Set<string>()
    for (const [targetId, compiled] of planned) {
        if (compiled.problems.length) {
            problems.push(`${target(targetId)?.name ?? targetId}: ${compiled.problems.join(' - ')}`)
            continue
        }
        for (const output of compiled.outputs) {
            if (seen.has(output.path)) continue
            seen.add(output.path)
            const content = output.source ? await readFile(output.source) : Buffer.from(output.content)
            const current = await onDisk(output.path)
            if (current && current.equals(content)) {
                ledger[output.path] = hash(content)
                written.push({ path: output.path, state: 'same' })
                continue
            }
            if (current && ledger[output.path] !== hash(current) && !replace.includes(output.path)) {
                written.push({ path: output.path, state: 'conflict' })
                continue
            }
            await mkdir(dirname(output.path), { recursive: true })
            await writeFile(output.path, content)
            ledger[output.path] = hash(content)
            written.push({ path: output.path, state: 'written' })
        }
    }
    await writeJson(ledgerPath(), ledger)
    return { written, problems }
}

function window(): BrowserWindow | undefined {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function pick(options: Electron.OpenDialogOptions): Promise<string[]> {
    const owner = window()
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
}

/*
 * What the six CLIs already have, from every place each of them reads, in the person's home and
 * in the project being looked at. A folder two CLIs share is listed once with both. The paths
 * found are the only ones `read` and `adopt` will open afterwards.
 */
let known = new Map<string, Found>()

function nameOf(kind: Kind, path: string): string {
    const file = basename(path)
    if (kind === 'skill') return basename(dirname(path))
    if (kind === 'plugin') {
        const holder = dirname(path)
        return basename(/^\.[a-z]+-plugin$/.test(basename(holder)) ? dirname(holder) : holder)
    }
    if (kind === 'agent' && file === 'agent.md') return basename(dirname(path))
    if (kind === 'memory') return `${basename(dirname(path)).replace(/^\./, '')}/${file}`
    return file.replace(/\.(md|toml)$/i, '')
}

/*
 * The folder a plugin was installed into, when the path lies inside one: a marketplace cache keeps
 * one folder per version under the plugin's own, every other layout one folder per plugin.
 */
const PLUGIN = /^(.*?\/\.[^/]+(?:\/[^/]+)?\/plugins\/(?:cache\/[^/]+\/[^/]+\/([^/]+)|managed\/[^/]+|[^/]+))\//

function pluginOf(path: string): { root: string; version: string } | null {
    const match = PLUGIN.exec(path.replace(/\\/g, '/'))
    return match ? { root: match[1]!, version: match[2] ?? '' } : null
}

async function modified(path: string): Promise<number> {
    return (await stat(path).catch(() => null))?.mtimeMs ?? 0
}

async function installed(project: string): Promise<Found[]> {
    const found = new Map<string, Found>()
    const within = project ? project.replace(/\\/g, '/').toLowerCase() + '/' : null
    for (const each of TARGETS) {
        for (const [kind, pattern] of each.installed) {
            for (const path of await expand(pattern, home, project)) {
                const entry = found.get(path)
                if (entry) {
                    if (!entry.targets.includes(each.id)) entry.targets.push(each.id)
                    continue
                }
                const named = kind === 'plugin' ? String((await readJson<{ name?: unknown }>(path))?.name ?? '') : ''
                const inside = pluginOf(path)
                const scope = inside ? 'plugin' : within && path.replace(/\\/g, '/').toLowerCase().startsWith(within) ? 'project' : 'user'
                const where = kind === 'memory' ? (scope === 'project' ? relative(project, path) : `~/${relative(home, path)}`).replace(/\\/g, '/') : ''
                found.set(path, {
                    kind,
                    name: named || where || nameOf(kind, path),
                    path,
                    targets: [each.id],
                    scope,
                    ...(inside ? { plugin: { ...inside, name: basename(inside.version ? dirname(inside.root) : inside.root) } } : {})
                })
            }
        }
    }
    /*
     * A marketplace keeps every version it ever fetched; only the newest is the plugin the CLI
     * runs, so the older ones are not listed at all. A plugin is called by its manifest's name.
     */
    const newest = new Map<string, { root: string; at: number }>()
    for (const entry of found.values()) {
        if (!entry.plugin?.version) continue
        const key = dirname(entry.plugin.root)
        const at = await modified(entry.plugin.root)
        const best = newest.get(key)
        if (!best || at > best.at || (at === best.at && entry.plugin.root > best.root)) newest.set(key, { root: entry.plugin.root, at })
    }
    const titles = new Map<string, string>()
    for (const entry of found.values()) if (entry.kind === 'plugin' && entry.plugin) titles.set(entry.plugin.root, entry.name)
    const kept = [...found.values()].filter((entry) => !entry.plugin?.version || newest.get(dirname(entry.plugin.root))?.root === entry.plugin.root)
    for (const entry of kept) if (entry.plugin) entry.plugin.name = titles.get(entry.plugin.root) ?? entry.plugin.name
    known = new Map(kept.map((entry) => [entry.path, entry]))
    const order = new Map(KINDS.map((each, index) => [each.kind, index]))
    return kept.sort((a, b) => order.get(a.kind)! - order.get(b.kind)! || a.name.localeCompare(b.name))
}

async function copySkillFiles(folder: string, id: string): Promise<void> {
    for (const file of await listFiles(folder)) {
        if (file === 'SKILL.md' || file === 'agents/openai.yaml') continue
        const destination = join(folderOf('skill'), id, 'files', file)
        await mkdir(dirname(destination), { recursive: true })
        await copyFile(join(folder, file), destination)
    }
}

/*
 * Bring one definition into Kamini under a name of its own, `<name>-copy`, so exporting the copy
 * never writes over the original it came from. A plugin brings its members along, each a copy too.
 */
async function adoptFile(kind: Kind, path: string, cli: string, suffix: string): Promise<Definition | null> {
    const text = await readFile(path, 'utf-8')
    if (kind === 'skill') {
        const openai = await readFile(join(dirname(path), 'agents', 'openai.yaml'), 'utf-8').catch(() => undefined)
        const parsed = parseSkill(path, text, home, openai)
        const saved = await save({ ...parsed, name: `${parsed.id}${suffix}` })
        await copySkillFiles(dirname(path), saved.id)
        return load('skill', saved.id)
    }
    if (kind === 'agent') {
        const parsed = parseAgent(path, text, await all('skill'), home, cli)
        return save({ ...parsed, name: `${parsed.id}${suffix}` })
    }
    if (kind === 'plugin') return adoptPlugin(path, cli, suffix)
    const parsed = parseNote(kind, path, text, cli, home)
    return save({ ...parsed, name: `${parsed.id}${suffix}` })
}

async function adoptPlugin(manifest: string, cli: string, suffix: string): Promise<Definition> {
    const holder = dirname(manifest)
    const base = /^\.[a-z]+-plugin$/.test(basename(holder)) ? dirname(holder) : holder
    const head = parsePluginManifest(await readFile(manifest, 'utf-8'), cli)
    const plugin = blankPlugin(slug(head.name || basename(base)))
    const spec = target(cli)?.plugin
    const members = plugin.members
    const within = (pattern: string): string => `~/${relative(home, join(base, pattern)).replace(/\\/g, '/')}`
    const take = async (kind: 'agent' | 'skill' | 'command' | 'prompt' | 'rule', pattern: string): Promise<void> => {
        for (const path of await expand(within(pattern), home, '')) {
            const adopted = await adoptFile(kind, path, cli, suffix)
            if (adopted) members[kind].push(adopted.id)
        }
    }
    if (spec?.agents) await take('agent', `${spec.agents}/*.${target(cli)!.format === 'toml' ? 'toml' : 'md'}`)
    await take('skill', `${spec?.skills ?? 'skills'}/*/SKILL.md`)
    if (spec?.commands) await take('command', `${spec.commands}/*.md`)
    if (spec?.prompts) await take('prompt', `${spec.prompts}/*.md`)
    if (spec?.rules) await take('rule', `${spec.rules}/*.md`)
    return save({
        ...plugin,
        name: `${plugin.id}${suffix}`,
        description: head.description,
        version: head.version || plugin.version,
        fields: head.fields,
        members,
        targets: Object.fromEntries(TARGETS.map((each) => [each.id, { on: each.id === cli, scope: 'project' as const, project: '' }]))
    })
}

function kindOfFile(path: string): Kind | null {
    if (/SKILL\.md$/i.test(path)) return 'skill'
    if (/(^|[\\/])(CLAUDE|AGENTS|GEMINI|SYSTEM)\.md$/i.test(path)) return 'memory'
    if (/[\\/](commands|prompts)[\\/][^\\/]+\.md$/i.test(path)) return 'command'
    if (/[\\/](output-styles|personas)[\\/]/i.test(path)) return 'prompt'
    if (/[\\/]rules[\\/][^\\/]+\.md$/i.test(path)) return 'rule'
    if (/plugin\.json$/i.test(path)) return 'plugin'
    if (/\.(md|toml)$/i.test(path)) return 'agent'
    return null
}

function cliOf(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/')
    if (parts.includes('.codex')) return 'codex'
    if (parts.includes('.grok')) return 'grok'
    if (parts.includes('.kimi-code')) return 'kimi'
    if (parts.includes('.vibe')) return 'vibe'
    if (parts.includes('.gemini') || parts.includes('.agents')) return 'antigravity'
    return 'claude-code'
}

async function listing(): Promise<Listing> {
    const entries = await Promise.all(
        KINDS.map(async ({ kind }) => {
            const items = await all(kind)
            return [kind, items.map((item) => ({ id: item.id, name: item.name, done: item.done })).sort((a, b) => a.name.localeCompare(b.name))] as const
        })
    )
    return Object.fromEntries(entries) as Listing
}

export function activate(ctx: PluginMainContext): void {
    ctx.handle('list', listing)
    ctx.handle('home', () => home)
    ctx.handle('get', (kind, id) => load(kind as Kind, String(id)))
    ctx.handle('blank', async (kind) => blank(kind as Kind, await free(kind as Kind, kind === 'memory' ? 'memory' : `new-${String(kind)}`)))
    ctx.handle('save', (item, previous) => save(item as Definition, previous as string | undefined))
    ctx.handle('remove', async (kind, id) => {
        await rm(kind === 'skill' ? join(folderOf('skill'), String(id)) : pathOf(kind as Kind, String(id)), { recursive: true, force: true })
        return listing()
    })
    ctx.handle('plan', async (kind, id) => {
        const planned = await plan(kind as Kind, String(id))
        return planned ? [...planned.entries()] : []
    })
    ctx.handle('export', (kind, id, replace) => exportAll(kind as Kind, String(id), (replace as string[] | undefined) ?? []))
    ctx.handle('folder', async () => (await pick({ properties: ['openDirectory', 'createDirectory'] }))[0] ?? null)
    ctx.handle('import', async () => {
        const paths = await pick({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Definitions', extensions: ['md', 'toml', 'json'] }] })
        const ordered = [...paths].sort((a, b) => Number(/SKILL\.md$/i.test(b)) - Number(/SKILL\.md$/i.test(a)))
        for (const path of ordered) {
            const kind = kindOfFile(path)
            if (kind) await adoptFile(kind, path, cliOf(path), '').catch(() => null)
        }
        return paths.length ? listing() : null
    })
    ctx.handle('installed', (project) => installed(String(project ?? '')))
    ctx.handle('read', async (path) => (known.has(String(path)) ? readFile(String(path), 'utf-8').catch(() => '') : ''))
    ctx.handle('adopt', async (path) => {
        const found = known.get(String(path))
        return found ? adoptFile(found.kind, found.path, found.targets[0]!, '-copy') : null
    })
    ctx.handle('state', async (patch) => {
        const state = (await readJson<Record<string, unknown>>(statePath())) ?? {}
        if (patch && typeof patch === 'object') {
            Object.assign(state, patch)
            await writeJson(statePath(), state)
        }
        return state
    })
    ctx.handle('skillFolder', (id) => join(folderOf('skill'), String(id), 'files'))
    ctx.handle('addFiles', async (id) => {
        const paths = await pick({ properties: ['openFile', 'multiSelections'] })
        const folder = join(folderOf('skill'), String(id), 'files')
        await mkdir(folder, { recursive: true })
        for (const path of paths) await copyFile(path, join(folder, basename(path)))
        return load('skill', String(id))
    })
    ctx.handle('removeFile', async (id, file) => {
        const folder = join(folderOf('skill'), String(id), 'files')
        const path = join(folder, String(file))
        if (!relative(folder, path).startsWith('..')) await rm(path, { force: true })
        return load('skill', String(id))
    })
}
