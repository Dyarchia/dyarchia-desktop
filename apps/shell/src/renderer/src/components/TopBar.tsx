import { useEffect, useState } from 'react'
import { glyph } from '@dyarchia/sdk'
import { registerCommand } from '../commands'
import { Tip, useTipId } from './Tip'

interface TopBarProps {
    palette: boolean
    onLauncher: () => void
}

const LAUNCHER_ICON = glyph('launcher')

const MINIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2" y1="6" x2="10" y2="6"/></svg>'
const MAXIMIZE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>'
const CLOSE_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg>'

function LauncherKey({ active, onClick }: { active: boolean; onClick: () => void }): React.JSX.Element {
    const id = useTipId()
    return (
        <>
            <button
                className={`dya-key${active ? ' dya-key--active' : ''}`}
                aria-label="Apps"
                aria-haspopup="dialog"
                aria-expanded={active}
                interestfor={id}
                onClick={onClick}
                dangerouslySetInnerHTML={{ __html: LAUNCHER_ICON }}
            />
            <Tip id={id} label="Apps" />
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
    checkedAt: number | null
}

function act(channel: string): void {
    void window.dyarchia?.invoke(channel)
}

function Build(): React.JSX.Element {
    const [update, setUpdate] = useState<UpdateState | null>(null)

    useEffect(() => {
        const bridge = window.dyarchia
        if (!bridge) return
        void bridge.invoke('shell:update:state').then((state) => setUpdate(state as UpdateState))
        return bridge.on('shell:update', (raw: unknown) => setUpdate(raw as UpdateState))
    }, [])

    const phase = update?.phase ?? 'idle'
    const [asked, setAsked] = useState(false)
    const [told, setTold] = useState(false)
    const checkable = update !== null && phase !== 'unsupported'

    const check = (): void => {
        setAsked(true)
        setTold(false)
        act('shell:update:check')
    }

    useEffect(() => {
        if (!checkable) return
        return registerCommand({ id: 'shell:update-check', title: 'Check for updates', run: check })
    }, [checkable])

    useEffect(() => {
        if (!asked || phase === 'checking') return
        setAsked(false)
        setTold(phase === 'current')
    }, [asked, phase])

    if (phase === 'available') {
        return (
            <button className="dya-button topbar-update" onClick={() => act('shell:update:download')}>
                Update to {update?.version}
            </button>
        )
    }
    if (phase === 'downloading') {
        return (
            <button className="dya-button topbar-update" disabled>
                Downloading {update?.percent ?? 0}%
            </button>
        )
    }
    if (phase === 'ready') {
        return (
            <button
                className="dya-button dya-button--primary topbar-update"
                onClick={() => act('shell:update:install')}
            >
                Restart to finish
            </button>
        )
    }
    if (phase === 'failed') {
        return (
            <>
                <span className="dya-mono">{__DYARCHIA_VERSION__}</span>
                <button className="dya-button topbar-update" onClick={check}>
                    <span className="dya-light dya-light--warning" />
                    Retry update
                </button>
            </>
        )
    }
    return (
        <>
            <span className="dya-mono">{__DYARCHIA_VERSION__}</span>
            {asked && phase === 'checking' && <span className="dya-key-label">checking…</span>}
            {told && (
                <span
                    className="dya-key-label dya-key-label--leave"
                    onAnimationEnd={() => setTold(false)}
                >
                    up to date
                </span>
            )}
        </>
    )
}

function windowAction(action: string): void {
    void window.dyarchia?.invoke(`shell:window:${action}`)
}

export function TopBar({ palette, onLauncher }: TopBarProps): React.JSX.Element {
    return (
        <div className="dya-bar dya-bar--flush topbar">
            <div className="dya-toolbar topbar-build">
                <Build />
            </div>
            <div className="topbar-right">
                <div className="dya-toolbar topbar-actions">
                    <LauncherKey active={palette} onClick={onLauncher} />
                </div>
                <div className="dya-join topbar-window-controls">
                    <button
                        className="dya-winkey"
                        aria-label="Minimize"
                        onClick={() => windowAction('minimize')}
                        dangerouslySetInnerHTML={{ __html: MINIMIZE_ICON }}
                    />
                    <button
                        className="dya-winkey"
                        aria-label="Maximize"
                        onClick={() => windowAction('toggle-maximize')}
                        dangerouslySetInnerHTML={{ __html: MAXIMIZE_ICON }}
                    />
                    <button
                        className="dya-winkey dya-winkey--close"
                        aria-label="Close"
                        onClick={() => windowAction('close')}
                        dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                    />
                </div>
            </div>
        </div>
    )
}
