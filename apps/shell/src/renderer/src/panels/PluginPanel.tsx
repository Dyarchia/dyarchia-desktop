import { useEffect, useRef, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { getPanel, setTabIcon, setToolbar } from './registry'

/*
 * A plugin whose panel cannot be drawn, because it is gone or its mount threw, gets one word in its
 * place rather than a black pane that might be a slow one. The tab's own close is the way out.
 */
export function PluginPanel(props: IDockviewPanelProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)
    const registered = getPanel(props.api.id)
    const maxWidth = registered?.descriptor.maxWidth
    const [broken, setBroken] = useState(!registered)

    useEffect(() => {
        const container = containerRef.current
        if (!registered || !container) return
        const toolbar = document.createElement('div')
        toolbar.className = 'dya-toolbar panel-toolbar'
        setToolbar(props.api.id, toolbar)
        let dispose: (() => void) | void = undefined
        try {
            dispose = registered.mount(container, {
                instanceId: props.api.id,
                toolbar,
                close: () => props.api.close(),
                setTitle: (title, icon) => {
                    props.api.setTitle(title ?? registered.descriptor.title)
                    setTabIcon(props.api.id, title === null ? null : (icon ?? null))
                }
            })
        } catch (error) {
            console.error(`[shell] ${props.api.id} could not be drawn`, error)
            container.replaceChildren()
            setBroken(true)
        }
        return () => {
            setTabIcon(props.api.id, null)
            setToolbar(props.api.id, null)
            dispose?.()
            container.replaceChildren()
        }
    }, [props.api.id])

    if (broken) {
        return (
            <div className="dya-pane dya-empty plugin-panel-container">
                <span className="dya-title">Unavailable</span>
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className="dya-pane plugin-panel-container"
            style={maxWidth ? ({ '--panel-max': `${maxWidth}px` } as React.CSSProperties) : undefined}
        />
    )
}
