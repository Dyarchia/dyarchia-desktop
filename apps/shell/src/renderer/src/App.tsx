import { useCallback, useEffect, useState } from 'react'
import type { DockviewApi } from 'dockview-react'
import { DockLayout } from './layout/DockLayout'
import { Notices } from './components/Notices'
import { TopBar } from './components/TopBar'
import { basePanelId, getRegisteredPanels, onRegistryChange } from './panels/registry'
import { installOpeners } from './panels/openers'
import { loadPlugins } from './plugins/host'
import { installShortcuts } from './shortcuts'

export function App(): React.JSX.Element {
    const [api, setApi] = useState<DockviewApi | null>(null)
    const [pluginsReady, setPluginsReady] = useState(false)
    const [, setRevision] = useState(0)
    const [openPanelIds, setOpenPanelIds] = useState<Set<string>>(new Set())
    const [activePanelId, setActivePanelId] = useState<string | null>(null)

    useEffect(() => {
        const unsubscribe = onRegistryChange(() => setRevision((r) => r + 1))
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
                if (!descriptor) {
                    dockApi.removePanel(panel)
                } else if (panel.title !== descriptor.descriptor.title) {
                    panel.api.setTitle(descriptor.descriptor.title)
                }
            }
            refreshOpenPanels(dockApi)
            dockApi.onDidAddPanel(() => refreshOpenPanels(dockApi))
            dockApi.onDidRemovePanel(() => refreshOpenPanels(dockApi))
            setActivePanelId(dockApi.activePanel ? basePanelId(dockApi.activePanel.id) : null)
            dockApi.onDidActivePanelChange(({ panel }) =>
                setActivePanelId(panel ? basePanelId(panel.id) : null)
            )
        },
        [refreshOpenPanels]
    )

    const handleToggle = useCallback(
        (id: string) => {
            if (!api) return
            const instances = api.panels.filter((panel) => basePanelId(panel.id) === id)
            if (instances.length > 0) {
                for (const panel of instances) api.removePanel(panel)
                return
            }
            const registered = getRegisteredPanels().find(
                (panel) => panel.descriptor.id === id
            )
            if (!registered) return
            api.addPanel({
                id,
                component: 'plugin-panel',
                title: registered.descriptor.title
            })
        },
        [api]
    )

    const handleOpen = useCallback(
        (id: string) => {
            if (!api) return
            const instance = api.panels.find((panel) => basePanelId(panel.id) === id)
            if (instance) {
                instance.api.setActive()
                return
            }
            handleToggle(id)
        },
        [api, handleToggle]
    )

    useEffect(() => {
        if (!api) return
        return installShortcuts(api, { openPanel: handleOpen })
    }, [api, handleOpen])

    useEffect(() => {
        if (!api) return
        return installOpeners(handleOpen)
    }, [api, handleOpen])

    return (
        <div className="shell">
            <TopBar
                panels={getRegisteredPanels().map((panel) => panel.descriptor)}
                openPanelIds={openPanelIds}
                activePanelId={activePanelId}
                onToggle={handleToggle}
                wordmark={pluginsReady && openPanelIds.size > 0}
            />
            <div className="shell-body">
                {pluginsReady ? (
                    <DockLayout onReady={handleReady} onOpen={handleOpen} />
                ) : (
                    <div className="dya-loading shell-loading">
                        <span className="dya-carved">Dyarchia desktop</span>
                        <span>Loading plugins…</span>
                    </div>
                )}
            </div>
            <Notices />
        </div>
    )
}
