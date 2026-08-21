export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    duplicable?: boolean
}

export function basePanelId(instanceId: string): string {
    const hash = instanceId.indexOf('#')
    return hash === -1 ? instanceId : instanceId.slice(0, hash)
}

export type PanelDispose = () => void

export interface PanelHandle {
    readonly instanceId: string
    close(): void
}

export type PanelMount = (container: HTMLElement, handle: PanelHandle) => PanelDispose | void

export type ThemeName = 'light' | 'dark'

export interface ThemeApi {
    readonly current: ThemeName
    token(name: string): string
    onChange(listener: (theme: ThemeName) => void): () => void
}

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

export function getRegisteredPanels(): RegisteredPanel[] {
    return [...panels.values()]
}

export function getPanel(id: string): RegisteredPanel | undefined {
    return panels.get(basePanelId(id))
}

export function onRegistryChange(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
