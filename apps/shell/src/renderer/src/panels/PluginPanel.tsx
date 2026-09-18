import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { getPanel } from './registry'

export function PluginPanel(props: IDockviewPanelProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const registered = getPanel(props.api.id)
        const container = containerRef.current
        if (!registered || !container) return
        const dispose = registered.mount(container, {
            instanceId: props.api.id,
            close: () => props.api.close()
        })
        return () => {
            dispose?.()
            container.replaceChildren()
        }
    }, [props.api.id])

    return <div ref={containerRef} className="dya-pane plugin-panel-container" />
}
