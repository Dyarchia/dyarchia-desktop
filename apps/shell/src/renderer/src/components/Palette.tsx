import { useEffect, useMemo, useRef, useState } from 'react'
import { glyph } from '@dyarchia/sdk'
import { orderApps, togglePin, useApps } from '../apps'
import { getCommands, onCommandsChange } from '../commands'
import type { PanelDescriptor } from '../panels/registry'
import { pluginIcon } from '../plugins/host'
import { getSearches } from '../searches'
import type { Hit } from '../searches'
import { Svg } from './Svg'
import { Tip, useTipId } from './Tip'

interface PaletteProps {
    panels: PanelDescriptor[]
    openIds: Set<string>
    onOpen: (id: string) => void
    onClose: () => void
}

interface Row {
    key: string
    name: string
    detail?: string
    icon?: string
    run: () => void | Promise<void>
}

const SEARCH_FROM = 2
const SEARCH_PAUSE = 250

const PIN = glyph('pin')

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

function ranked<T>(items: T[], name: (item: T) => string, query: string): T[] {
    return items
        .map((item, order) => ({ item, order, rank: score(name(item), query) }))
        .filter((scored): scored is { item: T; order: number; rank: number } => scored.rank !== null)
        .sort((a, b) => a.rank - b.rank || a.order - b.order)
        .map((scored) => scored.item)
}

function Icon({ icon, className }: { icon?: string; className: string }): React.JSX.Element {
    return icon?.trim().startsWith('<svg') ? (
        <Svg className={className} svg={icon} />
    ) : (
        <span className={className} aria-hidden="true" />
    )
}

interface AppProps {
    panel: PanelDescriptor
    position: number
    selected: boolean
    open: boolean
    pinned: boolean
    onPoint: () => void
    onRun: () => void
}

function App({ panel, position, selected, open, pinned, onPoint, onRun }: AppProps): React.JSX.Element {
    const tip = useTipId()
    const label = pinned ? 'Unpin' : 'Pin'
    return (
        <li
            id={`palette-${position}`}
            className="dya-palette__app"
            role="option"
            aria-selected={selected}
            onPointerMove={onPoint}
        >
            <button className="dya-tile" tabIndex={-1} onClick={onRun}>
                {open && <span className="dya-light" role="img" aria-label="Open" />}
                <Icon icon={panel.icon} className="dya-tile__icon" />
                <span className="dya-tile__name">{panel.title}</span>
            </button>
            <button
                className={`dya-key dya-palette__pin${pinned ? ' dya-key--active' : ''}`}
                tabIndex={-1}
                aria-label={label}
                aria-pressed={pinned}
                interestfor={tip}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => togglePin(panel.id)}
                dangerouslySetInnerHTML={{ __html: PIN }}
            />
            <Tip id={tip} label={label} />
        </li>
    )
}

