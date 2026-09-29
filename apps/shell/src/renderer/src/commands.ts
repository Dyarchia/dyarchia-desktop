export interface Command {
    id: string
    title: string
    icon?: string
    owner?: string
    run: () => void | Promise<void>
}

const commands = new Map<string, Command>()
const listeners = new Set<() => void>()

function changed(): void {
    for (const listener of listeners) listener()
}

export function registerCommand(command: Command): () => void {
    commands.set(command.id, command)
    changed()
    return () => {
        if (commands.get(command.id) !== command) return
        commands.delete(command.id)
        changed()
    }
}

export function getCommands(): Command[] {
    return [...commands.values()].sort((a, b) => a.title.localeCompare(b.title))
}

export function onCommandsChange(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
