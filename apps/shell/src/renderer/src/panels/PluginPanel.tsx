import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { getPanel, setTabIcon, setToolbar } from './registry'

export function PluginPanel(props: IDockviewPanelProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)
    const registered = getPanel(props.api.id)
    const maxWidth = registered?.descriptor.maxWidth

    useEffect(() => {
        const container = containerRef.current
        if (!registered || !container) return
        const toolbar = document.createElement('div')
        toolbar.className = 'dya-toolbar panel-toolbar'
        setToolbar(props.api.id, toolbar)
        const dispose = registered.mount(container, {
            instanceId: props.api.id,
            toolbar,
            close: () => props.api.close(),
            setTitle: (title, icon) => {
                props.api.setTitle(title ?? registered.descriptor.title)
                setTabIcon(props.api.id, title === null ? null : (icon ?? null))
            }
        })
        return () => {
            setTabIcon(props.api.id, null)
            setToolbar(props.api.id, null)
            dispose?.()
            container.replaceChildren()
        }
    }, [props.api.id])

    return (
        <div
            ref={containerRef}
            className="dya-pane plugin-panel-container"
            style={maxWidth ? ({ '--panel-max': `${maxWidth}px` } as React.CSSProperties) : undefined}
        />
    )
}
