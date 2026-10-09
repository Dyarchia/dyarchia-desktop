import { join } from 'node:path'
import { dump } from 'js-yaml'
import { stringify as toToml } from 'smol-toml'
import { NAME, TARGETS, carries, serverFields, transportKeys } from './targets.js'
import type { FileKind, Target } from './targets.js'
import type { Agent, Compiled, Hook, Note, Output, Placement, Plugin, Server, Skill, Value } from './types.js'

type Doc = Record<string, unknown>

export type Source = (skill: Skill, file: string) => string

export interface Library {
    agent: Agent[]
    skill: Skill[]
    command: Note[]
    prompt: Note[]
    rule: Note[]
}

function empty(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === 'object') return Object.keys(value as object).length === 0
    return false
}

/*
 * A form keeps every value under its dotted key, `sandbox_workspace_write.network_access`, and a
 * file wants the table it names. Empty values are never written: a key left blank in the form is
 * the CLI's own default, not an empty string that overrides it.
 */
function nest(fields: Record<string, Value>, known?: Set<string>): Doc {
    const doc: Doc = {}
    for (const [key, value] of Object.entries(fields)) {
        if (empty(value) || (known && !known.has(key))) continue
        const parts = key.split('.')
        let at = doc
        for (const part of parts.slice(0, -1)) {
            if (typeof at[part] !== 'object' || at[part] === null || Array.isArray(at[part])) at[part] = {}
            at = at[part] as Doc
        }
        at[parts[parts.length - 1]!] = value
    }
    return doc
}

function prune(doc: Doc): Doc {
    return Object.fromEntries(Object.entries(doc).filter(([, value]) => !empty(value)))
}

function resolve(template: string | undefined, place: Placement, home: string): string | null {
    if (!template) return null
    if (template.startsWith('~/')) return place.scope === 'user' ? join(home, template.slice(2)) : null
    return place.scope === 'project' && place.project ? join(place.project, template) : null
}

function directory(kind: 'agents' | 'skills', each: Target, place: Placement, home: string): string | null {
    const dirs = each[kind]
    return place.scope === 'user' ? join(home, dirs.user.slice(2)) : place.project ? join(place.project, dirs.project) : null
}

function markdown(front: Doc, body: string): string {
    return empty(front) ? `${body.trim()}\n` : `---\n${dump(front, { lineWidth: -1 })}---\n\n${body.trim()}\n`
}

function multiline(key: string, text: string): string {
    const value = text.trim()
    return value.includes("'''") ? toToml({ [key]: value }) : `${key} = '''\n${value}\n'''\n`
}

