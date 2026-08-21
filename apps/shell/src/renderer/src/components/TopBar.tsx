import { useEffect, useState } from 'react'
import { getTheme, onThemeChange } from '@dyarchia/ui'
import type { ThemeName } from '@dyarchia/ui'
import { toggleTheme } from '../theme'
import type { PanelDescriptor } from '../panels/registry'

interface TopBarProps {
    panels: PanelDescriptor[]
    openPanelIds: Set<string>
    onToggle: (id: string) => void
}

const MINIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2" y1="6" x2="10" y2="6"/></svg>'
const MAXIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>'
const CLOSE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg>'
const DARK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
const LIGHT_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/></svg>'

function PanelIcon({ icon }: { icon: string }): React.JSX.Element {
    if (icon.trim().startsWith('<svg')) {
        return <span className="topbar-icon" dangerouslySetInnerHTML={{ __html: icon }} />
    }
    return <span className="topbar-icon-text">{icon}</span>
}

function windowAction(action: string): void {
    void window.dyarchia?.invoke(`shell:window:${action}`)
}

export function TopBar({ panels, openPanelIds, onToggle }: TopBarProps): React.JSX.Element {
    const [theme, setThemeState] = useState<ThemeName>(getTheme)

    useEffect(() => onThemeChange(setThemeState), [])

    return (
        <div className="topbar">
            <div className="topbar-title">dyarchia</div>
            <div className="topbar-right">
                <div className="topbar-actions">
                    {panels.map((panel) => (
                        <button
                            key={panel.id}
                            className={
                                openPanelIds.has(panel.id)
                                    ? 'topbar-toggle topbar-toggle-active'
                                    : 'topbar-toggle'
                            }
                            title={panel.title}
                            onClick={() => onToggle(panel.id)}
                        >
                            <PanelIcon icon={panel.icon} />
                        </button>
                    ))}
                </div>
                <div className="topbar-divider" />
                <div className="topbar-actions">
                    <button
                        className="topbar-toggle"
                        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                        onClick={toggleTheme}
                    >
                        <PanelIcon icon={theme === 'dark' ? DARK_ICON : LIGHT_ICON} />
                    </button>
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
