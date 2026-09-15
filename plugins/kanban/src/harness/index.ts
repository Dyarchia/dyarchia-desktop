import type { HarnessId, Run } from '../types.js'
import * as claude from './claude.js'
import type { Driver, Fleet } from './types.js'

const DRIVERS: Record<HarnessId, Driver> = {
    claude: claude.driver
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

export async function poll(): Promise<Fleet> {
    const held = new Map<HarnessId, unknown>()
    for (const id of HARNESSES) held.set(id, await DRIVERS[id].poll())

    return {
        liveness: (run) => of(run).liveness(held.get(run.harness), run),
        state: (run) => of(run).state(held.get(run.harness), run),
        waiting: (run) => of(run).waiting(held.get(run.harness), run)
    }
}
