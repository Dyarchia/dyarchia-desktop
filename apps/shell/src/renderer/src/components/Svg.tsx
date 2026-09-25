import { useMemo } from 'react'
import { ownIds } from '@dyarchia/sdk'

export function Svg({ svg, className }: { svg: string; className: string }): React.JSX.Element {
    const html = useMemo(() => ownIds(svg), [svg])
    return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
