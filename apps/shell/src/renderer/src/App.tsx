import { useCallback, useEffect, useState } from 'react'
import type { DockviewApi } from 'dockview-react'
import { DockLayout } from './layout/DockLayout'
import { Notices } from './components/Notices'
import { TopBar } from './components/TopBar'
import { basePanelId, getRegisteredPanels, onRegistryChange } from './panels/registry'
import { loadPlugins } from './plugins/host'
import { applyTheme, readTheme } from './theme'
import { installShortcuts } from './shortcuts'

export function App(): React.JSX.Element {
    const [api, setApi] = useState<DockviewApi | null>(null)
    const [pluginsReady, setPluginsReady] = useState(false)
    const [, setRevision] = useState(0)
    const [openPanelIds, setOpenPanelIds] = useState<Set<string>>(new Set())
    const [theme, setTheme] = useState(readTheme)

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
            for (const panel of [...dockApi.panels]) {
                const base = basePanelId(panel.id)
                if (!getRegisteredPanels().some((p) => p.descriptor.id === base)) {
                    dockApi.removePanel(panel)
                }
            }
            refreshOpenPanels(dockApi)
            dockApi.onDidAddPanel(() => refreshOpenPanels(dockApi))
            dockApi.onDidRemovePanel(() => refreshOpenPanels(dockApi))
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

    const handleTheme = useCallback((id: string) => {
        applyTheme(id)
        setTheme(id)
    }, [])

    return (
        <div className="shell">
            <TopBar
                panels={getRegisteredPanels().map((panel) => panel.descriptor)}
                openPanelIds={openPanelIds}
                onToggle={handleToggle}
                theme={theme}
                onThemeChange={handleTheme}
            />
            <div className="shell-body">
                {pluginsReady ? (
                    <DockLayout onReady={handleReady} />
                ) : (
                    <div className="dya-loading shell-loading">
                        <span className="dya-brand">dyarchia</span>
                        <span>Loading plugins…</span>
                    </div>
                )}
            </div>
            <Notices />
        </div>
    )
}
