import type { PluginMainContext } from '@dyarchia/sdk'
import { runFusion } from './fusion/run.js'
import type { RunEvents, Threads } from './fusion/run.js'
import { keyOrigin, writeKey } from './providers/keys.js'
import type { KeyName } from './providers/keys.js'
import { deletePanel, panels, savePanel } from './providers/panels.js'
import { catalog, invalidate } from './providers/registry.js'
import type { KeyState, RunConfig, RunEvent, SavedPanel } from './types.js'

const MIN_PANEL = 2
const MAX_PANEL = 5
const MAX_TURNS = 10

interface Conversation {
    turns: number
    threads: Threads
}

let counter = 0

function validate(config: RunConfig): void {
    if (!config?.prompt?.trim()) throw new Error('the prompt is empty')
    if (config.panel.length < MIN_PANEL) throw new Error(`the panel needs at least ${MIN_PANEL} members`)
    if (config.panel.length > MAX_PANEL) throw new Error(`the panel takes at most ${MAX_PANEL} members`)
    if (!config.analyst) throw new Error('no analyst selected')
}

export function activate(ctx: PluginMainContext): void {
    const running = new Map<string, AbortController>()
    const conversations = new Map<string, Conversation>()
    const emit = (event: RunEvent): void => ctx.broadcast('event', event)

    const conversationOf = (id: string): Conversation => {
        const existing = conversations.get(id)
        if (existing) return existing
        const fresh: Conversation = { turns: 0, threads: new Map() }
        conversations.set(id, fresh)
        return fresh
    }

    ctx.handle('catalog', (refresh) => catalog(refresh === true))

    ctx.handle('keys', async (): Promise<KeyState> => ({
        anthropic: await keyOrigin('anthropic'),
        openai: await keyOrigin('openai')
    }))

    ctx.handle('setKey', async (name, value) => {
        await writeKey(name as KeyName, String(value ?? ''))
        invalidate()
        return true
    })

    ctx.handle('panels', () => panels())

    ctx.handle('savePanel', (raw) => {
        const entry = raw as Omit<SavedPanel, 'saved'>
        return savePanel({ ...entry, saved: new Date().toISOString() })
    })

    ctx.handle('deletePanel', (name) => deletePanel(String(name)))

    ctx.handle('reset', (id) => {
        conversations.delete(String(id))
        return true
    })

    ctx.handle('turns', (id) => ({
        turn: conversations.get(String(id))?.turns ?? 0,
        maxTurns: MAX_TURNS
    }))

    ctx.handle('run', (raw) => {
        const config = raw as RunConfig
        validate(config)

        const conversation = conversationOf(config.conversation)
        if (conversation.turns >= MAX_TURNS) {
            throw new Error(`conversation limit reached (${MAX_TURNS} turns) — start a new one`)
        }

        counter += 1
        const runId = `run-${counter}`
        const controller = new AbortController()
        running.set(runId, controller)

        const events: RunEvents = {
            stage: (stage) => emit({ runId, type: 'stage', stage }),
            memberDelta: (index, text) => emit({ runId, type: 'member:delta', index, text }),
            memberDone: (result) => emit({ runId, type: 'member:done', result }),
            analysis: (analysis, usage, ms) => emit({ runId, type: 'analysis', analysis, usage, ms }),
            answerDelta: (text) => emit({ runId, type: 'answer:delta', text }),
            done: (answer, summary) =>
                emit({
                    runId,
                    type: 'done',
                    answer,
                    summary: { ...summary, turn: conversation.turns + 1, maxTurns: MAX_TURNS }
                })
        }

        runFusion(config, events, controller.signal, conversation.threads)
            .then(() => {
                conversation.turns += 1
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error)
                emit({ runId, type: 'error', message })
            })
            .finally(() => running.delete(runId))

        return runId
    })

    ctx.handle('cancel', (runId) => {
        running.get(String(runId))?.abort()
        return true
    })
}
