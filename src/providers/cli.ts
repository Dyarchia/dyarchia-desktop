import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RouteId, Usage } from '../types.js'
import type { CompletionRequest, CompletionResult, ModelInfo, Route, RouteStatus } from './adapter.js'
import { which } from './which.js'

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const OPENCODE_EFFORTS = ['minimal', 'low', 'medium', 'high', 'max']

const CLAUDE_MODELS: ModelInfo[] = [
    { id: 'fable', label: 'Claude Fable 5', efforts: CLAUDE_EFFORTS },
    { id: 'opus', label: 'Claude Opus 5', efforts: CLAUDE_EFFORTS },
    { id: 'sonnet', label: 'Claude Sonnet 5', efforts: CLAUDE_EFFORTS },
    { id: 'haiku', label: 'Claude Haiku 4.5', efforts: [] }
]

const KEY_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY']

const CLAUDE_DENY = [
    'Agent',
    'Artifact',
    'Bash',
    'CronCreate',
    'CronDelete',
    'CronList',
    'DesignSync',
    'Edit',
    'EnterWorktree',
    'ExitWorktree',
    'Glob',
    'Grep',
    'ListAgents',
    'Monitor',
    'NotebookEdit',
    'PowerShell',
    'PushNotification',
    'Read',
    'RemoteTrigger',
    'ReportFindings',
    'ScheduleWakeup',
    'SendMessage',
    'Skill',
    'Task',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskOutput',
    'TaskStop',
    'TaskUpdate',
    'ToolSearch',
    'Workflow',
    'Write'
].join(' ')

interface Sink {
    delta(text: string): void
    replace(id: string, text: string): void
    usage(patch: Partial<Usage>): void
    session(id: string): void
}

interface CliSpec {
    id: RouteId
    label: string
    bin: string
    args(request: CompletionRequest, scratch: string): string[]
    inlineSystem: boolean
    consume(event: Record<string, unknown>, sink: Sink): void
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

const claude: CliSpec = {
    id: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    inlineSystem: false,
    args(request) {
        return [
            '-p',
            ...(request.session ? ['--resume', request.session] : []),
            '--safe-mode',
            '--setting-sources',
            '',
            '--output-format',
            'stream-json',
            '--include-partial-messages',
            '--verbose',
            '--model',
            request.model,
            ...(request.effort ? ['--effort', request.effort] : []),
            '--allowed-tools',
            'WebSearch WebFetch',
            '--disallowed-tools',
            CLAUDE_DENY,
            '--permission-mode',
            'dontAsk',
            '--system-prompt',
            request.system
        ]
    },
    consume(event, sink) {
        if (event.type === 'stream_event') {
            const inner = asRecord(event.event)
            if (inner.type !== 'content_block_delta') return
            const delta = asRecord(inner.delta)
            if (delta.type === 'text_delta' && typeof delta.text === 'string') sink.delta(delta.text)
            return
        }
        if (event.type !== 'result') return
        if (typeof event.session_id === 'string') sink.session(event.session_id)
        const usage = asRecord(event.usage)
        sink.usage({
            inputTokens: asNumber(usage.input_tokens) + asNumber(usage.cache_creation_input_tokens),
            outputTokens: asNumber(usage.output_tokens),
            cachedTokens: asNumber(usage.cache_read_input_tokens),
            costUsd: asNumber(event.total_cost_usd)
        })
        if (event.is_error === true) throw new Error(String(event.result ?? 'claude reported an error'))
    }
}

const codex: CliSpec = {
    id: 'codex',
    label: 'Codex CLI',
    bin: 'codex',
    inlineSystem: true,
    args(request, scratch) {
        const shared = [
            '--json',
            '--skip-git-repo-check',
            '--ignore-user-config',
            '--ignore-rules',
            '-c',
            'tools.web_search=true',
            ...(request.effort ? ['-c', `model_reasoning_effort=${request.effort}`] : []),
            '-m',
            request.model,
            '-'
        ]
        if (request.session) return ['exec', 'resume', request.session, ...shared]
        return ['exec', '--sandbox', 'read-only', '-C', scratch, ...shared]
    },
    consume(event, sink) {
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
            sink.session(event.thread_id)
            return
        }
        if (event.type === 'item.completed') {
            const item = asRecord(event.item)
            if (item.type === 'agent_message' && typeof item.text === 'string') {
                sink.replace(String(item.id ?? 'agent_message'), item.text)
            }
            return
        }
        if (event.type !== 'turn.completed') return
        const usage = asRecord(event.usage)
        sink.usage({
            inputTokens: asNumber(usage.input_tokens),
            outputTokens: asNumber(usage.output_tokens),
            cachedTokens: asNumber(usage.cached_input_tokens)
        })
    }
}

const opencode: CliSpec = {
    id: 'opencode',
    label: 'opencode',
    bin: 'opencode',
    inlineSystem: true,
    args(request, scratch) {
        return [
            'run',
            '--pure',
            '--format',
            'json',
            '-m',
            request.model,
            '--dir',
            scratch,
            ...(request.effort ? ['--variant', request.effort] : []),
            ...(request.session ? ['-s', request.session] : [])
        ]
    },
    consume(event, sink) {
        if (typeof event.sessionID === 'string') sink.session(event.sessionID)
        const part = asRecord(event.part)
        if (event.type === 'text' && typeof part.text === 'string') {
            sink.replace(String(part.id ?? 'text'), part.text)
            return
        }
        if (event.type !== 'step_finish') return
        const tokens = asRecord(part.tokens)
        const cache = asRecord(tokens.cache)
        sink.usage({
            inputTokens: asNumber(tokens.input),
            outputTokens: asNumber(tokens.output) + asNumber(tokens.reasoning),
            cachedTokens: asNumber(cache.read),
            costUsd: asNumber(part.cost)
        })
    }
}

