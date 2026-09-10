import { app, dialog, ipcMain, MessageChannelMain, shell, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'
import * as agents from './agents.js'
import { nextName, reclaim } from './artifacts.js'
import * as board from './board.js'
import * as boards from './boards.js'
import * as dispatch from './dispatch.js'
import * as events from './events.js'
import { rules } from './rules.js'
import * as worker from './worker.js'
import * as worktrees from './worktrees.js'
import type {
    Attachment,
    BoardDraft,
    BoardMeta,
    BoardPayload,
    Card,
    CardDraft,
    CardPatch,
    Settings,
    Status
} from './types.js'
import { isRefusal, Refusal } from './refusal.js'

const ATTACH_TIMEOUT_MS = 10_000
const ATTACHMENT_LIMIT = 25 * 1024 * 1024

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
    if (meta.archived) throw new Refusal(`board '${slug}' is archived`)
    return meta.slug
}

async function running(slug: string): Promise<Card[]> {
    return (await board.cards(slug)).filter((card) => card.status === 'running')
}

async function liveRun(slug: string, cardId: string): Promise<{ meta: BoardMeta; card: Card }> {
    const meta = await boards.find(slug)
    const card = (await board.cards(slug)).find((entry) => entry.id === cardId)
    if (!card) throw new Refusal(`no card '${cardId}'`)
    return { meta, card }
}

async function release(slug: string, cardId: string): Promise<void> {
    if (!host) return
    const card = (await board.cards(slug)).find((entry) => entry.id === cardId)
    const shortId = card?.runs[card.runs.length - 1]?.shortId
    if (shortId) host.postMessage({ type: 'release', shortId })
}

async function refusable<T>(work: () => Promise<T>): Promise<T | { __dyarchiaRefused: string }> {
    try {
        return await work()
    } catch (error) {
        if (!isRefusal(error)) throw error
        return { __dyarchiaRefused: error.message }
    }
}

