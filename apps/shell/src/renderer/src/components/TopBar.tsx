import { useEffect, useRef, useState } from 'react'
import type { PanelDescriptor } from '../panels/registry'
import { THEMES } from '../theme'

interface TopBarProps {
    panels: PanelDescriptor[]
    openPanelIds: Set<string>
    onToggle: (id: string) => void
    theme: string
    onThemeChange: (id: string) => void
}

const MINIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2" y1="6" x2="10" y2="6"/></svg>'
const MAXIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>'
const OVERFLOW_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
const CLOSE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg>'

function PanelIcon({ icon }: { icon: string }): React.JSX.Element {
    if (icon.trim().startsWith('<svg')) {
        return <span className="topbar-icon" dangerouslySetInnerHTML={{ __html: icon }} />
    }
    return <span className="topbar-icon-text">{icon}</span>
}

const VISIBLE_TOGGLES = 3

function windowAction(action: string): void {
    void window.dyarchia?.invoke(`shell:window:${action}`)
}

export function TopBar({
    panels,
    openPanelIds,
    onToggle,
    theme,
    onThemeChange
}: TopBarProps): React.JSX.Element {
    const [menuOpen, setMenuOpen] = useState(false)
    const overflowRef = useRef<HTMLDivElement>(null)

    const visible = panels.slice(0, VISIBLE_TOGGLES)
    const overflow = panels.slice(VISIBLE_TOGGLES)
    const overflowHasOpen = overflow.some((panel) => openPanelIds.has(panel.id))

    useEffect(() => {
        if (!menuOpen) return
        const onPointerDown = (event: PointerEvent): void => {
            if (!overflowRef.current?.contains(event.target as Node)) setMenuOpen(false)
        }
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') setMenuOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [menuOpen])

    useEffect(() => {
        if (overflow.length === 0) setMenuOpen(false)
    }, [overflow.length])

    return (
        <div className="dya-bar dya-bar--flush topbar">
            <span className="dya-brand">dyarchia</span>
            <div className="topbar-right">
                <div className="topbar-actions">
                    {visible.map((panel) => (
                        <button
                            key={panel.id}
                            className={
                                openPanelIds.has(panel.id) ? 'dya-key dya-key--active' : 'dya-key'
                            }
                            title={panel.title}
                            onClick={() => onToggle(panel.id)}
                        >
                            <PanelIcon icon={panel.icon} />
                        </button>
                    ))}
                    {overflow.length > 0 && (
                        <div className="topbar-overflow" ref={overflowRef}>
                            <button
                                className={
                                    overflowHasOpen ? 'dya-key dya-key--active' : 'dya-key'
                                }
                                title="More panels"
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                onClick={() => setMenuOpen((open) => !open)}
                            >
                                <span
                                    className="topbar-icon"
                                    dangerouslySetInnerHTML={{ __html: OVERFLOW_ICON }}
                                />
                            </button>
                            {menuOpen && (
                                <div className="dya-menu topbar-menu" role="menu">
                                    {overflow.map((panel) => (
                                        <button
                                            key={panel.id}
                                            className={
                                                openPanelIds.has(panel.id)
                                                    ? 'dya-menu__item dya-menu__item--selected'
                                                    : 'dya-menu__item'
                                            }
                                            role="menuitem"
                                            onClick={() => {
                                                onToggle(panel.id)
                                                setMenuOpen(false)
                                            }}
                                        >
                                            <PanelIcon icon={panel.icon} />
                                            {panel.title}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="topbar-themes" role="group" aria-label="Theme">
                    {THEMES.map((entry) => (
                        <button
                            key={entry.id}
                            className={
                                entry.id === theme ? 'dya-key dya-key--active' : 'dya-key'
                            }
                            title={entry.label}
                            aria-pressed={entry.id === theme}
                            onClick={() => onThemeChange(entry.id)}
                        >
                            <span
                                className="topbar-icon"
                                dangerouslySetInnerHTML={{ __html: entry.icon }}
                            />
                        </button>
                    ))}
                </div>
                <div className="topbar-window-controls">
                    <button
                        className="topbar-winbtn"
                        title="Minimize"
                        onClick={() => windowAction('minimize')}
                        dangerouslySetInnerHTML={{ __html: MINIMIZE_ICON }}
                    />
                    <button
                        className="topbar-winbtn"
                        title="Maximize"
                        onClick={() => windowAction('toggle-maximize')}
                        dangerouslySetInnerHTML={{ __html: MAXIMIZE_ICON }}
                    />
                    <button
                        className="topbar-winbtn topbar-winbtn-close"
                        title="Close"
                        onClick={() => windowAction('close')}
                        dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                    />
                </div>
            </div>
        </div>
    )
}
