import { app } from 'electron'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/*
 * Tools other plugins offer to an agent, read from the one place the shell reserves for it:
 * <userData>/mcp/<plugin>.json. A plugin that can serve a tool over the Model Context Protocol
 * writes its offer there while it can serve it, and removes it when it cannot; this board reads
 * the folder at launch and knows nothing about who wrote what. Plugins stay independent: the
 * kanban runs without any offer, and an offer whose command is gone from the disk is skipped as
 * if it were not there.
 *
 * The board turns the offers into one --mcp-config for the worker, allows every tool an offer
 * names, and hands the notes to the brief so the worker knows what it can reach for.
 */

const FOLDER = 'mcp'

export interface OfferedTool {
    name: string
    note: string
}

export interface Offer {
    plugin: string
    server: string
    command: string
    args: string[]
    env?: Record<string, string>
    tools: OfferedTool[]
}

export interface Offering {
    configPath: string
    allow: string[]
    notes: string[]
}

export function folder(): string {
    return join(app.getPath('userData'), FOLDER)
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

function valid(raw: unknown): raw is Offer {
    if (!raw || typeof raw !== 'object') return false
    const offer = raw as Record<string, unknown>
    return (
        typeof offer['plugin'] === 'string' &&
        typeof offer['server'] === 'string' &&
        /^[a-z][a-z0-9-]*$/.test(offer['server']) &&
        typeof offer['command'] === 'string' &&
        Array.isArray(offer['args']) &&
        Array.isArray(offer['tools']) &&
        (offer['tools'] as unknown[]).every(
            (tool) =>
                !!tool &&
                typeof tool === 'object' &&
                typeof (tool as Record<string, unknown>)['name'] === 'string' &&
                typeof (tool as Record<string, unknown>)['note'] === 'string'
        )
    )
}

export async function list(): Promise<Offer[]> {
    const names = await readdir(folder()).catch(() => [] as string[])
    const offers: Offer[] = []
    for (const name of names.sort()) {
        if (!name.endsWith('.json')) continue
        let raw: unknown
        try {
            raw = JSON.parse(await readFile(join(folder(), name), 'utf-8'))
        } catch {
            continue
        }
        if (!valid(raw)) continue
        if (!(await exists(raw.command))) continue
        offers.push(raw)
    }
    return offers
}

export function toolName(server: string, tool: string): string {
    return `mcp__${server}__${tool}`
}

export async function configure(): Promise<Offering | null> {
    const offers = await list()
    if (!offers.length) return null
    const servers: Record<string, unknown> = {}
    const allow: string[] = []
    const notes: string[] = []
    for (const offer of offers) {
        servers[offer.server] = {
            type: 'stdio',
            command: offer.command,
            args: offer.args,
            ...(offer.env ? { env: offer.env } : {})
        }
        for (const tool of offer.tools) {
            allow.push(toolName(offer.server, tool.name))
            notes.push(`${tool.name}: ${tool.note}`)
        }
    }
    const holder = join(app.getPath('userData'), 'kanban')
    await mkdir(holder, { recursive: true })
    const configPath = join(holder, 'mcp.json')
    await writeFile(configPath, JSON.stringify({ mcpServers: servers }, null, 4) + '\n', 'utf-8')
    return { configPath, allow, notes }
}
