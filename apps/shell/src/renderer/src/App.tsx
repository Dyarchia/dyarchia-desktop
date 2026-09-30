import { useCallback, useEffect, useState } from 'react'
import type { DockviewApi } from 'dockview-react'
import { loadApps, touchApp } from './apps'
import { DockLayout } from './layout/DockLayout'
import { Notices } from './components/Notices'
import { Palette } from './components/Palette'
import { TopBar } from './components/TopBar'
import { ModalPanel } from './panels/ModalPanel'
import { basePanelId, getPanel, getRegisteredPanels, onRegistryChange, panelRenderer } from './panels/registry'
import { installOpeners } from './panels/openers'
import { loadPlugins } from './plugins/host'
import { installShortcuts } from './shortcuts'

export function App(): React.JSX.Element {
    const [api, setApi] = useState<DockviewApi | null>(null)
    const [pluginsReady, setPluginsReady] = useState(false)
    const [, setRevision] = useState(0)
    const [openPanelIds, setOpenPanelIds] = useState<Set<string>>(new Set())
    const [modal, setModal] = useState<string | null>(null)
    const [palette, setPalette] = useState(false)
    const [activeId, setActiveId] = useState<string | null>(null)
    const isModal = (id: string): boolean =>
        getRegisteredPanels().some((panel) => panel.descriptor.id === id && panel.descriptor.modal)

    useEffect(() => {
        const unsubscribe = onRegistryChange(() => setRevision((r) => r + 1))
        void loadApps()
        loadPlugins().finally(() => setPluginsReady(true))
        return unsubscribe
    }, [])

    const refreshOpenPanels = useCallback((dockApi: DockviewApi) => {
        setOpenPanelIds(new Set(dockApi.panels.map((panel) => basePanelId(panel.id))))
    }, [])

    const handleReady = useCallback(
        (dockApi: DockviewApi) => {
            ;(window as { __dockApi?: DockviewApi }).__dockApi = dockApi
            setApi(dockApi)
            /*
             * A restored layout carries the titles it was saved with, so a panel that has since
             * been renamed keeps the old name on its tab for as long as that layout survives —
             * a name nobody chose, on the one surface that says what a panel is. The plugin's
             * descriptor is the authority, and a panel whose plugin is no longer installed goes.
             */
            for (const panel of [...dockApi.panels]) {
                const base = basePanelId(panel.id)
                const descriptor = getRegisteredPanels().find((p) => p.descriptor.id === base)
                if (!descriptor || descriptor.descriptor.modal) {
                    dockApi.removePanel(panel)
                } else if (panel.title !== descriptor.descriptor.title) {
                    panel.api.setTitle(descriptor.descriptor.title)
                }
            }
            refreshOpenPanels(dockApi)
            dockApi.onDidAddPanel(() => refreshOpenPanels(dockApi))
            dockApi.onDidRemovePanel(() => refreshOpenPanels(dockApi))
            setActiveId(dockApi.activePanel ? basePanelId(dockApi.activePanel.id) : null)
            dockApi.onDidActivePanelChange(({ panel }) => {
                const id = panel ? basePanelId(panel.id) : null
                setActiveId(id)
                if (id) touchApp(id)
            })
        },
        [refreshOpenPanels]
    )

    const place = useCallback(
        (id: string) => {
            if (!api) return
            const registered = getRegisteredPanels().find(
                (panel) => panel.descriptor.id === id
            )
            if (!registered) return
            /*
             * A panel that names its width opens as a column of that width at the right, when there
             * is something already open to stand beside; otherwise dockview gives it a share.
             */
            const width = registered.descriptor.width
            api.addPanel({
                id,
                component: 'plugin-panel',
                title: registered.descriptor.title,
                ...(width && api.panels.length > 0
                    ? { position: { direction: 'right' as const }, initialWidth: width }
                    : {}),
                ...panelRenderer(registered.descriptor)
            })
        },
        [api]
    )

    const handleOpen = useCallback(
        (id: string, instanceId?: string | null): string | undefined => {
            if (!api) return undefined
            if (isModal(id)) {
                setModal(id)
                touchApp(id)
                return id
            }
            const chosen = instanceId ? api.getPanel(instanceId) : undefined
            if (chosen) {
                chosen.api.setActive()
                return chosen.id
            }
            const instances = api.panels.filter((panel) => basePanelId(panel.id) === id)
            const registered = getRegisteredPanels().find((panel) => panel.descriptor.id === id)
            if (instances.length === 0) {
                place(id)
                return api.getPanel(id)?.id
            }
            if (instanceId !== null || !registered?.descriptor.duplicable) {
                instances[0].api.setActive()
                return instances[0].id
            }
            const active = api.activePanel
            const beside = active && basePanelId(active.id) === id ? active : instances[0]
            let n = 2
            while (api.getPanel(`${id}#${n}`)) n++
            return api.addPanel({
                id: `${id}#${n}`,
                component: 'plugin-panel',
                title: registered.descriptor.title,
                position: { referencePanel: beside.id, direction: 'within' },
                ...panelRenderer(registered.descriptor)
            }).id
        },
        [api, place]
    )

    useEffect(() => {
        if (!api) return
        return installShortcuts(api, {
            openPanel: handleOpen,
            togglePalette: () => setPalette((open) => !open)
        })
    }, [api, handleOpen])

    useEffect(() => {
        if (!api) return
        return installOpeners(handleOpen)
    }, [api, handleOpen])

    return (
        <div className="shell">
            <div className="shell-top" inert={palette}>
                <TopBar palette={palette} onLauncher={() => setPalette((open) => !open)} />
            </div>
            <div className="shell-body" inert={modal !== null || palette}>
                {pluginsReady ? (
                    <DockLayout onReady={handleReady} onOpen={handleOpen} />
                ) : (
                    <div className="dya-loading shell-loading" role="status" aria-label="Loading">
                        <span className="dya-carved">Dyarchia desktop</span>
                        <span className="dya-ring dya-ring--busy" />
                    </div>
                )}
            </div>
            {modal && (
                <div className="shell-top" inert={palette}>
                    <ModalPanel key={modal} id={modal} onClose={() => setModal(null)} />
                </div>
            )}
            {palette && (
                <Palette
                    panels={getRegisteredPanels().map((panel) => panel.descriptor)}
                    openIds={modal ? new Set([...openPanelIds, modal]) : openPanelIds}
                    activeOwner={getPanel(modal ?? activeId ?? '')?.descriptor.owner ?? null}
                    onOpen={handleOpen}
                    onClose={() => setPalette(false)}
                />
            )}
            <Notices />
        </div>
    )
}
