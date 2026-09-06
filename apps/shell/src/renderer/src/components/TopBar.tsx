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
const CLOSE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg>'

function PanelIcon({ icon }: { icon: string }): React.JSX.Element {
    if (icon.trim().startsWith('<svg')) {
        return <span className="topbar-icon" dangerouslySetInnerHTML={{ __html: icon }} />
    }
    return <span className="topbar-icon-text">{icon}</span>
}

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
    return (
        <div className="dya-bar dya-bar--flush topbar">
            <span className="dya-brand">dyarchia</span>
            <div className="topbar-right">
                <div className="topbar-actions">
                    {panels.map((panel) => (
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