function toml(head: Doc, long: [string, string][], rest: Doc): string {
    const parts = [empty(head) ? '' : toToml(head), ...long.filter(([, text]) => text.trim()).map(([key, text]) => multiline(key, text))]
    const tail = empty(rest) ? '' : toToml(rest)
    return [...parts.filter(Boolean), tail].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function json(doc: Doc): string {
    return `${JSON.stringify(doc, null, 4)}\n`
}

function tools(agent: Agent, each: Target): string[] | undefined {
    if (!each.toolsKey || agent.tools.length === 0) return undefined
    return [...new Set(agent.tools.flatMap((capability) => each.capabilities[capability as keyof Target['capabilities']] ?? []))]
}

function serverEntry(server: Server, each: Target): Doc | null {
    const supported = transportKeys(server.transport).some((key) => key in each.catalogue.mcpFields)
    if (!supported) return null
    const extra = nest(server.fields, new Set(serverFields(server.transport, [each]).map((field) => field.key)))
    const local = server.transport === 'stdio'
    if (each.id === 'codex') {
        return local
            ? { command: server.command, args: server.args, env: server.env, ...extra }
            : { url: server.url, http_headers: server.headers, ...extra }
    }
    if (each.id === 'vibe') {
        return local
            ? { name: server.name, transport: 'stdio', command: server.command, args: server.args, env: server.env, ...extra }
            : { name: server.name, transport: server.transport, url: server.url, headers: server.headers, ...extra }
    }
    if (each.id === 'antigravity') {
        return local
            ? { command: server.command, args: server.args, env: server.env, ...extra }
            : { serverUrl: server.url, headers: server.headers, ...extra }
    }
    return local
        ? { type: 'stdio', command: server.command, args: server.args, env: server.env, ...extra }
        : { type: server.transport, url: server.url, headers: server.headers, ...extra }
}

function hooks(list: Hook[], each: Target, dropped: string[]): Doc | undefined {
    const doc: Record<string, { matcher?: string; hooks: Doc[] }[]> = {}
    for (const hook of list) {
        const fields = each.catalogue.hookFields[hook.type]
        if (!carries(each, hook.event) || !fields || fields.length === 0) {
            dropped.push(`${hook.event} hook`)
            continue
        }
        const handler = { type: hook.type, ...nest(hook.fields, new Set(fields.map((field) => field.key))) }
        const groups = (doc[hook.event] ??= [])
        const group = groups.find((each) => (each.matcher ?? '') === hook.matcher)
        if (group) group.hooks.push(handler)
        else groups.push({ ...(hook.matcher ? { matcher: hook.matcher } : {}), hooks: [handler] })
    }
    return empty(doc) ? undefined : doc
}

function servers(list: Server[], each: Target, dropped: string[], shape: 'agent' | 'map'): unknown {
    const entries = list
        .map((server) => {
            const entry = serverEntry(server, each)
            if (!entry) dropped.push(`${server.name} server`)
            return entry ? ([server.name, prune(entry)] as const) : null
        })
        .filter((entry) => entry !== null)
    if (entries.length === 0) return undefined
    if (shape === 'map' || each.id === 'codex') {
        return Object.fromEntries(entries.map(([name, entry]) => [name, Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'name'))]))
    }
    if (each.id === 'vibe') return entries.map(([, entry]) => entry)
    return entries.map(([name, entry]) => ({ [name]: entry }))
}

function nameProblems(id: string, description: string, wantsDescription = true): string[] {
    const problems: string[] = []
    if (!NAME.test(id)) problems.push('Name: a-z, 0-9 and -, 3 to 50')
    if (wantsDescription && !description.trim()) problems.push('No description')
    return problems
}

/*
 * One agent for one CLI: the agent file, a Codex profile when it runs as the main agent there, and
 * every skill it names, written beside the CLI's other skills. What the CLI's file cannot carry is
 * listed as dropped rather than written anywhere global. `at` writes into a plugin's agents folder
 * instead of the CLI's own.
 */
