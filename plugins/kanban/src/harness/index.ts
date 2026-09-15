import type { HarnessId, HarnessInfo, Run } from '../types.js'
import * as claude from './claude.js'
import * as codex from './codex.js'
import * as grok from './grok.js'
import * as opencode from './opencode.js'
import type { Driver, Fleet } from './types.js'

const DRIVERS: Record<HarnessId, Driver> = {
    claude: claude.driver,
    codex: codex.driver,
    grok: grok.driver,
    opencode: opencode.driver
}

export const HARNESSES = Object.keys(DRIVERS) as HarnessId[]

export const DEFAULT_HARNESS: HarnessId = 'claude'

export function isHarness(value: unknown): value is HarnessId {
    return typeof value === 'string' && value in DRIVERS
}

export function driver(id: HarnessId): Driver {
    return DRIVERS[id]
}

export function of(run: Run): Driver {
    return driver(run.harness)
}

export async function catalogue(): Promise<HarnessInfo[]> {
    return Promise.all(
        HARNESSES.map(async (id) => {
            const held = DRIVERS[id]
            const available = (await held.binary()) !== null
            return {
                id,
                label: held.label,
                available,
                models: available ? await held.models() : [],
                efforts: held.efforts ? [...held.efforts] : null
            }
        })
    )
}

export async function poll(): Promise<Fleet> {
    const held = new Map<HarnessId, unknown>()
    for (const id of HARNESSES) held.set(id, await DRIVERS[id].poll())

    return {
        liveness: (run) => of(run).liveness(held.get(run.harness), run),
        state: (run) => of(run).state(held.get(run.harness), run),
        waiting: (run) => of(run).waiting(held.get(run.harness), run)
    }
}
