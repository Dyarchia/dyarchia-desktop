import claude from './catalogue/claude-code.json'
import codex from './catalogue/codex.json'
import antigravity from './catalogue/antigravity.json'
import vibe from './catalogue/vibe.json'
import kimi from './catalogue/kimi.json'
import grok from './catalogue/grok.json'

export type FieldType = 'string' | 'text' | 'list' | 'enum' | 'int' | 'object' | 'bool' | 'map'

export interface Field {
    key: string
    type: FieldType
    values?: string[]
    default?: string | number | boolean
    required?: boolean
    note?: string
    url?: string
}

export interface HookEvent {
    name: string
    note?: string
    url?: string
}

export interface Catalogue {
    docs?: string
    agent: Field[]
    skill: Field[]
    skillYaml?: Field[]
    tools: string[]
    events: HookEvent[]
    hookFields: Record<string, Field[]>
    mcpFields: Record<string, Field[]>
    command: Field[] | null
    prompt: Field[] | null
    rule: Field[] | null
    plugin: Field[]
}

export type Kind = 'agent' | 'skill' | 'command' | 'prompt' | 'memory' | 'rule' | 'plugin'
export type FileKind = 'command' | 'prompt' | 'memory' | 'rule'

export const KINDS: { kind: Kind; title: string }[] = [
    { kind: 'agent', title: 'Agents' },
    { kind: 'skill', title: 'Skills' },
    { kind: 'command', title: 'Commands' },
    { kind: 'prompt', title: 'Prompts' },
    { kind: 'memory', title: 'Memory' },
    { kind: 'rule', title: 'Rules' },
    { kind: 'plugin', title: 'Plugins' }
]

/*
 * Where one CLI keeps one kind of single-file definition. `{name}` is the definition's name; a
 * path without it is a file the CLI reads under a fixed name, CLAUDE.md or AGENTS.md. `markdown`
 * is frontmatter and a body, `plain` the body alone, `toml` a table whose `body` key holds the text.
 */
export interface FileSpec {
    user?: string
    project?: string
    format: 'markdown' | 'plain' | 'toml'
    body?: string
    fields: Field[]
}

/*
 * The folders a CLI's plugin keeps each part in, relative to the plugin's root. `listed` means the
 * manifest has to name its skills, agents and commands rather than the CLI finding them.
 */
export interface PluginSpec {
    manifest: string
    agents?: string
    skills: string
    commands?: string
    rules?: string
    prompts?: string
    mcp?: string
    hooks?: string
    listed?: boolean
}

export type Capability = 'read' | 'write' | 'edit' | 'search' | 'shell' | 'fetch' | 'web' | 'agents' | 'plan' | 'ask' | 'skills'

export const CAPABILITIES: [Capability, string][] = [
    ['read', 'Read'],
    ['write', 'Write'],
    ['edit', 'Edit'],
    ['search', 'Search'],
    ['shell', 'Shell'],
    ['fetch', 'Fetch'],
    ['web', 'Web search'],
    ['agents', 'Subagents'],
    ['plan', 'Task list'],
    ['ask', 'Ask'],
    ['skills', 'Skills']
]

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/*
 * One coding-agent CLI as Kamini writes for it: where each kind of definition lives in each
 * scope, the shape of an agent file, which of an agent's parts the file can carry, the native
 * names the neutral tool capabilities become, its plugin layout, and where the definitions it
 * already has are found. A part a file cannot carry is reported as dropped at compile time, never
 * written somewhere global on the agent's behalf.
 *
 * `main` says how the CLI runs a definition as the session's own agent: every definition can be
 * both (`both`), a TOML profile beside the agent (`profile`, Codex), or one file is either a
 * selectable agent or a spawned one (`either`, Vibe).
 */
export interface Target {
    id: string
    name: string
    format: 'markdown' | 'toml'
    agents: Record<'user' | 'project', string>
    skills: Record<'user' | 'project', string>
    profile?: string
    main: 'both' | 'profile' | 'either'
    hooks: boolean
    servers: boolean
    preload: boolean
    toolsKey?: string
    effortKey?: string
    capabilities: Partial<Record<Capability, string[]>>
    files: Partial<Record<FileKind, FileSpec>>
    plugin?: PluginSpec
    installed: [Kind, string][]
    catalogue: Catalogue
}

