import { app } from 'electron'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/*
 * The documentation corpus, offered to a worker as one tool. The crawlee plugin serves its
 * search over the Model Context Protocol with `dyarchia-crawlee mcp`; this module finds the
 * interpreter that has that package and writes the one-server config Claude Code takes on
 * `--mcp-config`. Nothing is imported from crawlee and nothing here knows how the search works:
 * when the plugin or its environment is not on this machine, there is no config and the worker
 * runs without the tool, which is what it did before this file existed.
 *
 * The interpreter is looked for where crawlee's own host looks for it: an environment beside the
 * checkout first, the one Setup builds under userData second.
 */

const SERVER = 'dyarchia-corpus'

export const TOOL = `mcp__${SERVER}__search_corpus`

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

function pluginDirectories(): string[] {
    return [
        join(import.meta.dirname, '..', '..', 'crawlee'),
        join(app.getPath('appData'), 'dyarchia', 'plugins', 'crawlee')
    ]
}

function interpreters(directory: string): string[] {
    const managed = join(app.getPath('userData'), 'environments', 'crawlee', '.venv')
    const local = join(directory, '.venv')
    return [
        join(local, 'Scripts', 'python.exe'),
        join(local, 'bin', 'python'),
        join(managed, 'Scripts', 'python.exe'),
        join(managed, 'bin', 'python')
    ]
}

export interface Corpus {
    configPath: string
    python: string
    directory: string
}

export async function locate(): Promise<Corpus | null> {
    for (const directory of pluginDirectories()) {
        if (!(await exists(join(directory, 'main.py')))) continue
        for (const python of interpreters(directory)) {
            if (await exists(python)) {
                return { configPath: join(app.getPath('userData'), 'kanban', 'mcp.json'), python, directory }
            }
        }
    }
    return null
}

export async function configure(): Promise<string | null> {
    const found = await locate()
    if (!found) return null
    const config = {
        mcpServers: {
            [SERVER]: {
                type: 'stdio',
                command: found.python,
                args: ['-m', 'dyarchia_crawlee', 'mcp', '--root', found.directory],
                env: { PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }
            }
        }
    }
    await mkdir(join(app.getPath('userData'), 'kanban'), { recursive: true })
    await writeFile(found.configPath, JSON.stringify(config, null, 4) + '\n', 'utf-8')
    return found.configPath
}

export const TOOL_NOTE =
    'A tool named search_corpus is available: full-text search over the documentation this ' +
    'machine has snapshotted (the Salesforce platform, the AI providers). Use it before guessing ' +
    'how an API or a platform feature works; it answers with page URLs and the passage that matched.'
