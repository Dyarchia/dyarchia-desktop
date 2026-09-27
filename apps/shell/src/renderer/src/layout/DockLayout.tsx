import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DockviewReact, themeAbyssSpaced } from 'dockview-react'
import type {
    DockviewApi,
    DockviewReadyEvent,
    DockviewTheme,
    IDockviewPanelHeaderProps,
    SerializedDockview
} from 'dockview-react'
import { Launcher } from '../components/Launcher'
import { Svg } from '../components/Svg'
import { PluginPanel } from '../panels/PluginPanel'
import {
    basePanelId,
    getPanel,
    getRegisteredPanels,
    getTabIcon,
    onTabIconChange,
    panelRenderer
} from '../panels/registry'

const dyarchiaTheme: DockviewTheme = {
    ...themeAbyssSpaced,
    name: 'dyarchia',
    gap: 12,
    tabGroupIndicator: 'none'
}

const ANOTHER_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
const CLOSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'

function PanelTab(props: IDockviewPanelHeaderProps): React.JSX.Element {
    /*
     * A tab is selected when its panel is the one its group is showing, not when it has the focus.
     * Following the focus left every group but one with no tab marked open, so in a split window
     * the only way to learn which panel a group was showing was to read the panel.
     */
    const [active, setActive] = useState(props.api.isVisible)
    const [title, setTitle] = useState(props.api.title)

    useEffect(() => {
        const activity = props.api.onDidVisibilityChange((event) => setActive(event.isVisible))
        const naming = props.api.onDidTitleChange((event) => setTitle(event.title))
        return () => {
            activity.dispose()
            naming.dispose()
        }
    }, [props.api])

    const [mark, setMark] = useState(() => getTabIcon(props.api.id))
    useEffect(
        () =>
            onTabIconChange((instanceId) => {
                if (instanceId === props.api.id) setMark(getTabIcon(instanceId))
            }),
        [props.api.id]
    )

    const descriptor = getPanel(props.api.id)?.descriptor
    const icon = mark ?? descriptor?.icon
    const glyph = mark ? 'dya-glyph dya-glyph--mark' : 'dya-glyph'

    /*
     * What a tab can do to itself sits on the tab: another like it, for a panel that can have more
     * than one, and close. Both were a window apart once, at the far end of the header, acting on
     * whichever tab happened to be open. Another is a fresh instance under the plugin's own name,
     * never a copy of what this one is showing: a CLI tab running claude makes another plain CLI.
     * A press on either is kept from the tab so it does not start a drag or select the tab. Only
     * the open tab carries them; any tab closes with the middle button, whose press is kept from
     * starting Chromium's autoscroll.
     */
    const another = (): void => {
        if (!descriptor) return
        const base = basePanelId(props.api.id)
        let n = 2
        while (props.containerApi.getPanel(`${base}#${n}`)) n++
        props.containerApi.addPanel({
            id: `${base}#${n}`,
            component: 'plugin-panel',
            title: descriptor.title,
            position: { referencePanel: props.api.id, direction: 'within' },
            ...panelRenderer(descriptor)
        })
    }

    return (
        <div
            className="dya-tab dya-tab--dock panel-tab"
            role="tab"
            aria-selected={active}
            onPointerDown={(event) => {
                if (event.button === 1) event.preventDefault()
            }}
            onAuxClick={(event) => {
                if (event.button !== 1) return
                event.stopPropagation()
                props.api.close()
            }}
        >
            {icon && <Svg className={glyph} svg={icon} />}
            {title}
            <span className="panel-tab-actions">
                {descriptor?.duplicable ? (
                    <button
                        className="dya-tab__action"
                        title={`Another ${descriptor.title}`}
                        aria-label={`Another ${descriptor.title}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation()
                            another()
                        }}
                        dangerouslySetInnerHTML={{ __html: ANOTHER_ICON }}
                    />
                ) : (
                    <span className="panel-tab-slot" aria-hidden="true" />
                )}
                <button
                    className="dya-tab__action dya-tab__action--close"
                    title={`Close ${title}`}
                    aria-label={`Close ${title}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation()
                        props.api.close()
                    }}
                    dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                />
            </span>
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
            onReady={handleReady}
        />
    )
}
