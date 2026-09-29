import { useEffect, useRef, useState } from 'react'
import { glyph } from '@dyarchia/sdk'
import { Svg } from '../components/Svg'
import { Tip, useTipId } from '../components/Tip'
import { getPanel, setToolbar } from './registry'

const CLOSE_ICON = glyph('close')

interface ModalPanelProps {
    id: string
    onClose: () => void
}

/*
 * A panel that is visited rather than worked in, such as Setup, opens over the window instead of
 * taking a place in the dock: a scrim and the rest of the window inert behind it, its name, its
 * own actions and a close key at the top, and Escape or a click outside to leave. It is the same
 * mount a docked panel gets, so the plugin cannot tell the difference.
 */
export function ModalPanel({ id, onClose }: ModalPanelProps): React.JSX.Element | null {
    const body = useRef<HTMLDivElement>(null)
    const tools = useRef<HTMLDivElement>(null)
    const registered = getPanel(id)
    const [title, setTitle] = useState(registered?.descriptor.title ?? '')
    const closeTip = useTipId()

    useEffect(() => {
        const container = body.current
        if (!registered || !container) return
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const toolbar = document.createElement('div')
        toolbar.className = 'dya-toolbar panel-toolbar'
        tools.current?.replaceChildren(toolbar)
        setToolbar(id, toolbar)
        const dispose = registered.mount(container, {
            instanceId: id,
            toolbar,
            close: onClose,
            setTitle: (next) => setTitle(next ?? registered.descriptor.title)
        })
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !event.defaultPrevented) onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            setToolbar(id, null)
            dispose?.()
            container.replaceChildren()
            opener?.focus()
        }
    }, [id])

    if (!registered) return null

    return (
        <>
            <div className="dya-scrim shell-modal-scrim" onClick={onClose} />
            <section
                className="dya-sheet dya-sheet--modal shell-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <header className="dya-sheet__head">
                    <Svg className="dya-glyph shell-modal-mark" svg={registered.descriptor.icon} />
                    <span className="dya-title">{title}</span>
                    <div className="dya-sheet__end">
                        <div ref={tools} />
                        <button
                            type="button"
                            className="dya-key"
                            aria-label="Close"
                            interestfor={closeTip}
                            onClick={onClose}
                            dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                        />
                    </div>
                    <Tip id={closeTip} label="Close" />
                </header>
                <div ref={body} className="dya-pane shell-modal-body" />
            </section>
        </>
    )
}
