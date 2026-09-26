import { app } from 'electron'

/*
 * The window allows `<webview>` so a plugin can show a web page inside a panel, and a page is the
 * least trusted thing this application will ever render. Whatever a plugin asks for when it
 * attaches one, the guest gets no preload, no Node, an isolated context and the sandbox, and
 * only a web page or a blank one may be loaded into it. The rule is the shell's, so a plugin
 * cannot loosen it by setting an attribute.
 */
export function guardWebviews(): void {
    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-attach-webview', (event, preferences, params) => {
            delete preferences.preload
            preferences.nodeIntegration = false
            preferences.nodeIntegrationInSubFrames = false
            preferences.contextIsolation = true
            preferences.sandbox = true
            preferences.webSecurity = true
            if (!/^(https?:|about:blank)/.test(params.src)) event.preventDefault()
        })
    })
}
