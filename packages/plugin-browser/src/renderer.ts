import type { PluginContext } from '@decimatio/sdk'

interface NavState {
    url: string
    title: string
    canGoBack: boolean
    canGoForward: boolean
    loading: boolean
}

const BROWSER_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>'
const BACK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>'
const FORWARD_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
const RELOAD_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>'

const STYLES = `
.browser {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.browser-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.browser-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #8e8e96;
    cursor: pointer;
    flex-shrink: 0;
}
.browser-btn svg { width: 14px; height: 14px; }
.browser-btn:hover { background: rgba(255, 255, 255, 0.08); color: #e0e0e6; }
.browser-btn:disabled { color: #45454c; cursor: default; }
.browser-btn:disabled:hover { background: transparent; }
.browser-url {
    flex: 1;
    height: 26px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.25);
    color: #d5d5dc;
    font: inherit;
    font-size: 12px;
    outline: none;
    min-width: 60px;
}
.browser-url:focus { border-color: rgba(255, 255, 255, 0.18); }
.browser-content { flex: 1; min-height: 0; }
`

function ensureStyles(): void {
    if (document.getElementById('decimatio-browser-styles')) return
    const style = document.createElement('style')
    style.id = 'decimatio-browser-styles'
    style.textContent = STYLES
    document.head.appendChild(style)
}

function normalizeUrl(input: string): string {
    const text = input.trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
    if (/^[^\s]+\.[^\s]{2,}$/.test(text)) return `https://${text}`
    return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
}

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        { id: 'browser', title: 'Browser', icon: BROWSER_ICON, duplicable: true },
        (container) => {
            ensureStyles()

            const root = document.createElement('div')
            root.className = 'browser'
            const toolbar = document.createElement('div')
            toolbar.className = 'browser-toolbar'
            const content = document.createElement('div')
            content.className = 'browser-content'
            root.append(toolbar, content)
            container.appendChild(root)

            const makeButton = (icon: string, title: string): HTMLButtonElement => {
                const btn = document.createElement('button')
                btn.className = 'browser-btn'
                btn.title = title
                btn.innerHTML = icon
                toolbar.appendChild(btn)
                return btn
            }
            const backBtn = makeButton(BACK_ICON, 'Back')
            const forwardBtn = makeButton(FORWARD_ICON, 'Forward')
            const reloadBtn = makeButton(RELOAD_ICON, 'Reload')
            const urlInput = document.createElement('input')
            urlInput.className = 'browser-url'
            urlInput.placeholder = 'Enter URL or search'
            urlInput.spellcheck = false
            toolbar.appendChild(urlInput)

            backBtn.disabled = true
            forwardBtn.disabled = true

            let viewId: string | null = null
            let disposed = false
            let lastRect = ''

            const contentBounds = (): { x: number; y: number; width: number; height: number } => {
                const rect = content.getBoundingClientRect()
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }

            const syncBounds = (): void => {
                if (!viewId) return
                const bounds = contentBounds()
                const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
                if (key === lastRect) return
                lastRect = key
                void ctx.invoke('bounds', viewId, bounds)
            }

            const offNav = ctx.on('nav', (...args) => {
                const [id, state] = args as [string, NavState]
                if (id !== viewId) return
                backBtn.disabled = !state.canGoBack
                forwardBtn.disabled = !state.canGoForward
                if (document.activeElement !== urlInput && state.url) {
                    urlInput.value = state.url
                }
            })

            void ctx.invoke('create', contentBounds()).then((id) => {
                if (disposed) {
                    if (id) void ctx.invoke('destroy', id)
                    return
                }
                viewId = id as string | null
                urlInput.focus()
            })

            urlInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && viewId && urlInput.value.trim()) {
                    void ctx.invoke('navigate', viewId, normalizeUrl(urlInput.value))
                    urlInput.blur()
                }
            })
            backBtn.onclick = () => viewId && void ctx.invoke('back', viewId)
            forwardBtn.onclick = () => viewId && void ctx.invoke('forward', viewId)
            reloadBtn.onclick = () => viewId && void ctx.invoke('reload', viewId)

            const resizeObserver = new ResizeObserver(syncBounds)
            resizeObserver.observe(content)
            const poll = setInterval(syncBounds, 120)
            const intersection = new IntersectionObserver((entries) => {
                if (!viewId) return
                void ctx.invoke('visible', viewId, entries[0]?.isIntersecting ?? true)
            })
            intersection.observe(content)

            return () => {
                disposed = true
                clearInterval(poll)
                resizeObserver.disconnect()
                intersection.disconnect()
                offNav()
                if (viewId) void ctx.invoke('destroy', viewId)
                container.replaceChildren()
            }
        }
    )
}
