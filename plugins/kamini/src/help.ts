import { CAPABILITIES, TARGETS, fieldsOf, hookEvents, hookFields, hookTypes, serverFields, TRANSPORTS } from './targets.js'
import type { Capability, Field, Kind, Target } from './targets.js'

/*
 * What each part of Kamini does, for the help sheet: Kamini's own words for the fields every
 * CLI shares, and each CLI's own documentation for the fields that are its alone, with the link
 * that states it. A help line is one sentence; the link is where the rest is.
 */
export interface Line {
    key: string
    note: string
    who?: string
    fallback?: string
    url?: string
}

export interface Section {
    title: string
    lines: Line[]
}

const OWN: Record<string, string> = {
    Name: 'The file and command name: lowercase letters, digits and hyphens, 3 to 50.',
    Description: 'What it is for. Agents and skills are chosen by it, so say when to use it.',
    Role: 'Main runs the whole session as this agent; Subagent is one another agent calls.',
    Effort: 'How hard the model reasons, written where the CLI has such a setting.',
    Version: 'The plugin version its manifest carries.',
    Event: 'When the hook runs. Each CLI fires its own set; the head says which carry it.',
    Matcher: 'Which tool or source the event must match; empty matches all.',
    Type: 'What runs: a command, an HTTP call, an MCP tool, a prompt or an agent.',
    Transport: 'How the server is reached: stdio starts a process, http and sse call a URL.',
    Command: 'The program that starts the server.',
    Args: 'One argument to a line.',
    Env: 'One KEY=value to a line, set for the server only.',
    URL: 'Where the server listens.',
    Headers: 'One Name: value to a line, sent with every request.',
    Scope: 'User writes to your home, for every project; Project writes inside one folder.',
    Prompt: 'The system prompt, in Markdown. It replaces the CLI\'s own prompt while this agent runs.',
    Body: 'The text itself, in Markdown: what the CLI reads when it loads this.',
    Folder: 'Where the plugin is written: one folder, holding a tree per CLI in that CLI\'s layout.'
}

const DOES: Record<Capability, string> = {
    read: 'Open files and read them.',
    write: 'Create files, or write a whole file anew.',
    edit: 'Change part of a file in place.',
    search: 'Find files by name and lines by what they say.',
    shell: 'Run commands: builds, tests, git, any program installed.',
    fetch: 'Download a page from a URL and read it.',
    web: 'Ask a search engine and read what it finds.',
    agents: 'Hand a task to a subagent and take back its answer.',
    plan: 'Keep a list of the steps of a task and tick them off as they are done.',
    ask: 'Stop and ask you a question before going on.',
    skills: 'Load a skill when the task matches its description.'
}

const INTRO: Record<string, string> = {
    Agent: 'Who the agent is: its name, what it is for, whether it runs the session or is called by another, and its system prompt.',
    Prompt: 'A system prompt or persona the CLI can run with in place of its own.',
    Tools: 'What the agent may do. Nothing ticked leaves it every tool its CLI has; a tick limits it to what is ticked.',
    Skills: 'Skills the agent loads when it starts, for the CLIs that can preload them.',
    Hooks: 'Commands that run on the CLI\'s events while this agent is active.',
    MCP: 'MCP servers this agent connects to, written into its own file where the CLI allows it.',
    CLIs: 'Which CLIs receive it, in your home or in a project, and inside each CLI every field only that CLI reads.',
    Output: 'Exactly what Export writes, file by file. Written is new or Kamini\'s own; Same is unchanged; Not ours was written by someone else and needs Replace.',
    Skill: 'A skill is a folder with SKILL.md: instructions a CLI loads when the description matches.',
    Files: 'Scripts, references and assets that travel beside SKILL.md.',
    Command: 'A slash command: the body is the prompt sent when it runs.',
    Memory: 'Instructions the CLI reads in every session: CLAUDE.md for Claude Code, AGENTS.md for the rest.',
    Rule: 'An instruction file the CLI loads always, or when its paths or trigger match.',
    Plugin: 'A package of agents, skills, commands, MCP servers and hooks, laid out for each CLI.',
    Members: 'What the plugin carries, from what is already made here.',
    Workbench: 'What is being made here, kept in ~/.dyarchia/kamini. Done moves a definition to the Library; nothing reaches a CLI until Export.',
    Library: 'What was marked done. It can still be edited and exported; Reopen sends it back to the Workbench.',
    Installed: 'What each CLI already has, read from where it keeps it. Copy brings one here under another name, so its original is never overwritten.'
}

function line(field: Field, who?: string): Line {
    return {
        key: field.key.replace(/^openai:/, 'openai.yaml '),
        note: field.note ?? '',
        ...(who ? { who } : {}),
        ...(field.default !== undefined ? { fallback: String(field.default) } : {}),
        ...(field.url ? { url: field.url } : {})
    }
}

function own(...keys: string[]): Section {
    return { title: 'Kamini', lines: keys.map((key) => ({ key, note: OWN[key] ?? '' })) }
}

function perCli(fields: (each: Target) => Field[], on: (each: Target) => boolean): Section[] {
    return TARGETS.filter(on).flatMap((each) => {
        const list = fields(each)
        return list.length ? [{ title: each.name, lines: list.map((field) => line(field)) }] : []
    })
}

export function intro(tab: string): string {
    return INTRO[tab] ?? ''
}

export function sections(kind: Kind, tab: string, on: (each: Target) => boolean): Section[] {
    if (tab === 'Agent') return [own('Name', 'Description', 'Role', 'Effort', 'Prompt')]
    if (tab === 'Tools') {
        return [
            {
                title: 'Tools',
                lines: CAPABILITIES.map(([capability, words]) => ({
                    key: words,
                    note: DOES[capability],
                    who: TARGETS.flatMap((each) => {
                        const native = each.capabilities[capability] ?? []
                        return native.length ? [`${each.name} ${native.join(', ')}`] : []
                    }).join(' - ')
                }))
            }
        ]
    }
    if (tab === 'Hooks') {
        return [
            own('Event', 'Matcher', 'Type'),
            {
                title: 'Events',
                lines: hookEvents().map((event) => ({
                    key: event.name,
                    note: event.note ?? '',
                    who: TARGETS.filter((each) => each.catalogue.events.some((known) => known.name === event.name)).map((each) => each.name).join(', '),
                    ...(event.url ? { url: event.url } : {})
                }))
            },
            ...hookTypes().map((type) => ({ title: type, lines: hookFields(type).map((field) => line(field)) }))
        ]
    }
    if (tab === 'MCP') {
        return [
            own('Name', 'Transport', 'Command', 'Args', 'Env', 'URL', 'Headers'),
            ...TRANSPORTS.flatMap((transport) => perCli((each) => serverFields(transport, [each]), on).map((section) => ({ ...section, title: `${section.title} - ${transport}` })))
        ]
    }
    if (tab === 'CLIs') {
        return [own(kind === 'plugin' ? 'Folder' : 'Scope'), ...perCli((each) => fieldsOf(kind, each), on)]
    }
    if (tab === 'Skill' || tab === 'Command' || tab === 'Prompt' || tab === 'Rule') return [own('Name', 'Description', 'Body')]
    if (tab === 'Memory') return [own('Name', 'Body')]
    if (tab === 'Plugin') return [own('Name', 'Description', 'Version')]
    return []
}
