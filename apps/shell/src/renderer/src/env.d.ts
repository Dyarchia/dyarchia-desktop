/// <reference types="vite/client" />

interface Window {
    dyarchia?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
        on: (channel: string, listener: (...args: unknown[]) => void) => () => void
    }
}
