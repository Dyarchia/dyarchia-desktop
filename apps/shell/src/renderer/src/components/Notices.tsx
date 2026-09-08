import { useCallback, useEffect, useRef, useState } from 'react'

const LIFE_MS = 10_000
const KEEP = 4

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
                <div className="dya-card notice" key={notice.key}>
                    <button
                        type="button"
                        className="notice-body"
                        onClick={() => activate(notice)}
                        title="open the plugin that sent this"
                    >
                        <span className="dya-label">{notice.pluginId}</span>
                        <span className="notice-title">{notice.title}</span>
                        {notice.body ? <span className="notice-text">{notice.body}</span> : null}
                    </button>
                    <button
                        type="button"
                        className="dya-key notice-close"
                        aria-label="dismiss"
                        onClick={() => drop(notice.key)}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    )
}
