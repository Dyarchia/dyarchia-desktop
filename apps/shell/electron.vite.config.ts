import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

const { version } = createRequire(import.meta.url)('./package.json') as { version: string }

export default defineConfig({
    main: {},
    preload: {},
    renderer: {
        plugins: [react()],
        define: {
            __DYARCHIA_VERSION__: JSON.stringify(version)
        }
    }
})
