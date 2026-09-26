import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { PanelDescriptor } from '../panels/registry'
import { Svg } from './Svg'

interface TopBarProps {
    panels: PanelDescriptor[]
    openPanelIds: Set<string>
    onToggle: (id: string) => void
}

const MINIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2" y1="6" x2="10" y2="6"/></svg>'
const MAXIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>'
const OVERFLOW_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
const CLOSE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg>'

function PanelIcon({ icon, hue }: { icon: string; hue?: string }): React.JSX.Element {
    const tint = hue ? ` dya-hue--${hue}` : ''
    if (icon.trim().startsWith('<svg')) {
        return <Svg className={`topbar-icon${tint}`} svg={icon} />
    }
    return <span className={`topbar-icon-text${tint}`}>{icon}</span>
}

/*
 * An icon with nothing but a `title` is a control whose name arrives a second late, in the
 * operating system's own tooltip, in a font that belongs to nothing here. Every icon-only control
 * in this bar is a key with an accessible name and a hint popover the browser anchors to it —
 * native in this Chromium, no library and no positioning code.
 */
interface KeyProps {
    label: string
    active?: boolean
    className?: string
    onClick: () => void
    children: React.ReactNode
    expanded?: boolean
}

function TipKey({
    label,
    active,
    className,
    onClick,
    children,
    expanded
}: KeyProps): React.JSX.Element {
    const id = `tip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    return (
        <>
            <button
                className={`${className ?? 'dya-key'}${active ? ' dya-key--active' : ''}`}
                aria-label={label}
                aria-pressed={expanded === undefined ? active : undefined}
                aria-haspopup={expanded === undefined ? undefined : 'menu'}
                aria-expanded={expanded}
                interestfor={id}
                onClick={onClick}
            >
                {children}
            </button>
            <div className="dya-tip" popover="hint" id={id}>
                {label}
            </div>
        </>
    )
}

type UpdatePhase =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'current'
    | 'failed'
    | 'unsupported'

interface UpdateState {
    phase: UpdatePhase
    running: string
    version: string | null
    percent: number
    note: string | null
}

/*
 * The build, and what can be done about it, in one place: the version was already stated here and
 * an update is a fact about that version. The control exists only in the three states that have
 * something to press -- there is no idle Check for updates button, because a bar that offers an
 * action with no answer to give is how six of them end up along one edge saying nothing.
 *
 * A check that failed does not take the bar. It is a background request to a service that may
 * simply be unreachable, so it goes into the tip on the version, where somebody wondering why
 * nothing has offered itself can read what happened.
 */
function Build(): React.JSX.Element {
    const [update, setUpdate] = useState<UpdateState | null>(null)
    const id = `tip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

    useEffect(() => {
        const bridge = window.dyarchia
        if (!bridge) return
        void bridge.invoke('shell:update:state').then((state) => setUpdate(state as UpdateState))
        return bridge.on('shell:update', (raw: unknown) => setUpdate(raw as UpdateState))
    }, [])

    const act = useCallback((channel: string) => {
        void window.dyarchia?.invoke(channel)
    }, [])

    const phase = update?.phase ?? 'idle'
    const failure = phase === 'failed' ? update?.note : null
    const tip = failure
        ? `Alpha build. Last check for a newer one: ${failure}.`
        : 'Alpha build. Expect breakage, and do not keep anything here you cannot lose.'

    return (
        <div className="topbar-build">
            <span className="dya-tag topbar-alpha" interestfor={id}>
                {__DYARCHIA_VERSION__}
            </span>
            <div className="dya-tip" popover="hint" id={id}>
                {tip}
            </div>
            {phase === 'available' && (
                <button
                    className="dya-button dya-button--sm topbar-update"
                    onClick={() => act('shell:update:download')}
                >
                    Update to {update?.version}
                </button>
            )}
            {phase === 'downloading' && (
                <button className="dya-button dya-button--sm topbar-update" disabled>
                    Downloading {update?.percent ?? 0}%
                </button>
            )}
            {phase === 'ready' && (
                <button
                    className="dya-button dya-button--success dya-button--sm topbar-update"
                    onClick={() => act('shell:update:install')}
                >
                    Restart to finish
                </button>
            )}
        </div>
    )
}

/*
 * How many panels get their own key before the rest go behind the overflow. Six is every plugin
 * this application ships, which is the point: on the installation it was built for, nothing is one
 * click further away than anything else. The menu is there for the machine that adds more.
 */
const VISIBLE_TOGGLES = 6

function windowAction(action: string): void {
    void window.dyarchia?.invoke(`shell:window:${action}`)
}

export function TopBar({
    panels,
    openPanelIds,
    onToggle
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
            <span className="dya-brand">Dyarchia</span>
            <Build />
            <div className="topbar-right">
                <div className="topbar-actions">
                    {visible.map((panel) => (
                        <TipKey
                            key={panel.id}
                            label={panel.title}
                            className={panel.hue ? `dya-key dya-hue--${panel.hue}` : undefined}
                            active={openPanelIds.has(panel.id)}
                            onClick={() => onToggle(panel.id)}
                        >
                            <PanelIcon icon={panel.icon} />
                        </TipKey>
                    ))}
                    {overflow.length > 0 && (
                        <div className="topbar-overflow" ref={overflowRef}>
                            <TipKey
                                label="More panels"
                                active={overflowHasOpen}
                                expanded={menuOpen}
                                onClick={() => setMenuOpen((open) => !open)}
                            >
                                <span
                                    className="topbar-icon"
                                    dangerouslySetInnerHTML={{ __html: OVERFLOW_ICON }}
                                />
                            </TipKey>
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
                                            <PanelIcon icon={panel.icon} hue={panel.hue} />
                                            {panel.title}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="topbar-window-controls">
                    <button
                        className="topbar-winbtn"
                        aria-label="Minimize"
                        onClick={() => windowAction('minimize')}
                        dangerouslySetInnerHTML={{ __html: MINIMIZE_ICON }}
                    />
                    <button
                        className="topbar-winbtn"
                        aria-label="Maximize"
                        onClick={() => windowAction('toggle-maximize')}
                        dangerouslySetInnerHTML={{ __html: MAXIMIZE_ICON }}
                    />
                    <button
                        className="topbar-winbtn topbar-winbtn-close"
                        aria-label="Close"
                        onClick={() => windowAction('close')}
                        dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                    />
                </div>
            </div>
        </div>
    )
}
