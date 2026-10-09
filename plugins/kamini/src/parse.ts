import { basename, dirname } from 'node:path'
import { load as fromYaml } from 'js-yaml'
import { parse as fromToml } from 'smol-toml'
import { TARGETS, target } from './targets.js'
import type { FileKind, Target } from './targets.js'
import type { Agent, Hook, Note, Plugin, Server, Skill, Value } from './types.js'

type Doc = Record<string, unknown>

function split(text: string): { front: Doc; body: string } {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.replace(/^﻿/, ''))
    if (!match) return { front: {}, body: text }
    const front = fromYaml(match[1]!) as unknown
    return { front: front && typeof front === 'object' ? (front as Doc) : {}, body: match[2]!.trim() }
}

export function slug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
}

/*
 * The inverse of nesting: a value lands under the dotted key the CLI's catalogue names, and a table
 * the catalogue does not name is walked into until it does, or kept whole when it never does.
 */
function flatten(doc: Doc, known: Set<string>, prefix = ''): Record<string, Value> {
    const fields: Record<string, Value> = {}
    for (const [key, value] of Object.entries(doc)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (!known.has(path) && value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(fields, flatten(value as Doc, known, path))
        } else if (value !== undefined && value !== null) {
            fields[path] = Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : (value as Value)
        }
    }
    return fields
}

function strings(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(Object.entries(value as Doc).map(([key, each]) => [key, String(each)]))
}

function server(name: string, raw: Doc): Server {
    const kind = String(raw.type ?? raw.transport ?? (raw.url ? 'http' : 'stdio'))
    const transport = kind === 'sse' ? 'sse' : kind === 'stdio' ? 'stdio' : 'http'
    const { type: _type, transport: _transport, name: _name, command, args, env, url, headers, http_headers, ...rest } = raw
    return {
        name,
        transport,
        command: String(command ?? ''),
        args: Array.isArray(args) ? args.map(String) : [],
        env: strings(env),
        url: String(url ?? ''),
        headers: strings(headers ?? http_headers),
        fields: rest as Record<string, Value>
    }
}

function servers(value: unknown): Server[] {
    if (Array.isArray(value)) {
        return value.flatMap((entry) => {
            if (typeof entry === 'string') return []
            const doc = entry as Doc
            if (typeof doc.name === 'string') return [server(doc.name, doc)]
            return Object.entries(doc).map(([name, raw]) => server(name, raw as Doc))
        })
    }
    if (value && typeof value === 'object') return Object.entries(value as Doc).map(([name, raw]) => server(name, raw as Doc))
    return []
}

function hooks(value: unknown): Hook[] {
    if (!value || typeof value !== 'object') return []
    const list: Hook[] = []
    for (const [event, groups] of Object.entries(value as Doc)) {
        for (const group of Array.isArray(groups) ? (groups as Doc[]) : []) {
            for (const handler of Array.isArray(group.hooks) ? (group.hooks as Doc[]) : []) {
                const { type, ...fields } = handler
                list.push({ event, matcher: String(group.matcher ?? ''), type: String(type ?? 'command'), fields: fields as Record<string, Value> })
            }
        }
    }
    return list
}

export function blankAgent(id: string): Agent {
    return {
        kind: 'agent',
        id,
        name: id,
        description: '',
        prompt: '',
        main: true,
        sub: true,
        effort: '',
        tools: [],
        skills: [],
        servers: [],
        hooks: [],
        done: false,
        targets: Object.fromEntries(TARGETS.map((each) => [each.id, { on: true, scope: 'user' as const, project: '', fields: {} }]))
    }
}

export function blankSkill(id: string): Skill {
    return {
        kind: 'skill',
        id,
        name: id,
        description: '',
        body: '',
        fields: {},
        files: [],
        done: false,
        targets: Object.fromEntries(TARGETS.map((each) => [each.id, { on: true, scope: 'user' as const, project: '' }]))
    }
}

function owner(path: string): Target {
    const parts = path.replace(/\\/g, '/').split('/')
    const id = parts.includes('.grok')
        ? 'grok'
        : parts.includes('.kimi-code')
          ? 'kimi'
          : parts.includes('.gemini') || parts.includes('.agents')
            ? 'antigravity'
            : 'claude-code'
    return target(id)!
}