export function compileAgent(agent: Agent, skills: Skill[], each: Target, home: string, source?: Source, withSkills = true, at?: string): Compiled {
    const place = agent.targets[each.id] ?? { on: true, scope: 'user', project: '', fields: {} }
    const problems = nameProblems(agent.id, agent.description)
    if (!agent.prompt.trim() && ['kimi', 'codex'].includes(each.id)) problems.push('No prompt')
    if (!agent.main && !agent.sub) problems.push('No role')
    const dropped: string[] = []
    const outputs: Output[] = []
    const dir = at ?? directory('agents', each, place, home)
    if (!dir) problems.push('No project folder')

    const known = new Set(each.catalogue.agent.map((field) => field.key))
    const native = nest(place.fields ?? {}, known)
    const common: Doc = {}
    const allowed = tools(agent, each)
    if (allowed) common[each.toolsKey!] = allowed
    else if (agent.tools.length > 0 && !each.toolsKey) dropped.push('tools')
    if (agent.effort && each.effortKey) common[each.effortKey] = agent.effort
    else if (agent.effort) dropped.push('effort')
    const named = agent.skills.map((id) => skills.find((skill) => skill.id === id)).filter((skill) => skill !== undefined)
    if (each.preload && named.length) common.skills = named.map((skill) => skill.id)
    if (agent.servers.length) {
        if (each.servers && !at) common[each.id === 'codex' || each.id === 'vibe' ? 'mcp_servers' : 'mcpServers'] = servers(agent.servers, each, dropped, 'agent')
        else dropped.push('MCP')
    }
    if (agent.hooks.length) {
        if (each.hooks && !at) common.hooks = hooks(agent.hooks, each, dropped)
        else dropped.push('hooks')
    }
    if (each.id === 'antigravity') {
        common.mainAgent = agent.main
        common.subagent = agent.sub
    }
    if (each.id === 'vibe') {
        common.agent_type = at ? 'subagent' : agent.main ? 'agent' : 'subagent'
        if (agent.main && agent.sub) dropped.push('subagent role')
    }
    const doc = prune({ ...common, ...native })

    if (dir) {
        if (each.format === 'markdown') {
            outputs.push({
                target: each.id,
                path: join(dir, `${agent.id}.md`),
                content: markdown({ name: agent.id, description: agent.description.trim(), ...doc }, agent.prompt)
            })
        } else if (each.id === 'codex') {
            if (agent.sub || at) {
                outputs.push({
                    target: each.id,
                    path: join(dir, `${agent.id}.toml`),
                    content: toml({ name: agent.id, description: agent.description.trim() }, [['developer_instructions', agent.prompt]], doc)
                })
            }
            if (agent.main && !at) {
                outputs.push({
                    target: each.id,
                    path: join(home, '.codex', `${agent.id}.config.toml`),
                    content: toml({}, [['developer_instructions', agent.prompt]], doc)
                })
            }
        } else {
            outputs.push({
                target: each.id,
                path: join(dir, `${agent.id}.toml`),
                content: toml({ description: agent.description.trim() }, [['instructions', agent.prompt]], doc)
            })
        }
    }

    for (const skill of withSkills ? named : []) {
        const compiled = compileSkill(skill, [each], place, home, source)
        outputs.push(...compiled.outputs)
        problems.push(...compiled.problems.map((problem) => `${skill.name}: ${problem}`))
    }
    return { outputs, problems, dropped }
}

/*
 * One skill into one skills folder, for every CLI that reads that folder at once: Codex, Vibe,
 * Kimi and Grok all read `~/.agents/skills`, so the file they share carries the fields any of them
 * honours, and Codex's `agents/openai.yaml` rides beside it.
 */
export function compileSkill(skill: Skill, readers: Target[], place: Placement, home: string, source?: Source, at?: string): Compiled {
    const problems = nameProblems(skill.id, skill.description)
    const dir = at ?? (readers.length ? directory('skills', readers[0]!, place, home) : null)
    if (!dir) return { outputs: [], problems: [...problems, 'No project folder'], dropped: [] }

    const known = new Set(readers.flatMap((each) => each.catalogue.skill.map((field) => field.key)))
    const front = { name: skill.id, description: skill.description.trim(), ...nest(skill.fields, known) }
    const folder = join(dir, skill.id)
    const ids = readers.map((each) => each.id).join(',')
    const outputs: Output[] = [{ target: ids, path: join(folder, 'SKILL.md'), content: markdown(front, skill.body) }]
    if (readers.some((each) => each.id === 'codex')) {
        const openai = Object.fromEntries(
            Object.entries(skill.fields)
                .filter(([key]) => key.startsWith('openai:'))
                .map(([key, value]) => [key.slice('openai:'.length), value])
        )
        const yaml = nest(openai)
        if (!empty(yaml)) outputs.push({ target: ids, path: join(folder, 'agents', 'openai.yaml'), content: dump(yaml, { lineWidth: -1 }) })
    }
    if (source) for (const file of skill.files) outputs.push({ target: ids, path: join(folder, file), content: '', source: source(skill, file) })
    return { outputs, problems, dropped: [] }
}

/*
 * A command, a prompt, a memory file or a rule, for the CLIs that read one path. A memory file is
 * the body alone; a TOML persona puts the body under its own key; everything else is frontmatter
 * and a body, carrying the fields any of the readers honours.
 */
