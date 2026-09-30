import { useCallback, useEffect, useRef, useState } from 'react'
import { glyph } from '@dyarchia/sdk'
import { getPanel } from '../panels/registry'
import { Tip, useTipId } from './Tip'

const LIFE_MS = 10_000
const KEEP = 4
const CLOSE_ICON = glyph('close')

interface Notice {
    pluginId: string
    title: string
    body: string
    action?: unknown
}

interface Shown extends Notice {
    key: number
}

export function Notices(): React.JSX.Element {
    const [shown, setShown] = useState<Shown[]>([])
    const next = useRef(0)

    const drop = useCallback((key: number) => {
        setShown((held) => held.filter((notice) => notice.key !== key))
    }, [])

    useEffect(() => {
        const bridge = window.dyarchia
        if (!bridge) return

        return bridge.on('shell:notice', (raw: unknown) => {
            const notice = raw as Notice
            if (!notice?.title) return
            next.current += 1
            const key = next.current
            setShown((held) => [...held, { ...notice, key }].slice(-KEEP))
            window.setTimeout(() => drop(key), LIFE_MS)
        })
    }, [drop])

    const activate = useCallback(
        (notice: Shown) => {
            void window.dyarchia?.invoke('shell:notice:activate', {
                pluginId: notice.pluginId,
                title: notice.title,
                body: notice.body,
                action: notice.action
            })
            drop(notice.key)
        },
        [drop]
    )

    if (!shown.length) return <></>

    return (
        <div className="notices">
            {shown.map((notice) => (
                <NoticeCard
                    key={notice.key}
                    notice={notice}
                    onActivate={() => activate(notice)}
                    onDrop={() => drop(notice.key)}
                />
            ))}
        </div>
    )
}

interface NoticeCardProps {
    notice: Shown
    onActivate: () => void
    onDrop: () => void
}

function NoticeCard({ notice, onActivate, onDrop }: NoticeCardProps): React.JSX.Element {
    const tip = useTipId()
    const from = getPanel(notice.pluginId)?.descriptor.title
    return (
        <div className="dya-card dya-notice">
            <button type="button" className="dya-notice__body" onClick={onActivate}>
                {from ? <span className="dya-label">{from}</span> : null}
                <span className="dya-notice__title">{notice.title}</span>
                {notice.body ? <span className="dya-notice__text">{notice.body}</span> : null}
            </button>
            <button
                type="button"
                className="dya-key notice-close"
                aria-label="Close"
                interestfor={tip}
                onClick={onDrop}
                dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
            />
            <Tip id={tip} label="Close" />
        </div>
    )
}
