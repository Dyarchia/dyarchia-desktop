import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = join(tmpdir(), 'eforoi-probe')
mkdirSync(userData, { recursive: true })

export const app = { getPath: () => userData }

export const safeStorage = {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => ''
}

export default { app, safeStorage }
