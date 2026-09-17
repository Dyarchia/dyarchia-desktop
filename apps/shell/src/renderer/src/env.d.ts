/// <reference types="vite/client" />

declare const __DYARCHIA_VERSION__: string

interface Window {
    dyarchia?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
        on: (channel: string, listener: (...args: unknown[]) => void) => () => void
    }
}
