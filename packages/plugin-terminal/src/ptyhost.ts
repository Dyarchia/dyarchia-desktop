import { spawn } from 'node-pty'
import type { IPty } from 'node-pty'
import { homedir } from 'node:os'
import type { MessagePortMain } from 'electron'

const HIGH_WATERMARK_CHARS = 100_000
const LOW_WATERMARK_CHARS = 5_000
const FLUSH_INTERVAL_MS = 5
const FLUSH_SIZE_CHARS = 131_072
const SCROLLBACK_BUFFER_CHARS = 1_048_576

interface Session {
    id: string
    pty: IPty
    port: MessagePortMain | null
    pending: string[]
    pendingChars: number
    flushTimer: NodeJS.Timeout | null
    unacked: number
    paused: boolean
    scrollback: string[]
    scrollbackChars: number
    exited: boolean
}

const sessions = new Map<string, Session>()
let nextId = 1

function rememberScrollback(session: Session, data: string): void {
    session.scrollback.push(data)
    session.scrollbackChars += data.length
    while (session.scrollbackChars > SCROLLBACK_BUFFER_CHARS && session.scrollback.length > 1) {
        session.scrollbackChars -= session.scrollback[0].length
        session.scrollback.shift()
    }
}

function deliver(session: Session, data: string): void {
    if (!session.port) return
    session.port.postMessage({ t: 'data', d: data })
    session.unacked += data.length
    if (!session.paused && session.unacked > HIGH_WATERMARK_CHARS) {
        session.paused = true
        session.pty.pause()
    }
}

function flush(session: Session): void {
    if (session.flushTimer) {
        clearTimeout(session.flushTimer)
        session.flushTimer = null
    }
    if (session.pendingChars === 0) return
    const data = session.pending.length === 1 ? session.pending[0] : session.pending.join('')
    session.pending = []
    session.pendingChars = 0
    rememberScrollback(session, data)
    deliver(session, data)
}

function onPtyData(session: Session, data: string): void {
    session.pending.push(data)
    session.pendingChars += data.length
    if (session.pendingChars >= FLUSH_SIZE_CHARS) {
        flush(session)
        return
    }
    if (!session.flushTimer) {
        session.flushTimer = setTimeout(() => {
            session.flushTimer = null
            flush(session)
        }, FLUSH_INTERVAL_MS)
    }
}

function handleAck(session: Session, chars: number): void {
    session.unacked = Math.max(0, session.unacked - chars)
    if (session.paused && session.unacked < LOW_WATERMARK_CHARS) {
        session.paused = false
        session.pty.resume()
    }
}

function detach(session: Session): void {
    if (session.port) {
        session.port.close()
        session.port = null
    }
    session.unacked = 0
    if (session.paused) {
        session.paused = false
        session.pty.resume()
    }
}

function destroy(session: Session): void {
    detach(session)
    if (session.flushTimer) clearTimeout(session.flushTimer)
    sessions.delete(session.id)
    if (!session.exited) session.pty.kill()
}

function wirePort(session: Session, port: MessagePortMain): void {
    detach(session)
    session.port = port
    port.on('message', (event) => {
        const msg = event.data as
            | { t: 'in'; d: string }
            | { t: 'resize'; cols: number; rows: number }
            | { t: 'ack'; n: number }
            | { t: 'detach' }
            | { t: 'kill' }
        switch (msg.t) {
            case 'in':
                session.pty.write(msg.d)
                break
            case 'resize':
                if (msg.cols > 0 && msg.rows > 0) session.pty.resize(msg.cols, msg.rows)
                break
            case 'ack':
                handleAck(session, msg.n)
                break
            case 'detach':
                detach(session)
                break
            case 'kill':
                destroy(session)
                break
        }
    })
    port.on('close', () => {
        if (session.port === port) detach(session)
    })
    port.start()
    if (session.scrollbackChars > 0) {
        deliver(session, session.scrollback.join(''))
    }
}

function createSession(cols: number, rows: number): Session {
    const env = { ...(process.env as Record<string, string>) }
    delete env['ELECTRON_RUN_AS_NODE']
    env['COLORTERM'] = 'truecolor'
    env['TERM_PROGRAM'] = 'dyarchia'
    const pty = spawn('pwsh.exe', ['-NoLogo'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: homedir(),
        env
    })
    const session: Session = {
        id: String(nextId++),
        pty,
        port: null,
        pending: [],
        pendingChars: 0,
        flushTimer: null,
        unacked: 0,
        paused: false,
        scrollback: [],
        scrollbackChars: 0,
        exited: false
    }
    pty.onData((data) => onPtyData(session, data))
    pty.onExit(({ exitCode }) => {
        session.exited = true
        flush(session)
        session.port?.postMessage({ t: 'exit', code: exitCode })
        process.parentPort.postMessage({ type: 'exit', sessionId: session.id, exitCode })
        destroy(session)
    })
    sessions.set(session.id, session)
    return session
}

process.parentPort.on('message', (event) => {
    const msg = event.data as { type: 'attach'; attachId: string; cols: number; rows: number }
    if (msg.type !== 'attach') return
    const port = event.ports[0]
    if (!port) return
    let session: Session | undefined
    for (const candidate of sessions.values()) {
        if (!candidate.port && !candidate.exited) {
            session = candidate
            break
        }
    }
    if (!session) {
        session = createSession(msg.cols, msg.rows)
    } else if (msg.cols > 0 && msg.rows > 0) {
        session.pty.resize(msg.cols, msg.rows)
    }
    wirePort(session, port)
    process.parentPort.postMessage({
        type: 'attached',
        attachId: msg.attachId,
        sessionId: session.id
    })
})