const catalogues = { claude, codex, antigravity, vibe, kimi, grok } as unknown as Record<string, Catalogue>

export const TARGETS: Target[] = [
    {
        id: 'claude-code',
        name: 'Claude Code',
        format: 'markdown',
        agents: { user: '~/.claude/agents', project: '.claude/agents' },
        skills: { user: '~/.claude/skills', project: '.claude/skills' },
        main: 'both',
        hooks: true,
        servers: true,
        preload: true,
        toolsKey: 'tools',
        effortKey: 'effort',
        capabilities: {
            read: ['Read'],
            write: ['Write'],
            edit: ['Edit', 'NotebookEdit'],
            search: ['Glob', 'Grep'],
            shell: ['Bash', 'PowerShell'],
            fetch: ['WebFetch'],
            web: ['WebSearch'],
            agents: ['Agent'],
            plan: ['TodoWrite'],
            ask: ['AskUserQuestion'],
            skills: ['Skill']
        },
        files: {
            command: { user: '~/.claude/commands/{name}.md', project: '.claude/commands/{name}.md', format: 'markdown', fields: [] },
            prompt: { user: '~/.claude/output-styles/{name}.md', project: '.claude/output-styles/{name}.md', format: 'markdown', fields: [] },
            memory: { user: '~/.claude/CLAUDE.md', project: 'CLAUDE.md', format: 'plain', fields: [] },
            rule: { user: '~/.claude/rules/{name}.md', project: '.claude/rules/{name}.md', format: 'markdown', fields: [] }
        },
        plugin: {
            manifest: '.claude-plugin/plugin.json',
            agents: 'agents',
            skills: 'skills',
            commands: 'commands',
            prompts: 'output-styles',
            mcp: '.mcp.json',
            hooks: 'hooks/hooks.json'
        },
        installed: [
            ['agent', '~/.claude/agents/**/*.md'],
            ['agent', '<project>/.claude/agents/**/*.md'],
            ['agent', '~/.claude/plugins/cache/*/*/*/agents/**/*.md'],
            ['skill', '~/.claude/skills/*/SKILL.md'],
            ['skill', '~/.claude/skills/synced/*/SKILL.md'],
            ['skill', '<project>/.claude/skills/*/SKILL.md'],
            ['skill', '~/.claude/plugins/cache/*/*/*/skills/*/SKILL.md'],
            ['command', '~/.claude/commands/**/*.md'],
            ['command', '<project>/.claude/commands/**/*.md'],
            ['command', '~/.claude/plugins/cache/*/*/*/commands/*.md'],
            ['prompt', '~/.claude/output-styles/*.md'],
            ['prompt', '<project>/.claude/output-styles/*.md'],
            ['memory', '~/.claude/CLAUDE.md'],
            ['memory', '<project>/CLAUDE.md'],
            ['memory', '<project>/.claude/CLAUDE.md'],
            ['rule', '~/.claude/rules/**/*.md'],
            ['rule', '<project>/.claude/rules/**/*.md'],
            ['plugin', '~/.claude/plugins/cache/*/*/*/.claude-plugin/plugin.json']
        ],
        catalogue: catalogues.claude!
    },
    {
        id: 'codex',
        name: 'Codex',
        format: 'toml',
        agents: { user: '~/.codex/agents', project: '.codex/agents' },
        skills: { user: '~/.agents/skills', project: '.agents/skills' },
        profile: '~/.codex',
        main: 'profile',
        hooks: true,
        servers: true,
        preload: false,
        effortKey: 'model_reasoning_effort',
        capabilities: {},
        files: {
            command: { user: '~/.codex/prompts/{name}.md', format: 'markdown', fields: [] },
            memory: { user: '~/.codex/AGENTS.md', project: 'AGENTS.md', format: 'plain', fields: [] }
        },
        plugin: { manifest: 'plugin.json', skills: 'skills', commands: 'commands', mcp: '.mcp.json', hooks: 'hooks/hooks.json' },
        installed: [
            ['agent', '~/.codex/agents/*.toml'],
            ['agent', '<project>/.codex/agents/*.toml'],
            ['skill', '~/.agents/skills/*/SKILL.md'],
            ['skill', '<project>/.agents/skills/*/SKILL.md'],
            ['skill', '~/.codex/skills/*/SKILL.md'],
            ['skill', '~/.codex/plugins/cache/*/*/*/skills/*/SKILL.md'],
            ['command', '~/.codex/prompts/*.md'],
            ['memory', '~/.codex/AGENTS.md'],
            ['memory', '<project>/AGENTS.md'],
            ['plugin', '~/.codex/plugins/cache/*/*/*/plugin.json'],
            ['plugin', '~/.codex/plugins/cache/*/*/*/.codex-plugin/plugin.json']
        ],
        catalogue: catalogues.codex!
    },
    {
        id: 'antigravity',
        name: 'Antigravity',
        format: 'markdown',
        agents: { user: '~/.gemini/config/agents', project: '.agents/agents' },
        skills: { user: '~/.gemini/antigravity-cli/skills', project: '.agents/skills' },
        main: 'both',
        hooks: false,
        servers: false,
        preload: false,
        toolsKey: 'tools',
        capabilities: {
            read: ['view_file'],
            write: ['write_to_file'],
            edit: ['replace_file_content', 'multi_replace_file_content'],
            search: ['list_dir', 'find_by_name', 'grep_search', 'code_search'],
            shell: ['run_command'],
            fetch: ['read_url_content'],
            web: ['search_web'],
            agents: ['invoke_subagent'],
            plan: ['manage_task'],
            ask: ['ask_question']
        },
        files: {
            memory: { user: '~/.gemini/AGENTS.md', project: 'AGENTS.md', format: 'plain', fields: [] },
            rule: { user: '~/.gemini/config/rules/{name}.md', project: '.agents/rules/{name}.md', format: 'markdown', fields: [] }
        },
        plugin: { manifest: 'plugin.json', agents: 'agents', skills: 'skills', rules: 'rules', mcp: 'mcp_config.json', hooks: 'hooks.json' },
        installed: [
            ['agent', '~/.gemini/config/agents/*.md'],
            ['agent', '~/.gemini/config/agents/*/agent.md'],
            ['agent', '<project>/.agents/agents/*.md'],
            ['agent', '<project>/.agents/agents/*/agent.md'],
            ['agent', '~/.gemini/antigravity-cli/plugins/*/agents/*.md'],
            ['skill', '~/.gemini/antigravity-cli/skills/*/SKILL.md'],
            ['skill', '~/.gemini/config/skills/*/SKILL.md'],
            ['skill', '<project>/.agents/skills/*/SKILL.md'],
            ['skill', '~/.gemini/antigravity-cli/plugins/*/skills/*/SKILL.md'],
            ['memory', '~/.gemini/AGENTS.md'],
            ['memory', '~/.gemini/GEMINI.md'],
            ['memory', '<project>/GEMINI.md'],
            ['memory', '<project>/AGENTS.md'],
            ['rule', '~/.gemini/config/rules/*.md'],
            ['rule', '~/.gemini/antigravity-cli/rules/*.md'],
            ['rule', '<project>/.agents/rules/*.md'],
            ['plugin', '~/.gemini/antigravity-cli/plugins/*/plugin.json'],
            ['plugin', '~/.gemini/config/plugins/*/plugin.json']
        ],
        catalogue: catalogues.antigravity!
    },
    {
        id: 'vibe',
        name: 'Vibe',
        format: 'toml',
        agents: { user: '~/.vibe/agents', project: '.vibe/agents' },
        skills: { user: '~/.agents/skills', project: '.agents/skills' },
        main: 'either',
        hooks: false,
        servers: true,
        preload: false,
        toolsKey: 'enabled_tools',
        capabilities: {
            read: ['read_file'],
            write: ['write_file'],
            edit: ['edit'],
            search: ['grep'],
            shell: ['bash', 'powershell'],
            fetch: ['web_fetch'],
            web: ['web_search'],
            agents: ['task'],
            plan: ['todo'],
            ask: ['ask_user_question'],
            skills: ['skill']
        },
        files: {
            prompt: { user: '~/.vibe/prompts/{name}.md', project: '.vibe/prompts/{name}.md', format: 'plain', fields: [] },
            memory: { user: '~/.vibe/AGENTS.md', project: 'AGENTS.md', format: 'plain', fields: [] }
        },
        plugin: { manifest: 'plugin.json', agents: 'ai.mistral.vibe/agents', skills: 'skills', mcp: 'mcp.json' },
        installed: [
            ['agent', '~/.vibe/agents/*.toml'],
            ['agent', '<project>/.vibe/agents/*.toml'],
            ['agent', '~/.vibe/plugins/*/ai.mistral.vibe/agents/*.toml'],
            ['skill', '~/.vibe/skills/*/SKILL.md'],
            ['skill', '<project>/.vibe/skills/*/SKILL.md'],
            ['skill', '~/.vibe/plugins/*/skills/*/SKILL.md'],
            ['prompt', '~/.vibe/prompts/*.md'],
            ['prompt', '<project>/.vibe/prompts/*.md'],
            ['memory', '~/.vibe/AGENTS.md'],
            ['plugin', '~/.vibe/plugins/*/plugin.json'],
            ['plugin', '<project>/.vibe/plugins/*/plugin.json']
        ],
        catalogue: catalogues.vibe!
    },
    {
        id: 'kimi',
        name: 'Kimi',
        format: 'markdown',
        agents: { user: '~/.kimi-code/agents', project: '.kimi-code/agents' },
        skills: { user: '~/.agents/skills', project: '.agents/skills' },
        main: 'both',
        hooks: false,
        servers: false,
        preload: false,
        toolsKey: 'tools',
        capabilities: {
            read: ['Read', 'ReadMediaFile'],
            write: ['Write'],
            edit: ['Edit'],
            search: ['Grep', 'Glob'],
            shell: ['Bash'],
            fetch: ['FetchURL'],
            web: ['WebSearch'],
            agents: ['Agent'],
            plan: ['TodoList'],
            ask: ['AskUserQuestion'],
            skills: ['Skill']
        },
        files: {
            prompt: { user: '~/.kimi-code/SYSTEM.md', format: 'plain', fields: [] },
            memory: { user: '~/.kimi-code/AGENTS.md', project: 'AGENTS.md', format: 'plain', fields: [] }
        },
        plugin: { manifest: 'kimi.plugin.json', agents: 'agents', skills: 'skills', commands: 'commands', listed: true },
        installed: [
            ['agent', '~/.kimi-code/agents/**/*.md'],
            ['agent', '~/.agents/agents/**/*.md'],
            ['agent', '<project>/.kimi-code/agents/**/*.md'],
            ['agent', '~/.kimi-code/plugins/managed/*/agents/**/*.md'],
            ['skill', '~/.kimi-code/skills/*/SKILL.md'],
            ['skill', '<project>/.kimi-code/skills/*/SKILL.md'],
            ['skill', '~/.kimi-code/plugins/managed/*/skills/*/SKILL.md'],
            ['command', '~/.kimi-code/plugins/managed/*/commands/**/*.md'],
            ['prompt', '~/.kimi-code/SYSTEM.md'],
            ['memory', '~/.kimi-code/AGENTS.md'],
            ['memory', '~/.agents/AGENTS.md'],
            ['memory', '<project>/.kimi-code/AGENTS.md'],
            ['plugin', '~/.kimi-code/plugins/managed/*/kimi.plugin.json']
        ],
        catalogue: catalogues.kimi!
    },
    {
        id: 'grok',
        name: 'Grok',
        format: 'markdown',
        agents: { user: '~/.grok/agents', project: '.grok/agents' },
        skills: { user: '~/.agents/skills', project: '.agents/skills' },
        main: 'both',
        hooks: true,
        servers: true,
        preload: true,
        toolsKey: 'tools',
        effortKey: 'effort',
        capabilities: {
            read: ['read_file'],
            write: ['write'],
            edit: ['search_replace', 'hashline_edit', 'apply_patch'],
            search: ['list_dir', 'grep'],
            shell: ['run_terminal_command'],
            fetch: ['web_fetch'],
            web: ['web_search'],
            agents: ['spawn_subagent'],
            plan: ['todo_write'],
            ask: ['ask_user_question']
        },
        files: {
            command: { user: '~/.grok/commands/{name}.md', project: '.grok/commands/{name}.md', format: 'markdown', fields: [] },
            prompt: { user: '~/.grok/personas/{name}.toml', project: '.grok/personas/{name}.toml', format: 'toml', body: 'instructions', fields: [] },
            memory: { user: '~/.grok/AGENTS.md', project: 'AGENTS.md', format: 'plain', fields: [] },
            rule: { user: '~/.grok/rules/{name}.md', project: '.grok/rules/{name}.md', format: 'plain', fields: [] }
        },
        plugin: { manifest: 'plugin.json', agents: 'agents', skills: 'skills', commands: 'commands', mcp: '.mcp.json', hooks: 'hooks/hooks.json' },
        installed: [
            ['agent', '~/.grok/agents/*.md'],
            ['agent', '<project>/.grok/agents/*.md'],
            ['skill', '~/.grok/skills/**/SKILL.md'],
            ['skill', '<project>/.grok/skills/**/SKILL.md'],
            ['skill', '~/.agents/skills/*/SKILL.md'],
            ['skill', '<project>/.agents/skills/*/SKILL.md'],
            ['command', '~/.grok/commands/*.md'],
            ['command', '<project>/.grok/commands/*.md'],
            ['command', '~/.agents/commands/*.md'],
            ['prompt', '~/.grok/personas/*.toml'],
            ['prompt', '<project>/.grok/personas/*.toml'],
            ['memory', '~/.grok/AGENTS.md'],
            ['rule', '~/.grok/rules/*.md'],
            ['rule', '<project>/.grok/rules/*.md'],
            ['plugin', '~/.grok/plugins/*/plugin.json'],
            ['plugin', '<project>/.grok/plugins/*/plugin.json']
        ],
        catalogue: catalogues.grok!
    }
]