/*
 * Where a file was found says its scope: under the home folder it is the user's, anywhere else the
 * folder holding its CLI's dot directory is the project it belongs to.
 */
export function placeOf(path: string, home: string): { scope: 'user' | 'project'; project: string } {
    const parts = path.replace(/\\/g, '/').split('/')
    const at = parts.findIndex((part) => /^\.(claude|grok|kimi-code|agents|codex|vibe|gemini)$/.test(part))
    const root = at > 0 ? parts.slice(0, at).join('/') : ''
    const own = home.replace(/\\/g, '/').replace(/\/$/, '')
    return !root || root.toLowerCase() === own.toLowerCase() ? { scope: 'user', project: '' } : { scope: 'project', project: root }
}

/*
 * The CLIs that read the skills folder a SKILL.md was found in, so an imported skill goes back to
 * where it came from: `.agents/skills` is shared by four of them, and by Antigravity in a project.
 */
function readers(path: string, project: boolean): string[] {
    const parts = path.replace(/\\/g, '/').split('/')
    if (parts.includes('.claude')) return ['claude-code']
    if (parts.includes('.gemini')) return ['antigravity']
    if (parts.includes('.vibe')) return ['vibe']
    if (parts.includes('.kimi-code')) return ['kimi']
    if (parts.includes('.grok')) return ['grok']
    return project ? ['codex', 'vibe', 'kimi', 'grok', 'antigravity'] : ['codex', 'vibe', 'kimi', 'grok']
}

export function parseSkill(path: string, text: string, home: string, openai?: string): Skill {
    const { front, body } = split(text)
    const { name, description, ...rest } = front
    const id = slug(String(name ?? basename(path.replace(/[\\/]SKILL\.md$/i, ''))))
    const skill = blankSkill(id)
    skill.description = String(description ?? '')
    skill.body = body
    skill.fields = flatten(rest, new Set(TARGETS.flatMap((each) => each.catalogue.skill.map((field) => field.key))))
    if (openai) {
        const doc = fromYaml(openai) as Doc
        for (const [key, value] of Object.entries(flatten(doc ?? {}, new Set((target('codex')!.catalogue.skillYaml ?? []).map((field) => field.key))))) {
            skill.fields[`openai:${key}`] = value
        }
    }
    const place = placeOf(path, home)
    const on = readers(path, place.scope === 'project')
    skill.targets = Object.fromEntries(TARGETS.map((each) => [each.id, { on: on.includes(each.id), ...place }]))
    return skill
}

/*
 * An agent file from any of the six CLIs, back into Kamini's own shape: the parts every CLI shares
 * become the agent's, and what is the CLI's alone stays under that CLI, switched on. Which CLI
 * wrote it is read from where it lives and, for TOML, from the key that holds its prompt.
 */
export function parseAgent(path: string, text: string, skills: Skill[], home: string, cli?: string): Agent {
    const toml = /\.toml$/i.test(path)
    const doc: Doc = toml ? (fromToml(text) as Doc) : split(text).front
    const each = cli ? target(cli)! : toml ? target('developer_instructions' in doc || /\.config\.toml$/i.test(path) ? 'codex' : 'vibe')! : owner(path)
    const stem = basename(path).replace(/(\.config)?\.(md|toml)$/i, '')
    const id = slug(String(doc.name ?? stem))
    const agent = blankAgent(id)
    agent.targets['claude-code']!.on = false
    agent.description = String(doc.description ?? '')
    agent.prompt = toml ? String(doc.developer_instructions ?? doc.instructions ?? '') : split(text).body
    if (each.effortKey && typeof doc[each.effortKey] === 'string') agent.effort = String(doc[each.effortKey])
    const listed = each.toolsKey ? doc[each.toolsKey] : undefined
    if (Array.isArray(listed)) {
        const names = new Set(listed.map(String))
        const capabilities = Object.entries(each.capabilities).filter(([, natives]) => natives.length && natives.every((name) => names.has(name)))
        const covered = new Set(capabilities.flatMap(([, natives]) => natives))
        if (capabilities.length && covered.size === names.size) {
            agent.tools = capabilities.map(([capability]) => capability)
            delete doc[each.toolsKey!]
        }
    }
    if (Array.isArray(doc.skills)) agent.skills = (doc.skills as unknown[]).map((name) => slug(String(name))).filter((name) => skills.some((skill) => skill.id === name))
    agent.servers = servers(doc.mcpServers ?? doc.mcp_servers)
    agent.hooks = hooks(doc.hooks)
    if (each.id === 'antigravity') {
        agent.main = doc.mainAgent !== false
        agent.sub = doc.subagent !== false
    }
    if (each.id === 'vibe') {
        agent.main = doc.agent_type !== 'subagent'
        agent.sub = doc.agent_type === 'subagent'
    }
    if (each.id === 'codex' && /\.config\.toml$/i.test(path)) agent.sub = false
    const owned = new Set([
        'name', 'description', 'developer_instructions', 'instructions', 'skills', 'mcpServers', 'mcp_servers',
        'hooks', 'mainAgent', 'subagent', 'agent_type', ...(each.effortKey ? [each.effortKey] : [])
    ])
    const rest = Object.fromEntries(Object.entries(doc).filter(([key]) => !owned.has(key)))
    agent.targets[each.id] = {
        on: true,
        ...placeOf(path, home),
        fields: flatten(rest, new Set(each.catalogue.agent.map((field) => field.key)))
    }
    return agent
}

