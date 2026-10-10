import { useEffect, useState } from 'react'
import { glyph } from '@dyarchia/sdk'
import { getNav, onNavChange } from './registry'

const BACK_ICON = glyph('back')
const HOME_ICON = glyph('home')

/*
 * Back and home for one panel, the first two keys of its header. Both are always there, so the way
 * out of a panel is in the same place in every one of them; the one that leads nowhere is faint.
 */
export function NavKeys({ instanceId }: { instanceId?: string }): React.JSX.Element {
    const [, setRevision] = useState(0)
    useEffect(
        () =>
            onNavChange((changed) => {
                if (changed === instanceId) setRevision((value) => value + 1)
            }),
        [instanceId]
    )
    const nav = instanceId ? getNav(instanceId) : undefined
    return (
        <div className="dya-toolbar panel-nav">
            <button
                type="button"
                className="dya-key"
                aria-label="Back"
                disabled={!nav?.back}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => nav?.back?.()}
                dangerouslySetInnerHTML={{ __html: BACK_ICON }}
            />
            <button
                type="button"
                className="dya-key"
                aria-label="Home"
                disabled={!nav?.home}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => nav?.home?.()}
                dangerouslySetInnerHTML={{ __html: HOME_ICON }}
            />
        </div>
    )
}