for (const each of TARGETS) {
    for (const [kind, spec] of Object.entries(each.files) as [FileKind, FileSpec][]) {
        if (kind === 'command' || kind === 'prompt' || kind === 'rule') spec.fields = each.catalogue[kind] ?? []
        if (each.id === 'codex' && kind === 'command') spec.fields = each.catalogue.prompt ?? []
    }
}

export function target(id: string): Target | undefined {
    return TARGETS.find((each) => each.id === id)
}

export function hookEvents(): HookEvent[] {
    const seen = new Map<string, HookEvent>()
    for (const each of TARGETS) for (const event of each.catalogue.events) if (!seen.has(event.name)) seen.set(event.name, event)
    return [...seen.values()]
}

export function carries(each: Target, event: string): boolean {
    return each.catalogue.events.some((known) => known.name === event)
}

export function hookTypes(): string[] {
    return [...new Set(TARGETS.flatMap((each) => Object.keys(each.catalogue.hookFields)))]
}

export function hookFields(type: string): Field[] {
    const seen = new Map<string, Field>()
    for (const each of TARGETS) for (const field of each.catalogue.hookFields[type] ?? []) if (!seen.has(field.key)) seen.set(field.key, field)
    return [...seen.values()]
}

export const TRANSPORTS = ['stdio', 'http', 'sse'] as const

export function transportKeys(transport: string): string[] {
    return transport === 'http' ? ['http', 'streamable_http', 'streamable-http'] : [transport]
}

export function serverFields(transport: string, of: Target[] = TARGETS): Field[] {
    const seen = new Map<string, Field>()
    for (const each of of) {
        for (const key of transportKeys(transport)) {
            for (const field of each.catalogue.mcpFields[key] ?? []) if (!seen.has(field.key)) seen.set(field.key, field)
        }
    }
    return [...seen.values()]
}

export const NAME = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

/*
 * What one CLI alone reads for one kind of definition, beside what every CLI shares. Codex keeps a
 * skill's interface in `agents/openai.yaml`, so those keys are told apart by their prefix.
 */
export function fieldsOf(kind: Kind, each: Target): Field[] {
    if (kind === 'agent') return each.catalogue.agent
    if (kind === 'skill') return [...each.catalogue.skill, ...(each.catalogue.skillYaml ?? []).map((field) => ({ ...field, key: `openai:${field.key}` }))]
    if (kind === 'plugin') return each.catalogue.plugin
    return each.files[kind]?.fields ?? []
}
