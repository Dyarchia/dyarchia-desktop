import { useId } from 'react'

export function useTipId(): string {
    return `tip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

export function Tip({ id, label }: { id: string; label: string }): React.JSX.Element {
    return (
        <div className="dya-tip" popover="hint" id={id}>
            {label}
        </div>
    )
}
