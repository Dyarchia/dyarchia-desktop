import { writeFileSync } from 'node:fs'

const [out, expression, delayArg] = process.argv.slice(2)
const delay = Number(delayArg ?? 800)
const targets = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'))
if (!page) throw new Error('no page target: ' + JSON.stringify(targets.map((t) => t.url)))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko })
let seq = 0
const pending = new Map()
ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
const send = (method, params = {}) => new Promise((ok) => {
    const id = ++seq
    pending.set(id, ok)
    ws.send(JSON.stringify({ id, method, params }))
})
if (expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    console.log('eval:', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null))
    await new Promise((t) => setTimeout(t, delay))
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('wrote', out)
ws.close()
