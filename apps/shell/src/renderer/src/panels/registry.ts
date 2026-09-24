export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    /*
     * One line saying what this panel is for, shown on its tile when nothing is open. The shell
     * has to offer the panels before anybody has seen them, and a grid of names alone is a menu
     * for somebody who already knows the product.
     */
    note?: string
    duplicable?: boolean
    /* Filled from the plugin's manifest by the host, so a plugin's panels share its colour. */
    hue?: string
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
