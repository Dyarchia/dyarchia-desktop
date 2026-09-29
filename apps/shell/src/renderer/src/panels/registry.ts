export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    duplicable?: boolean
    /* Where this panel's key sits in the title bar, from the plugin's manifest; absent is last. */
    toolbar?: number
    keepAlive?: boolean
    width?: number
    maxWidth?: number
    modal?: boolean
}

/*
 * How the dock should hold a panel. A panel that keeps a live page in it asks to stay in the
 * document while it is hidden, because a `<webview>` taken out of the document is a page thrown
 * away and loaded again when it comes back; everything else is removed while hidden, as dockview
 * does by default.
 */
export function panelRenderer(descriptor: PanelDescriptor | undefined): { renderer?: 'always' } {
    return descriptor?.keepAlive ? { renderer: 'always' } : {}
}

export function basePanelId(instanceId: string): string {
    const hash = instanceId.indexOf('#')
    return hash === -1 ? instanceId : instanceId.slice(0, hash)
}

export type PanelDispose = () => void

export interface PanelHandle {
    readonly instanceId: string
    close(): void
    setTitle(title: string | null, icon?: string | null): void
    readonly toolbar: HTMLElement
}

export type PanelMount = (container: HTMLElement, handle: PanelHandle) => PanelDispose | void

export interface RegisteredPanel {
    descriptor: PanelDescriptor
    mount: PanelMount
}

const panels = new Map<string, RegisteredPanel>()
const listeners = new Set<() => void>()

export function registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void {
    panels.set(descriptor.id, { descriptor, mount })
    for (const listener of listeners) listener()
}

/*
 * By title, because the order plugins register in is the order a directory listing happened to
 * come back in, and nothing the reader can see explains it. Both the top bar and the launcher
 * read this, so they agree, and a key does not move because a plugin loaded a moment sooner.
 */
export function getRegisteredPanels(): RegisteredPanel[] {
    return [...panels.values()].sort((a, b) =>
        a.descriptor.title.localeCompare(b.descriptor.title)
    )
}

export function getPanel(id: string): RegisteredPanel | undefined {
    return panels.get(basePanelId(id))
}

export function onRegistryChange(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

/*
 * The mark a panel instance wears on its tab while it wears one of its own. Kept here rather than
 * in dockview's parameters because those are saved with the layout, and a mark that names what a
 * terminal was running must not come back with a terminal that is running nothing.
 */
const tabIcons = new Map<string, string>()
const tabIconListeners = new Set<(instanceId: string) => void>()

export function setTabIcon(instanceId: string, icon: string | null): void {
    if (icon) tabIcons.set(instanceId, icon)
    else tabIcons.delete(instanceId)
    for (const listener of tabIconListeners) listener(instanceId)
}

export function getTabIcon(instanceId: string): string | undefined {
    return tabIcons.get(instanceId)
}

export function onTabIconChange(listener: (instanceId: string) => void): () => void {
    tabIconListeners.add(listener)
    return () => tabIconListeners.delete(listener)
}

/*
 * Each panel instance's toolbar element, which the group header shows while that instance is the
 * group's open tab.
 */
const toolbars = new Map<string, HTMLElement>()
const toolbarListeners = new Set<() => void>()

export function setToolbar(instanceId: string, element: HTMLElement | null): void {
    if (element) toolbars.set(instanceId, element)
    else toolbars.delete(instanceId)
    for (const listener of toolbarListeners) listener()
}

export function getToolbar(instanceId: string): HTMLElement | undefined {
    return toolbars.get(instanceId)
}

export function onToolbarChange(listener: () => void): () => void {
    toolbarListeners.add(listener)
    return () => toolbarListeners.delete(listener)
}