export function activate(ctx: PluginMainContext): void {
    const sink: dispatch.Sink = {
        boardChanged: (slug) => ctx.broadcast('event', { type: 'board:changed', slug }),
        cardProgress: (progress) => ctx.broadcast('event', { type: 'card:progress', ...progress }),
        runEnded: (slug, cardId, outcome) => {
            void release(slug, cardId)
            ctx.broadcast('event', { type: 'run:ended', slug, cardId, outcome })
        },
        notify: (notice) => ctx.notify(notice)
    }

    const changed = (slug: string): void => sink.boardChanged(slug)
    const registryChanged = (): void => ctx.broadcast('event', { type: 'boards:changed' })

    const stopDispatcher = dispatch.begin(sink)

    ctx.handle('boards', () => boards.list())

    ctx.handle('settings', () => boards.settings())

    ctx.handle('updateSettings', async (raw) => {
        const saved = await boards.saveSettings(raw as Partial<Settings>)
        await dispatch.force(sink)
        return saved
    })

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
        const patch = raw as Partial<BoardDraft>
        const updated = await boards.update(String(slug), patch)
        registryChanged()
        if (patch.maxRunning !== undefined) await dispatch.force(sink)
        return updated
    })

    ctx.handle('archiveBoard', async (slug, archived) => {
        const target = String(slug)
        if (archived !== false && (await running(target)).length) {
            throw new Refusal('that board still has a card running')
        }
        const updated = await boards.setArchived(target, archived !== false)
        registryChanged()
        return updated
    })

    ctx.handle('deleteBoard', async (slug) => {
        const target = String(slug)
        await boards.find(target)
        if ((await running(target)).length) throw new Refusal('that board still has a card running')

        await boards.forget(target)
        board.forget(target)
        await reclaim(boards.boardRoot(target), boards.root())
        await reclaim(boards.workspacesRoot(target), boards.workspacesParent())
        registryChanged()
        return true
    })

    ctx.handle('board', async (slug): Promise<BoardPayload> => {
        const target = String(slug)
        const meta = await boards.find(target)
        if (meta.archived) throw new Refusal(`board '${target}' is archived`)
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

    ctx.handle('moveCards', async (slug, raw, to) => {
        const target = await open(String(slug))
        const wanted = (raw as { id: string; rev: number }[]).map((entry) => ({
            id: String(entry.id),
            rev: Number(entry.rev)
        }))
        const result = await board.moveCards(target, wanted, to as Status)
        await board.promote(target, Date.now())
        changed(target)
        return result
    })

    ctx.handle('deleteCards', async (slug, raw) => {
        const target = await open(String(slug))
        const result = await board.deleteCards(target, (raw as unknown[]).map(String))
        changed(target)
        return result
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

    ctx.handle('reviewCard', async (slug, id) => {
        const target = await open(String(slug))
        await dispatch.review(await boards.find(target), String(id), sink)
        changed(target)
        return true
    })

    ctx.handle('stopCard', async (slug, id) => {
        const target = String(slug)
        const { card } = await liveRun(target, String(id))
        const run = card.runs[card.runs.length - 1]
        if (!run || run.endedAt !== null) throw new Refusal('that card has no live run')
        if (run.shortId) await agents.stop(run.shortId)
        await dispatch.force(sink)
        return true
    })

    ctx.handle('runEvents', async (slug, id, runId) => {
        const target = String(slug)
        const { meta, card } = await liveRun(target, String(id))
        const run = runId
            ? card.runs.find((entry) => entry.runId === String(runId))
            : card.runs[card.runs.length - 1]
        if (!run?.sessionId) return []

        const place =
            run.worktree ??
            (card.workspaceKind === 'scratch'
                ? join(boards.workspacesRoot(meta.slug), card.id)
                : (card.workdir ?? meta.workdir))
        const path = await agents.transcript(place, run.sessionId)
        return path ? await worker.history(path) : []
    })

    ctx.handle('reveal', async (slug, id, name) => {
        const target = await open(String(slug))
        const file = boards.assertFileName(String(name))
        shell.showItemInFolder(join(boards.attachmentsRoot(target, String(id)), file))
        return true
    })

    ctx.handle('addAttachments', async (slug, id) => {
        const target = await open(String(slug))
        const cardId = String(id)

        const picked = await dialog.showOpenDialog({
            title: 'Give this card a file',
            properties: ['openFile', 'multiSelections']
        })
        if (picked.canceled || !picked.filePaths.length) return null

        const root = boards.attachmentsRoot(target, cardId)
        await mkdir(root, { recursive: true })
        const taken = new Set(await readdir(root).catch(() => []))

        const added: Attachment[] = []
        const refused: string[] = []

        for (const source of picked.filePaths) {
            const info = await stat(source).catch(() => null)
            if (!info?.isFile()) continue
            if (info.size > ATTACHMENT_LIMIT) {
                refused.push(basename(source))
                continue
            }
            const name = nextName(taken, boards.assertFileName(basename(source)))
            await copyFile(source, join(root, name))
            taken.add(name)
            added.push({ name, bytes: info.size, at: Date.now() })
        }

        const card = added.length ? await board.attach(target, cardId, added) : null
        if (card) changed(target)
        return { card, refused }
    })

    ctx.handle('removeAttachment', async (slug, id, name) => {
        const target = await open(String(slug))
        const cardId = String(id)
        const file = boards.assertFileName(String(name))

        const card = await board.detach(target, cardId, file)
        await rm(join(boards.attachmentsRoot(target, cardId), file), { force: true })
        changed(target)
        return card
    })

    ctx.handle('events', async (slug, id) => {
        const target = await open(String(slug))
        return events.read(target, id ? String(id) : undefined)
    })

    ctx.handle('diagnostics', () => dispatch.diagnose())

    ctx.handle('overview', () => dispatch.overview())

    ctx.handle('worktrees', async (slug) => dispatch.inventory(await boards.find(String(slug))))

    ctx.handle('removeWorktree', async (slug, path) => {
        const meta = await boards.find(String(slug))
        const found = (await dispatch.inventory(meta)).find((tree) =>
            worktrees.same(tree.path, String(path))
        )
        if (!found) throw new Refusal('that worktree is not on this board any more')
        if (found.live) throw new Refusal('a worker is still using that worktree')
        if (found.dirty) throw new Refusal('that worktree holds changes nobody committed')
        if (!found.landed) throw new Refusal('that worktree holds commits nothing has landed')
        await worktrees.remove(meta.workdir, found.path, found.branch)
        return true
    })

    ctx.handle('ignoreState', async (slug) => worktrees.state((await boards.find(String(slug))).workdir))

    ctx.handle('addIgnore', async (slug) => worktrees.ignore((await boards.find(String(slug))).workdir))

    ctx.handle('unblock', async (slug, id, rev) => {
        const target = await open(String(slug))
        const card = await board.unblock(target, String(id), Number(rev))
        await board.promote(target, Date.now())
        changed(target)
        return card
    })

    ipcMain.handle('plugin:kanban:attach', (event, ...args: unknown[]) =>
        refusable(async () => {
            const { slug, cardId, attachId, cols, rows } = args[0] as {
                slug: string
                cardId: string
                attachId: string
                cols: number
                rows: number
            }

            const { meta, card } = await liveRun(String(slug), String(cardId))
            const run = card.runs[card.runs.length - 1]
            if (!run?.shortId) throw new Refusal('that card has no session to attach to')

            const path = await agents.binary()
            if (!path) throw new Refusal('claude is not on PATH')
            const call = agents.invocation(path, ['attach', run.shortId])

            const { port1, port2 } = new MessageChannelMain()
            const host = ptyHost()

            const answered = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    host.off('message', listen)
                    reject(new Error('the pty host never answered'))
                }, ATTACH_TIMEOUT_MS)

                function listen(message: unknown): void {
                    const reply = message as { type?: string; attachId?: string; reason?: string }
                    if (reply?.attachId !== attachId) return
                    clearTimeout(timer)
                    host.off('message', listen)
                    if (reply.type === 'attached') resolve()
                    else reject(new Error(reply.reason ?? 'the pty could not start'))
                }

                host.on('message', listen)
            })

            host.postMessage(
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

            await answered
            event.sender.postMessage('dyarchia:port', { pluginId: 'kanban', attachId }, [port2])
            return run.shortId
        })
    )

    app.on('will-quit', () => {
        stopDispatcher()
        host?.kill()
        host = null
    })
}
