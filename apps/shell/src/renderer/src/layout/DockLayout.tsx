import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DockviewReact, themeAbyssSpaced } from 'dockview-react'
import { glyph } from '@dyarchia/sdk'
import type {
    DockviewApi,
    DockviewReadyEvent,
    DockviewTheme,
    IDockviewHeaderActionsProps,
    IDockviewPanelHeaderProps,
    SerializedDockview
} from 'dockview-react'
import { Launcher } from '../components/Launcher'
import { Svg } from '../components/Svg'
import { Tip, useTipId } from '../components/Tip'
import { PluginPanel } from '../panels/PluginPanel'
import {
    basePanelId,
    getPanel,
    getRegisteredPanels,
    getTabIcon,
    getToolbar,
    onTabIconChange,
    onToolbarChange,
    panelRenderer
} from '../panels/registry'

const dyarchiaTheme: DockviewTheme = {
    ...themeAbyssSpaced,
    name: 'dyarchia',
    gap: 12,
    tabGroupIndicator: 'none'
}

const ANOTHER_ICON = glyph('add')
const CLOSE_ICON = glyph('close')

const titleListeners = new Set<() => void>()

function titlesChanged(): void {
    for (const listener of titleListeners) listener()
}

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
        const naming = props.api.onDidTitleChange((event) => {
            setTitle(event.title)
            titlesChanged()
        })
        return () => {
            activity.dispose()
            naming.dispose()
        }
    }, [props.api])

    const [, setRevision] = useState(0)
    useEffect(() => {
        const bump = (): void => setRevision((value) => value + 1)
        titleListeners.add(bump)
        const added = props.containerApi.onDidAddPanel(bump)
        const removed = props.containerApi.onDidRemovePanel(bump)
        return () => {
            titleListeners.delete(bump)
            added.dispose()
            removed.dispose()
        }
    }, [props.containerApi])

    const base = basePanelId(props.api.id)
    const twins = props.containerApi.panels.filter(
        (panel) => basePanelId(panel.id) === base && panel.title === title
    )
    const place = twins.findIndex((panel) => panel.id === props.api.id)
    const shown = place > 0 ? `${title} ${place + 1}` : title

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
    const anotherTip = useTipId()
    const closeTip = useTipId()
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
            <span className="panel-tab-title">{shown}</span>
            <span className="panel-tab-actions">
                {!descriptor?.duplicable && <span className="panel-tab-slot" aria-hidden="true" />}
                <span className="dya-join">
                    {descriptor?.duplicable && (
                        <button
                            className="dya-tab__action"
                            aria-label={`Another ${descriptor.title}`}
                            interestfor={anotherTip}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation()
                                another()
                            }}
                            dangerouslySetInnerHTML={{ __html: ANOTHER_ICON }}
                        />
                    )}
                    <button
                        className="dya-tab__action dya-tab__action--close"
                        aria-label={`Close ${shown}`}
                        interestfor={closeTip}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation()
                            props.api.close()
                        }}
                        dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                    />
                </span>
                {descriptor?.duplicable && <Tip id={anotherTip} label="Another" />}
                <Tip id={closeTip} label="Close" />
            </span>
        </div>
    )
}

/*
 * The open panel's own actions, at the right of its group's tab row. The element belongs to the
 * panel and is only lent to the header: it moves here when its panel becomes the group's open tab
 * and leaves when another does, keeping its state and its listeners.
 */
function PanelToolbar(props: IDockviewHeaderActionsProps): React.JSX.Element {
    const host = useRef<HTMLDivElement>(null)
    const [revision, setRevision] = useState(0)
    const active = props.activePanel?.id

    useEffect(() => onToolbarChange(() => setRevision((value) => value + 1)), [])

    useEffect(() => {
        const element = active ? getToolbar(active) : undefined
        host.current?.replaceChildren(...(element ? [element] : []))
    }, [active, revision])

    return <div ref={host} className="panel-toolbar-host" />
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
            rightHeaderActionsComponent={PanelToolbar}
            watermarkComponent={watermark}
            onReady={handleReady}
        />
    )
}
