import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type KeyName = 'anthropic' | 'openai'

const ENV_VARS: Record<KeyName, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY'
}

function root(): string {
    return join(app.getPath('userData'), 'eforoi')
}

function file(): string {
    return join(root(), 'keys.json')
}

async function load(): Promise<Record<string, string>> {
    try {
        return JSON.parse(await readFile(file(), 'utf-8')) as Record<string, string>
    } catch {
        return {}
    }
}

export async function scratch(): Promise<string> {
    const path = join(root(), 'scratch')
    await mkdir(path, { recursive: true })
    return path
}

export async function readKey(name: KeyName): Promise<string | null> {
    const stored = (await load())[name]
    if (stored && safeStorage.isEncryptionAvailable()) {
        try {
            return safeStorage.decryptString(Buffer.from(stored, 'base64'))
        } catch {
            /* fall through to the environment */
        }
    }
    return process.env[ENV_VARS[name]] ?? null
}

export async function writeKey(name: KeyName, value: string): Promise<void> {
    const store = await load()
    if (!value) {
        delete store[name]
    } else {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain is unavailable')
        store[name] = safeStorage.encryptString(value).toString('base64')
    }
    await mkdir(root(), { recursive: true })
    await writeFile(file(), JSON.stringify(store), 'utf-8')
}

export async function keyOrigin(name: KeyName): Promise<'stored' | 'environment' | 'none'> {
    if ((await load())[name]) return 'stored'
    return process.env[ENV_VARS[name]] ? 'environment' : 'none'
}