export function compileNote(note: Note, readers: Target[], path: string): Output {
    const spec = readers[0]!.files[note.kind]!
    const known = new Set(readers.flatMap((each) => (each.files[note.kind]?.fields ?? []).map((field) => field.key)))
    const fields = nest(note.fields, known)
    const description = note.description.trim()
    const ids = readers.map((each) => each.id).join(',')
    if (spec.format === 'plain') return { target: ids, path, content: `${note.body.trim()}\n` }
    if (spec.format === 'toml') return { target: ids, path, content: toml(prune({ description }), [[spec.body ?? 'instructions', note.body]], fields) }
    const front = prune({ ...(note.kind === 'prompt' ? { name: note.id } : {}), description, ...fields })
    return { target: ids, path, content: markdown(front, note.body) }
}

function group<T>(entries: [string, T][]): Map<string, T[]> {
    const groups = new Map<string, T[]>()
    for (const [key, value] of entries) groups.set(key, [...(groups.get(key) ?? []), value])
    return groups
}

/*
 * Everything one export writes, each path once. Two CLIs that share a folder get one file compiled
 * for both rather than the second overwriting the first.
 */
export function planAgent(agent: Agent, skills: Skill[], home: string, source?: Source): Map<string, Compiled> {
    const plan = new Map<string, Compiled>()
    const shared = new Map<string, { readers: Target[]; place: Placement }>()
    for (const each of TARGETS) {
        const place = agent.targets[each.id]
        if (!place?.on) continue
        plan.set(each.id, compileAgent(agent, skills, each, home, source, false))
        const dir = directory('skills', each, place, home)
        if (!dir) continue
        const known = shared.get(dir)
        if (known) known.readers.push(each)
        else shared.set(dir, { readers: [each], place })
    }
    const named = agent.skills.map((id) => skills.find((skill) => skill.id === id)).filter((skill) => skill !== undefined)
    for (const { readers, place } of shared.values()) {
        for (const skill of named) {
            const compiled = compileSkill(skill, readers, place, home, source)
            const first = plan.get(readers[0]!.id)!
            first.outputs.push(...compiled.outputs)
            first.problems.push(...compiled.problems.map((problem) => `${skill.name}: ${problem}`))
        }
    }
    return plan
}

export function planSkill(skill: Skill, home: string, source?: Source): Map<string, Compiled> {
    const plan = new Map<string, Compiled>()
    const entries: [string, { each: Target; place: Placement }][] = []
    for (const each of TARGETS) {
        const place = skill.targets[each.id]
        if (!place?.on) continue
        const dir = directory('skills', each, place, home)
        if (!dir) plan.set(each.id, { outputs: [], problems: ['No project folder'], dropped: [] })
        else entries.push([dir, { each, place }])
    }
    for (const members of group(entries).values()) {
        const readers = members.map((member) => member.each)
        plan.set(readers[0]!.id, compileSkill(skill, readers, members[0]!.place, home, source))
        for (const each of readers.slice(1)) plan.set(each.id, { outputs: [], problems: [], dropped: [] })
    }
    return plan
}

export function planNote(note: Note, home: string): Map<string, Compiled> {
    const plan = new Map<string, Compiled>()
    const problems = nameProblems(note.id, note.description, false)
    const entries: [string, Target][] = []
    for (const each of TARGETS) {
        const place = note.targets[each.id]
        if (!place?.on) continue
        const spec = each.files[note.kind]
        if (!spec) {
            plan.set(each.id, { outputs: [], problems: [], dropped: [note.kind] })
            continue
        }
        const template = place.scope === 'user' ? spec.user : spec.project
        const path = resolve(template?.replace('{name}', note.id), place, home)
        if (!path) plan.set(each.id, { outputs: [], problems: [template ? 'No project folder' : `No ${place.scope} scope`], dropped: [] })
        else entries.push([path, each])
    }
    for (const [path, readers] of group(entries)) {
        plan.set(readers[0]!.id, { outputs: [compileNote(note, readers, path)], problems, dropped: [] })
        for (const each of readers.slice(1)) plan.set(each.id, { outputs: [], problems: [], dropped: [] })
    }
    return plan
}

/*
 * A plugin is a folder per CLI, each in that CLI's own layout: its manifest, its members compiled
 * as the CLI's files inside it, its MCP servers and hooks in the files the layout names. A member
 * the layout has no folder for is dropped, and so are hooks a CLI cannot read from a plugin.
 */