export function blankNote(kind: FileKind, id: string): Note {
    return {
        kind,
        id,
        name: id,
        description: '',
        body: '',
        fields: {},
        done: false,
        targets: Object.fromEntries(TARGETS.map((each) => [each.id, { on: Boolean(each.files[kind]), scope: 'user' as const, project: '' }]))
    }
}

export function blankPlugin(id: string): Plugin {
    return {
        kind: 'plugin',
        id,
        name: id,
        description: '',
        version: '0.1.0',
        fields: {},
        members: { agent: [], skill: [], command: [], prompt: [], rule: [] },
        servers: [],
        hooks: [],
        done: false,
        targets: Object.fromEntries(TARGETS.map((each) => [each.id, { on: Boolean(each.plugin), scope: 'project' as const, project: '' }]))
    }
}

/*
 * A command, a prompt, a memory file or a rule found on disk, for the CLI it was found under. A
 * memory file has no name of its own, so it is called after the folder that holds it.
 */
export function parseNote(kind: FileKind, path: string, text: string, cli: string, home: string): Note {
    const each = target(cli)!
    const spec = each.files[kind]
    const plain = basename(path).replace(/\.(md|toml)$/i, '')
    const folder = basename(dirname(path)).replace(/^\./, '')
    const id = slug(kind === 'memory' || plain.toUpperCase() === 'SYSTEM' ? `${folder}-${plain}` : plain) || kind
    const note = blankNote(kind, id)
    const known = new Set((spec?.fields ?? []).map((field) => field.key))
    if (/\.toml$/i.test(path)) {
        const doc = fromToml(text) as Doc
        const bodyKey = spec?.body ?? 'instructions'
        note.description = String(doc.description ?? '')
        note.body = String(doc[bodyKey] ?? '')
        const { description: _description, [bodyKey]: _body, ...rest } = doc
        note.fields = flatten(rest, known)
    } else if (spec?.format === 'plain' || kind === 'memory') {
        note.body = text.replace(/^\uFEFF/, '').trim()
    } else {
        const { front, body } = split(text)
        const { name: _name, description, ...rest } = front
        note.description = String(description ?? '')
        note.body = body
        note.fields = flatten(rest, known)
    }
    note.targets = Object.fromEntries(TARGETS.map((other) => [other.id, { on: other.id === cli, ...placeOf(path, home) }]))
    return note
}

export function parsePluginManifest(text: string, cli: string): Pick<Plugin, 'description' | 'version' | 'fields'> & { name: string } {
    const doc = JSON.parse(text.replace(/^\uFEFF/, '')) as Doc
    const { name, description, version, skills: _skills, agents: _agents, commands: _commands, mcpServers: _mcp, hooks: _hooks, ...rest } = doc
    const known = new Set(target(cli)!.catalogue.plugin.map((field) => field.key))
    return { name: String(name ?? ''), description: String(description ?? ''), version: String(version ?? ''), fields: flatten(rest, known) }
}
