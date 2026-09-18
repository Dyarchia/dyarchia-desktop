/*
 * Which plugin can open a file, and how one asks.
 *
 * A plugin that finds something worth reading — a search hit, a log line, an artifact — should be
 * able to put it in front of the user without knowing who will render it. Naming the reader would
 * make the finder depend on a plugin that is optional and deletable, which is the coupling the
 * MCP offer folder already refuses for agents; this is the same refusal for panels.
 *
 * So a reader registers the extensions it understands and the panel that renders them, and a
 * finder asks whether anything opens a path rather than asking for a plugin by name. When nothing
 * does, the finder is told so and can fall back — revealing the file in the file manager, which
 * needs no plugin at all.
 *
 * The first registration for an extension wins, so a second reader cannot silently take over what
 * a first already answers for.
 */

export interface OpenRequest {
    path: string
    line?: number
}

export interface OpenerDescriptor {
    panelId: string
    extensions: string[]
}

export type OpenHandler = (request: OpenRequest) => void | Promise<void>

interface RegisteredOpener {
    pluginId: string
    panelId: string
    open: OpenHandler
}

const openers = new Map<string, RegisteredOpener>()

let showPanel: ((panelId: string) => void) | null = null

export function installOpeners(open: (panelId: string) => void): () => void {
    showPanel = open
    return () => {
        if (showPanel === open) showPanel = null
    }
}

function extensionOf(path: string): string {
    const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
    const dot = name.lastIndexOf('.')
    return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

export function registerOpener(
    pluginId: string,
    descriptor: OpenerDescriptor,
    open: OpenHandler
): void {
    for (const extension of descriptor.extensions) {
        const key = extension.toLowerCase()
        if (openers.has(key)) continue
        openers.set(key, { pluginId, panelId: descriptor.panelId, open })
    }
}

export function canOpen(path: string): boolean {
    return openers.has(extensionOf(path))
}

export async function openFile(request: OpenRequest): Promise<boolean> {
    const opener = openers.get(extensionOf(request.path))
    if (!opener) return false
    showPanel?.(opener.panelId)
    try {
        await opener.open(request)
        return true
    } catch (error) {
        console.error(`[openers] "${opener.pluginId}" failed to open ${request.path}`, error)
        return false
    }
}
