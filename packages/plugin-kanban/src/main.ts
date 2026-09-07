import { dialog } from 'electron'
import type { PluginMainContext } from '@dyarchia/sdk'
import * as board from './board.js'
import * as boards from './boards.js'
import { rules } from './rules.js'
import type { BoardDraft, BoardPayload, CardDraft, CardPatch, Status } from './types.js'

const PROMOTE_MS = 30_000

export function activate(ctx: PluginMainContext): void {
    const changed = (slug: string): void => ctx.broadcast('event', { type: 'board:changed', slug })
    const registryChanged = (): void => ctx.broadcast('event', { type: 'boards:changed' })

    const sweep = async (): Promise<void> => {
        const now = Date.now()
        for (const entry of await boards.list()) {
            if (entry.archived) continue
            if (await board.promote(entry.slug, now)) changed(entry.slug)
        }
    }

    const timer = setInterval(() => void sweep().catch(() => undefined), PROMOTE_MS)
    timer.unref?.()

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
        const running = (await board.cards(target)).some((card) => card.status === 'running')
        if (running && archived !== false) throw new Error('that board still has a card running')

        const updated = await boards.setArchived(target, archived !== false)
        registryChanged()
        return updated
    })

    ctx.handle('board', async (slug): Promise<BoardPayload> => {
        const target = String(slug)
        const meta = await boards.find(target)
        await board.promote(target, Date.now())
        return { board: meta, cards: await board.cards(target), rules: rules(), now: Date.now() }
    })

    ctx.handle('createCard', async (slug, raw) => {
        const target = String(slug)
        const card = await board.createCard(target, raw as CardDraft)
        changed(target)
        return card
    })

    ctx.handle('updateCard', async (slug, id, raw) => {
        const target = String(slug)
        const card = await board.updateCard(target, String(id), raw as CardPatch)
        await board.promote(target, Date.now())
        changed(target)
        return card
    })

    ctx.handle('moveCard', async (slug, id, rev, to) => {
        const target = String(slug)
        const card = await board.moveCard(target, String(id), Number(rev), to as Status)
        await board.promote(target, Date.now())
        changed(target)
        return card
    })

    ctx.handle('deleteCard', async (slug, id) => {
        const target = String(slug)
        const done = await board.deleteCard(target, String(id))
        changed(target)
        return done
    })

    ctx.handle('comment', async (slug, id, text) => {
        const target = String(slug)
        const card = await board.comment(target, String(id), String(text), 'user')
        changed(target)
        return card
    })
}