export function Palette({ panels, openIds, onOpen, onClose }: PaletteProps): React.JSX.Element {
    const [query, setQuery] = useState('')
    const [index, setIndex] = useState(0)
    const [commands, setCommands] = useState(getCommands)
    const apps = useApps()
    const field = useRef<HTMLInputElement>(null)
    const grid = useRef<HTMLUListElement>(null)

    useEffect(() => onCommandsChange(() => setCommands(getCommands())), [])

    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        field.current?.focus()
        return () => opener?.focus()
    }, [])

    const wanted = query.trim().toLowerCase()
    const [found, setFound] = useState<Map<string, Hit[]>>(() => new Map())

    /*
     * Content is asked for once the typing pauses, of every plugin at once, and each answer is
     * shown as it comes; an answer to words no longer in the field is dropped.
     */
    useEffect(() => {
        setFound(new Map())
        if (wanted.length < SEARCH_FROM) return
        let current = true
        const timer = window.setTimeout(() => {
            for (const [owner, search] of getSearches()) {
                void search(wanted)
                    .then((hits) => {
                        if (!current || !hits.length) return
                        setFound((before) => new Map(before).set(owner, hits))
                    })
                    .catch(() => undefined)
            }
        }, SEARCH_PAUSE)
        return () => {
            current = false
            window.clearTimeout(timer)
        }
    }, [wanted])

    const [order] = useState(() => orderApps(panels).map((panel) => panel.id))

    /*
     * The order is taken once, when the palette opens: a tile that jumped to the front the moment
     * its pin was pressed would leave the pointer on another tile. A pin takes its place next time.
     */
    const tiles = useMemo(() => {
        const at = (id: string): number => {
            const found = order.indexOf(id)
            return found === -1 ? Infinity : found
        }
        const sorted = [...panels].sort((a, b) => at(a.id) - at(b.id) || a.title.localeCompare(b.title))
        return ranked(sorted, (panel) => panel.title, wanted)
    }, [panels, order, wanted])

    const rows = useMemo<Row[]>(() => {
        const plugin = (owner?: string): string =>
            panels.find((panel) => panel.owner === owner)?.title ?? owner ?? ''
        const all = [...commands]
            .sort(
                (a, b) =>
                    plugin(a.owner).localeCompare(plugin(b.owner)) || a.title.localeCompare(b.title)
            )
            .map((command) => ({
                key: command.id,
                name: command.title,
                icon: (command.owner ? pluginIcon(command.owner) : undefined) ?? command.icon,
                run: command.run
            }))
        const hits = [...found.entries()]
            .sort(([a], [b]) => plugin(a).localeCompare(plugin(b)))
            .flatMap(([owner, list]) =>
                list.map((hit) => ({
                    key: `${owner}:${hit.id}`,
                    name: hit.title,
                    detail: hit.detail,
                    icon: pluginIcon(owner),
                    run: hit.run
                }))
            )
        return [...ranked(all, (row) => row.name, wanted), ...hits]
    }, [commands, panels, wanted, found])

    const count = tiles.length + rows.length

    useEffect(() => setIndex(0), [query])

    useEffect(() => {
        document.getElementById(`palette-${index}`)?.scrollIntoView({ block: 'nearest' })
    }, [index])

    const run = (position: number): void => {
        if (position < tiles.length) {
            const panel = tiles[position]
            onClose()
            onOpen(panel.id)
            return
        }
        const row = rows[position - tiles.length]
        if (!row) return
        onClose()
        void row.run()
    }

    const columns = (): number => {
        const template = grid.current ? getComputedStyle(grid.current).gridTemplateColumns : ''
        return Math.max(1, template.split(' ').filter(Boolean).length)
    }

    const vertical = (current: number, down: boolean): number => {
        const cols = columns()
        const inGrid = current < tiles.length
        if (down) {
            if (inGrid && current + cols < tiles.length) return current + cols
            if (inGrid && Math.floor(current / cols) < Math.floor((tiles.length - 1) / cols)) {
                return tiles.length - 1
            }
            if (inGrid) return tiles.length < count ? tiles.length : 0
            return (current + 1) % count
        }
        if (inGrid && current - cols < 0) return count - 1
        if (inGrid && current - cols >= 0) return current - cols
        if (current === tiles.length && tiles.length > 0) {
            const lastRow = Math.floor((tiles.length - 1) / cols) * cols
            return Math.min(lastRow, tiles.length - 1)
        }
        return (current - 1 + count) % count
    }

    const onKeyDown = (event: React.KeyboardEvent): void => {
        const inGrid = index < tiles.length
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
            event.preventDefault()
            setIndex((current) => vertical(current, event.key === 'ArrowDown'))
        } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && inGrid && !event.shiftKey) {
            event.preventDefault()
            const step = event.key === 'ArrowRight' ? 1 : -1
            setIndex((current) => Math.min(tiles.length - 1, Math.max(0, current + step)))
        } else if (event.key.toLowerCase() === 'p' && (event.ctrlKey || event.metaKey) && inGrid && tiles[index]) {
            event.preventDefault()
            togglePin(tiles[index].id)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            run(index)
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
                    aria-controls="shell-palette-body"
                    aria-activedescendant={count > 0 ? `palette-${index}` : undefined}
                    aria-label="Search"
                    placeholder="Search"
                    spellCheck={false}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onKeyDown}
                />
                {count === 0 ? (
                    <div className="dya-palette__empty">No match</div>
                ) : (
                    <div id="shell-palette-body" className="dya-palette__body" role="listbox">
                        {tiles.length > 0 && (
                            <ul ref={grid} className="dya-palette__apps" role="group" aria-label="Apps">
                                {tiles.map((panel, position) => (
                                    <App
                                        key={panel.id}
                                        panel={panel}
                                        position={position}
                                        selected={position === index}
                                        open={openIds.has(panel.id)}
                                        pinned={apps.pinned.includes(panel.id)}
                                        onPoint={() => setIndex(position)}
                                        onRun={() => run(position)}
                                    />
                                ))}
                            </ul>
                        )}
                        {rows.length > 0 && (
                            <ul className="dya-palette__list" role="group" aria-label="Commands">
                                {rows.map((row, offset) => {
                                    const position = tiles.length + offset
                                    return (
                                        <li
                                            key={row.key}
                                            id={`palette-${position}`}
                                            className="dya-palette__row"
                                            role="option"
                                            aria-selected={position === index}
                                            onPointerMove={() => setIndex(position)}
                                            onClick={() => run(position)}
                                        >
                                            <Icon icon={row.icon} className="dya-palette__icon" />
                                            <span className="dya-palette__name">{row.name}</span>
                                            {row.detail && <span className="dya-palette__meta">{row.detail}</span>}
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}
