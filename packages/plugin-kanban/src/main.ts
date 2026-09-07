import { app, dialog, ipcMain, MessageChannelMain, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'
import * as agents from './agents.js'
import * as board from './board.js'
import * as boards from './boards.js'
import * as dispatch from './dispatch.js'
import { rules } from './rules.js'
import * as worker from './worker.js'
import type { BoardDraft, BoardMeta, BoardPayload, Card, CardDraft, CardPatch, Status } from './types.js'

let host: UtilityProcess | null = null

function ptyHost(): UtilityProcess {
    if (host) return host
    const spawned = utilityProcess.fork(join(import.meta.dirname, 'ptyhost.cjs'), [], {
        serviceName: 'dyarchia kanban pty host'
    })
    spawned.on('exit', () => {
        if (host === spawned) host = null
    })
    host = spawned
    return spawned
}

async function open(slug: string): Promise<string> {
    const meta = await boards.find(slug)
    if (meta.archived) throw new Error(`board '${slug}' is archived`)
    return meta.slug
}

async function running(slug: string): Promise<Card[]> {
    return (await board.cards(slug)).filter((card) => card.status === 'running')
}

async function liveRun(slug: string, cardId: string): Promise<{ meta: BoardMeta; card: Card }> {
    const meta = await boards.find(slug)
    const card = (await board.cards(slug)).find((entry) => entry.id === cardId)
    if (!card) throw new Error(`no card '${cardId}'`)
    return { meta, card }
}

async function release(slug: string, cardId: string): Promise<void> {
    if (!host) return
    const card = (await board.cards(slug)).find((entry) => entry.id === cardId)
    const shortId = card?.runs[card.runs.length - 1]?.shortId
    if (shortId) host.postMessage({ type: 'release', shortId })
}

export function activate(ctx: PluginMainContext): void {
    const sink: dispatch.Sink = {
        boardChanged: (slug) => ctx.broadcast('event', { type: 'board:changed', slug }),
        cardProgress: (progress) => ctx.broadcast('event', { type: 'card:progress', ...progress }),
        runEnded: (slug, cardId, outcome) => {
            void release(slug, cardId)
            ctx.broadcast('event', { type: 'run:ended', slug, cardId, outcome })
        }
    }

    const changed = (slug: string): void => sink.boardChanged(slug)
    const registryChanged = (): void => ctx.broadcast('event', { type: 'boards:changed' })

    const stopDispatcher = dispatch.begin(sink)

    ctx.handle('boards', () => boards.list())

    ctx.handle('pickWorkdir', async () => {
        const picked = await dialog.showOpenDialog({
            title: 'Choose the project directory',
            properties: ['openDirectory']
        })
        return picked.canceled ? null : picked.filePaths[0]
    })

    ctx.handle('createBoard', async (raw) => {
        const created = await boards.create(raw as BoardDraft)
        registryChanged()
        return created
    })

    ctx.handle('updateBoard', async (slug, raw) => {
        const updated = await boards.update(String(slug), raw as Partial<BoardDraft>)
        registryChanged()
        return updated
    })

    ctx.handle('archiveBoard', async (slug, archived) => {
        const target = String(slug)
        if (archived !== false && (await running(target)).length) {
            throw new Error('that board still has a card running')
        }
        const updated = await boards.setArchived(target, archived !== false)
        registryChanged()
        return updated
    })

    ctx.handle('board', async (slug): Promise<BoardPayload> => {
        const target = String(slug)
        const meta = await boards.find(target)
        if (meta.archived) throw new Error(`board '${target}' is archived`)
        await board.promote(target, Date.now())
        return { board: meta, cards: await board.cards(target), rules: rules(), now: Date.now() }
    })

    ctx.handle('createCard', async (slug, raw) => {
        const target = await open(String(slug))
        const card = await board.createCard(target, raw as CardDraft)
        changed(target)
        return card
    })

    ctx.handle('updateCard', async (slug, id, raw) => {
        const target = await open(String(slug))
        const card = await board.updateCard(target, String(id), raw as CardPatch)
        await board.promote(target, Date.now())
        changed(target)
        return card
    })

    ctx.handle('moveCard', async (slug, id, rev, to) => {
        const target = await open(String(slug))
        const card = await board.moveCard(target, String(id), Number(rev), to as Status)
        await board.promote(target, Date.now())
        changed(target)
        return card
    })

    ctx.handle('deleteCard', async (slug, id) => {
        const target = await open(String(slug))
        const done = await board.deleteCard(target, String(id))
        changed(target)
        return done
    })

    ctx.handle('comment', async (slug, id, text) => {
        const target = await open(String(slug))
        const card = await board.comment(target, String(id), String(text), 'user')
        changed(target)
        return card
    })

    ctx.handle('dispatchNow', async () => {
        await dispatch.force(sink)
        return true
    })

    ctx.handle('stopCard', async (slug, id) => {
        const target = String(slug)
        const { card } = await liveRun(target, String(id))
        const run = card.runs[card.runs.length - 1]
        if (!run || run.endedAt !== null) throw new Error('that card has no live run')
        if (run.shortId) await agents.stop(run.shortId)
        await dispatch.force(sink)
        return true
    })

    ctx.handle('runEvents', async (slug, id) => {
        const target = String(slug)
        const { meta, card } = await liveRun(target, String(id))
        const run = card.runs[card.runs.length - 1]
        if (!run?.sessionId) return null

        const place =
            card.workspaceKind === 'scratch'
                ? join(boards.boardRoot(meta.slug), 'workspaces', card.id)
                : (card.workdir ?? meta.workdir)
        const path = await agents.transcript(place, run.sessionId)
        return path ? await worker.progress(path) : null
    })

    ctx.handle('diagnostics', () => dispatch.diagnose())

    ctx.handle('unblock', async (slug, id, rev) => {
        const target = await open(String(slug))
        const card = await board.unblock(target, String(id), Number(rev))
        await board.promote(target, Date.now())
        changed(target)
        return card
    })

    ipcMain.handle('plugin:kanban:attach', async (event, ...args: unknown[]) => {
        const { slug, cardId, attachId, cols, rows } = args[0] as {
            slug: string
            cardId: string
            attachId: string
            cols: number
            rows: number
        }

        const { meta, card } = await liveRun(String(slug), String(cardId))
        const run = card.runs[card.runs.length - 1]
        if (!run?.shortId) throw new Error('that card has no session to attach to')

        const path = await agents.binary()
        if (!path) throw new Error('claude is not on PATH')
        const call = agents.invocation(path, ['attach', run.shortId])

        const { port1, port2 } = new MessageChannelMain()
        ptyHost().postMessage(
            {
                type: 'attach',
                attachId,
                shortId: run.shortId,
                file: call.file,
                args: call.args,
                cwd: card.workdir ?? meta.workdir,
                cols,
                rows
            },
            [port1]
        )
        event.sender.postMessage('dyarchia:port', { pluginId: 'kanban', attachId }, [port2])
        return run.shortId
    })

    app.on('will-quit', () => {
        stopDispatcher()
        host?.kill()
        host = null
    })
}
