import type { PanelDescriptor } from '../panels/registry'

/*
 * What the window shows when nothing is open in it.
 *
 * This replaces a watermark that read "Open a panel from the title bar", which is the shape every
 * empty state in this application had: a sentence, centred in a void, describing the absence and
 * pointing at a row of unlabelled icons somewhere else. It is also the first screen anybody sees,
 * and it was the reason the application looked like it did not want to be used.
 *
 * A tile per panel instead — the icon, the name, and the one line the plugin declares about what
 * it is for. Nothing here knows any plugin: the registry is whatever loaded, so a panel added
 * tomorrow appears without this file changing, and an installation that turned everything off
 * still gets Setup.
 *
 * The word is the only thing above the tiles. There was a sentence under it explaining that the
 * window is made of panels, which is a thing the screen is already showing: six of them, named,
 * waiting to be clicked.
 */

interface LauncherProps {
    panels: PanelDescriptor[]
    onOpen: (id: string) => void
}

export function Launcher({ panels, onOpen }: LauncherProps): React.JSX.Element {
    return (
        <div className="launcher">
            <div className="launcher-head">
                <span className="dya-carved">dyarchia</span>
            </div>
            <div className="launcher-grid">
                {panels.map((panel) => (
                    <button
                        key={panel.id}
                        className="dya-tile launcher-tile"
                        onClick={() => onOpen(panel.id)}
                    >
                        {panel.icon.trim().startsWith('<svg') ? (
                            <span
                                className="dya-tile__icon"
                                dangerouslySetInnerHTML={{ __html: panel.icon }}
                            />
                        ) : (
                            <span className="dya-tile__name">{panel.icon}</span>
                        )}
                        <span className="dya-tile__name">{panel.title}</span>
                        {panel.note && <span className="dya-tile__note">{panel.note}</span>}
                    </button>
                ))}
            </div>
        </div>
    )
}
