import type { FileKind, Kind } from './targets.js'

export type Scope = 'user' | 'project'

export type Value = string | number | boolean | string[] | Record<string, unknown>

/*
 * Where a definition goes for one CLI. A plugin has no scope: `project` is the folder its
 * package is written into.
 */
export interface Placement {
    on: boolean
    scope: Scope
    project: string
}

export interface TargetSettings extends Placement {
    fields: Record<string, Value>
}

export interface Server {
    name: string
    transport: 'stdio' | 'http' | 'sse'
    command: string
    args: string[]
    env: Record<string, string>
    url: string
    headers: Record<string, string>
    fields: Record<string, Value>
}

export interface Hook {
    event: string
    matcher: string
    type: string
    fields: Record<string, Value>
}

export interface Agent {
    kind: 'agent'
    id: string
    name: string
    description: string
    prompt: string
    main: boolean
    sub: boolean
    effort: string
    tools: string[]
    skills: string[]
    servers: Server[]
    hooks: Hook[]
    done: boolean
    targets: Record<string, TargetSettings>
}

export interface Skill {
    kind: 'skill'
    id: string
    name: string
    description: string
    body: string
    fields: Record<string, Value>
    files: string[]
    done: boolean
    targets: Record<string, Placement>
}

/*
 * A command, a prompt, a memory file or a rule: one file per CLI, a body and the fields the CLI
 * reads above it.
 */
export interface Note {
    kind: FileKind
    id: string
    name: string
    description: string
    body: string
    fields: Record<string, Value>
    done: boolean
    targets: Record<string, Placement>
}

export type Members = Record<'agent' | 'skill' | 'command' | 'prompt' | 'rule', string[]>

export interface Plugin {
    kind: 'plugin'
    id: string
    name: string
    description: string
    version: string
    fields: Record<string, Value>
    members: Members
    servers: Server[]
    hooks: Hook[]
    done: boolean
    targets: Record<string, Placement>
}

export type Definition = Agent | Skill | Note | Plugin

export interface Output {
    target: string
    path: string
    content: string
    source?: string
}

export interface Compiled {
    outputs: Output[]
    problems: string[]
    dropped: string[]
}

export interface Written {
    path: string
    state: 'written' | 'same' | 'conflict'
}

/*
 * What is made here, by kind; `done` is what the person marked finished, which the Library holds
 * while the Workbench holds the rest.
 */
export type Listing = Record<Kind, { id: string; name: string; done: boolean }[]>

/*
 * One definition a CLI already has. `scope` is where it came from: the person's home, the project
 * being looked at, or a plugin, which `plugin` then names by the folder it was installed into.
 */
export interface Found {
    kind: Kind
    name: string
    path: string
    targets: string[]
    scope: Scope | 'plugin'
    plugin?: { root: string; name: string; version: string }
}
