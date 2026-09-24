import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DockviewReact, themeAbyssSpaced } from 'dockview-react'
import type {
    DockviewApi,
    DockviewReadyEvent,
    DockviewTheme,
    IDockviewHeaderActionsProps,
    IDockviewPanelHeaderProps,
    SerializedDockview
} from 'dockview-react'
import { Launcher } from '../components/Launcher'
import { PluginPanel } from '../panels/PluginPanel'
import { basePanelId, getPanel, getRegisteredPanels } from '../panels/registry'

const dyarchiaTheme: DockviewTheme = {
    ...themeAbyssSpaced,
    name: 'dyarchia',
    gap: 12,
    tabGroupIndicator: 'none'
}

const DUPLICATE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
const CLOSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'

function PanelTab(props: IDockviewPanelHeaderProps): React.JSX.Element {
    const [active, setActive] = useState(props.api.isActive)

    useEffect(() => {
        const subscription = props.api.onDidActiveChange((event) => setActive(event.isActive))
        return () => subscription.dispose()
    }, [props.api])

    const hue = getPanel(props.api.id)?.descriptor.hue

    return (
        <div
            className={`dya-tab panel-tab${hue ? ` dya-pane--${hue}` : ''}`}
            role="tab"
            aria-selected={active}
        >
            {hue && <span className={`dya-dot dya-hue--${hue}`} />}
            {props.api.title}
        </div>
    )
}

function GroupActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
    const active = props.activePanel
    const descriptor = active ? getPanel(active.id)?.descriptor : undefined

    const duplicate = (): void => {
        if (!active || !descriptor?.duplicable) return
        const base = basePanelId(active.id)
        let n = 2
        while (props.containerApi.getPanel(`${base}#${n}`)) n++
        props.containerApi.addPanel({
            id: `${base}#${n}`,
            component: 'plugin-panel',
            title: descriptor.title,
            position: { referencePanel: active.id, direction: 'within' }
        })
    }

    return (
        <div className="group-actions">
            {descriptor?.duplicable && (
                <button
                    className="dya-key"
                    title={`New ${descriptor.title}`}
                    onClick={duplicate}
                    dangerouslySetInnerHTML={{ __html: DUPLICATE_ICON }}
                />
            )}
            {active && (
                <button
                    className="dya-key"
                    title="Close panel"
                    onClick={() => active.api.close()}
                    dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                />
            )}
        </div>
    )
}

interface DockLayoutProps {
    onReady: (api: DockviewApi) => void
    onOpen: (id: string) => void
}

export function DockLayout({ onReady, onOpen }: DockLayoutProps): React.JSX.Element {
    const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

    /*
     * dockview remounts the watermark whenever the component identity changes, so it is memoised
     * against the one thing it closes over. The registry is read at render rather than held in
     * state: every plugin has registered by the time this mounts, because the dock is not rendered
     * until the host has finished loading them.
     */
    const watermark = useMemo(
        () => () => <Launcher panels={getRegisteredPanels().map((p) => p.descriptor)} onOpen={onOpen} />,
        [onOpen]
    )

    const handleReady = useCallback(
        async (event: DockviewReadyEvent) => {
            const api = event.api
            const bridge = window.dyarchia
            if (bridge) {
                const saved = (await bridge.invoke('shell:layout:load')) as
                    | SerializedDockview
                    | null
                if (saved) {
                    try {
                        api.fromJSON(saved)
                    } catch {
                        api.clear()
                    }
                }
                api.onDidLayoutChange(() => {
                    clearTimeout(saveTimer.current)
                    saveTimer.current = setTimeout(() => {
                        void bridge.invoke('shell:layout:save', api.toJSON())
                    }, 500)
                })
            }
            onReady(api)
        },
        [onReady]
    )

    return (
        <DockviewReact
            className="dock-root"
            theme={dyarchiaTheme}
            components={{ 'plugin-panel': PluginPanel }}
            defaultTabComponent={PanelTab}
            watermarkComponent={watermark}
            rightHeaderActionsComponent={GroupActions}
            onReady={handleReady}
        />
    )
}