export function planPlugin(plugin: Plugin, library: Library, home: string, source?: Source): Map<string, Compiled> {
    const plan = new Map<string, Compiled>()
    for (const each of TARGETS) {
        const place = plugin.targets[each.id]
        if (!place?.on) continue
        const spec = each.plugin
        const problems = nameProblems(plugin.id, plugin.description)
        const dropped: string[] = []
        const outputs: Output[] = []
        if (!spec) {
            plan.set(each.id, { outputs, problems, dropped: ['plugins'] })
            continue
        }
        if (!place.project) {
            plan.set(each.id, { outputs, problems: [...problems, 'Folder'], dropped })
            continue
        }
        const root = join(place.project, each.id, plugin.id)
        const pick = <T extends { id: string }>(list: T[], ids: string[]): T[] => ids.map((id) => list.find((item) => item.id === id)).filter((item) => item !== undefined)
        const agents = pick(library.agent, plugin.members.agent)
        const skills = pick(library.skill, plugin.members.skill)
        const commands = pick(library.command, plugin.members.command)
        const prompts = pick(library.prompt, plugin.members.prompt)
        const rules = pick(library.rule, plugin.members.rule)
        const listed: Doc = {}

        const agentsDir = spec.agents
        if (agents.length && !agentsDir) dropped.push('agents')
        for (const agent of agentsDir ? agents : []) {
            const compiled = compileAgent(agent, library.skill, each, home, source, false, join(root, agentsDir!))
            outputs.push(...compiled.outputs)
            problems.push(...compiled.problems.map((problem) => `${agent.name}: ${problem}`))
            dropped.push(...compiled.dropped.map((word) => `${agent.name} ${word}`))
        }
        for (const skill of skills) {
            const compiled = compileSkill(skill, [each], place, home, source, join(root, spec.skills))
            outputs.push(...compiled.outputs)
            problems.push(...compiled.problems.map((problem) => `${skill.name}: ${problem}`))
        }
        const notes = (kind: FileKind, list: Note[], folder: string | undefined): void => {
            if (!list.length) return
            if (!folder) {
                dropped.push(`${kind}s`)
                return
            }
            const reader = each.files[kind] ? each : TARGETS.find((other) => other.files[kind])!
            for (const note of list) outputs.push({ ...compileNote(note, [reader], join(root, folder, `${note.id}.md`)), target: each.id })
        }
        notes('command', commands, spec.commands)
        notes('prompt', prompts, spec.prompts)
        notes('rule', rules, spec.rules)

        if (spec.listed) {
            if (skills.length) listed.skills = skills.map((skill) => `./${spec.skills}/${skill.id}`)
            if (agents.length && spec.agents) listed.agents = agents.map((agent) => `./${spec.agents}/${agent.id}.md`)
            if (commands.length && spec.commands) listed.commands = commands.map((note) => `./${spec.commands}/${note.id}.md`)
        }
        if (plugin.servers.length) {
            if (!spec.mcp) dropped.push('MCP')
            else {
                const map = servers(plugin.servers, each, dropped, 'map')
                if (map) outputs.push({ target: each.id, path: join(root, spec.mcp), content: json({ mcpServers: map }) })
            }
        }
        if (plugin.hooks.length) {
            if (!spec.hooks || each.id === 'antigravity') dropped.push('hooks')
            else {
                const doc = hooks(plugin.hooks, each, dropped)
                if (doc) outputs.push({ target: each.id, path: join(root, spec.hooks), content: json({ hooks: doc }) })
            }
        }
        const known = new Set(each.catalogue.plugin.map((field) => field.key))
        const manifest = prune({
            name: plugin.id,
            ...(plugin.version.trim() ? { version: plugin.version.trim() } : {}),
            description: plugin.description.trim(),
            ...nest(plugin.fields, known),
            ...listed
        })
        outputs.unshift({ target: each.id, path: join(root, spec.manifest), content: json(manifest) })
        plan.set(each.id, { outputs, problems, dropped })
    }
    return plan
}
