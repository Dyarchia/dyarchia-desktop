import { useEffect, useMemo, useRef, useState } from 'react'
import { getCommands, onCommandsChange } from '../commands'
import type { PanelDescriptor } from '../panels/registry'
import { pluginIcon } from '../plugins/host'
import { PANEL_KEYS } from '../shortcuts'
import { Svg } from './Svg'

interface PaletteProps {
    panels: PanelDescriptor[]
    onOpen: (id: string) => void
    onClose: () => void
}

interface Entry {
    key: string
    name: string
    icon?: string
    hint?: string
    run: () => void | Promise<void>
}

function score(name: string, query: string): number | null {
    if (!query) return 0
    const text = name.toLowerCase()
    const at = text.indexOf(query)
    if (at !== -1) return at
    let gaps = 0
    let from = 0
    for (const letter of query) {
        const found = text.indexOf(letter, from)
        if (found === -1) return null
        gaps += found - from
        from = found + 1
    }
    return 1000 + gaps
}

export function Palette({ panels, onOpen, onClose }: PaletteProps): React.JSX.Element {
    const [query, setQuery] = useState('')
    const [index, setIndex] = useState(0)
    const [commands, setCommands] = useState(getCommands)
    const field = useRef<HTMLInputElement>(null)
    const list = useRef<HTMLUListElement>(null)

    useEffect(() => onCommandsChange(() => setCommands(getCommands())), [])

    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        field.current?.focus()
        return () => opener?.focus()
    }, [])

    const entries = useMemo<Entry[]>(() => {
        const all: Entry[] = [
            ...panels.map((panel) => ({
                key: `panel:${panel.id}`,
                name: panel.title,
                icon: panel.icon,
                hint: PANEL_KEYS[panel.id],
                run: () => onOpen(panel.id)
            })),
            ...commands.map((command) => ({
                key: `command:${command.id}`,
                name: command.title,
                icon: command.icon ?? (command.owner ? pluginIcon(command.owner) : undefined),
                run: command.run
            }))
        ]
        const wanted = query.trim().toLowerCase()
        return all
            .map((entry) => ({ entry, rank: score(entry.name, wanted) }))
            .filter((scored): scored is { entry: Entry; rank: number } => scored.rank !== null)
            .sort((a, b) => a.rank - b.rank)
            .map((scored) => scored.entry)
    }, [panels, commands, query, onOpen])

    useEffect(() => setIndex(0), [query])

    useEffect(() => {
        list.current?.children[index]?.scrollIntoView({ block: 'nearest' })
    }, [index])

    const run = (entry: Entry | undefined): void => {
        if (!entry) return
        onClose()
        void entry.run()
    }

    const onKeyDown = (event: React.KeyboardEvent): void => {
        const count = entries.length
        if (event.key === 'ArrowDown' && count > 0) {
            event.preventDefault()
            setIndex((current) => (current + 1) % count)
        } else if (event.key === 'ArrowUp' && count > 0) {
            event.preventDefault()
            setIndex((current) => (current - 1 + count) % count)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            run(entries[index])
        } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
        }
    }

    return (
        <>
            <div className="dya-scrim shell-palette-scrim" onClick={onClose} />
            <div className="dya-palette" role="dialog" aria-modal="true" aria-label="Palette">
                <input
                    ref={field}
                    className="dya-field"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="shell-palette-list"
                    aria-activedescendant={entries[index] ? `palette-${index}` : undefined}
                    aria-label="Search"
                    placeholder="Search"
                    spellCheck={false}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onKeyDown}
                />
                {entries.length === 0 ? (
                    <div className="dya-palette__empty">No match</div>
                ) : (
                    <ul ref={list} id="shell-palette-list" className="dya-palette__list" role="listbox">
                        {entries.map((entry, position) => (
                            <li
                                key={entry.key}
                                id={`palette-${position}`}
                                className="dya-palette__row"
                                role="option"
                                aria-selected={position === index}
                                onPointerMove={() => setIndex(position)}
                                onClick={() => run(entry)}
                            >
                                {entry.icon?.trim().startsWith('<svg') ? (
                                    <Svg className="dya-palette__icon" svg={entry.icon} />
                                ) : (
                                    <span className="dya-palette__icon" aria-hidden="true" />
                                )}
                                <span className="dya-palette__name">{entry.name}</span>
                                {entry.hint && <kbd className="dya-palette__hint">{entry.hint}</kbd>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    )
}