const SPECS: Record<string, CliSpec> = { claude, codex, opencode }

function childEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env }
    for (const key of KEY_VARS) delete env[key]
    return env
}

async function run(spec: CliSpec, request: CompletionRequest, scratch: string): Promise<CompletionResult> {
    const bin = await which(spec.bin)
    if (!bin) throw new Error(`${spec.bin} is not on PATH`)

    const started = Date.now()
    const parts = new Map<string, string>()
    let streamed = ''
    let session: string | null = request.session
    const usage: Usage = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: null,
        billing: 'plan'
    }

    const sink: Sink = {
        delta(text) {
            streamed += text
            request.onDelta(text)
        },
        replace(id, text) {
            const previous = parts.get(id) ?? ''
            if (text.startsWith(previous) && text.length > previous.length) {
                request.onDelta(text.slice(previous.length))
            } else if (text !== previous) {
                request.onDelta(text)
            }
            parts.set(id, text)
        },
        usage(patch) {
            Object.assign(usage, patch)
        },
        session(id) {
            session = id
        }
    }

    const prompt = spec.inlineSystem ? `${request.system}\n\n---\n\n${request.prompt}` : request.prompt
    const child = spawn(bin, spec.args(request, scratch), {
        cwd: scratch,
        env: childEnv(),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
    })

    const abort = (): void => {
        child.kill()
    }
    request.signal.addEventListener('abort', abort, { once: true })

    let buffer = ''
    let failure: Error | null = null
    let stderr = ''

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
        buffer += chunk
        let index = buffer.indexOf('\n')
        while (index >= 0) {
            const line = buffer.slice(0, index).trim()
            buffer = buffer.slice(index + 1)
            index = buffer.indexOf('\n')
            if (!line || !line.startsWith('{')) continue
            try {
                spec.consume(JSON.parse(line) as Record<string, unknown>, sink)
            } catch (error) {
                if (error instanceof SyntaxError) continue
                failure = error as Error
                child.kill()
            }
        }
    })

    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-4000)
    })

    child.stdin.end(prompt)

    const code = await new Promise<number>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', resolve)
    }).finally(() => request.signal.removeEventListener('abort', abort))

    if (request.signal.aborted) throw new Error('cancelled')
    if (failure) throw failure
    if (code !== 0) throw new Error(stderr.trim().split('\n').pop() ?? `${spec.bin} exited with ${code}`)

    const text = streamed || [...parts.values()].join('')
    if (!text.trim()) throw new Error(stderr.trim().split('\n').pop() ?? `${spec.bin} returned no text`)

    return { text, usage, ms: Date.now() - started, session }
}

async function codexModels(): Promise<ModelInfo[]> {
    try {
        const raw = await readFile(join(homedir(), '.codex', 'models_cache.json'), 'utf-8')
        const parsed = asRecord(JSON.parse(raw))
        const models = Array.isArray(parsed.models) ? parsed.models : []
        return models
            .map((entry) => asRecord(entry))
            .map((entry) => ({
                id: String(entry.slug ?? ''),
                label: String(entry.display_name ?? entry.slug ?? ''),
                efforts: (Array.isArray(entry.supported_reasoning_levels)
                    ? entry.supported_reasoning_levels
                    : []
                )
                    .map((level) => String(asRecord(level).effort ?? ''))
                    .filter(Boolean)
            }))
            .filter((entry) => entry.id.startsWith('gpt-'))
    } catch {
        return [
            { id: 'gpt-5.5', label: 'gpt-5.5', efforts: [] },
            { id: 'gpt-5.4', label: 'gpt-5.4', efforts: [] }
        ]
    }
}

async function opencodeListing(bin: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
        const child = spawn(bin, ['models'], { env: childEnv(), windowsHide: true })
        let out = ''
        child.stdout.setEncoding('utf-8')
        child.stdout.on('data', (chunk: string) => {
            out += chunk
        })
        child.on('error', () => resolve(null))
        child.on('close', (code) => resolve(code === 0 && out.trim() ? out : null))
    })
}

async function opencodeModels(bin: string): Promise<ModelInfo[]> {
    const stdout = (await opencodeListing(bin)) ?? (await opencodeListing(bin))
    if (!stdout) throw new Error('opencode models returned nothing')

    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.includes('/') && !line.includes(' '))
        .map((id) => ({ id, label: id.split('/').slice(1).join('/'), efforts: OPENCODE_EFFORTS }))
}

export function cliRoute(id: 'claude' | 'codex' | 'opencode', scratch: () => Promise<string>): Route {
    const spec = SPECS[id]

    return {
        id: spec.id,
        label: spec.label,
        async status(): Promise<RouteStatus> {
            const bin = await which(spec.bin)
            if (!bin) return { available: false, reason: `${spec.bin} is not installed or not on PATH` }
            return { available: true }
        },
        async models() {
            const bin = await which(spec.bin)
            if (!bin) return []
            if (id === 'claude') return CLAUDE_MODELS
            if (id === 'codex') return codexModels()
            return opencodeModels(bin)
        },
        async complete(request) {
            return run(spec, request, await scratch())
        }
    }
}
