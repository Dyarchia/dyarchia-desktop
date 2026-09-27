import type { Rules, Status } from './types.js'

const ORDER: Status[] = [
    'triage',
    'scheduled',
    'ready',
    'running',
    'blocked',
    'review',
    'done',
    'archived'
]

const CLOSED: Status[] = ['done', 'archived']

const ALLOW: Record<Status, Status[]> = {
    triage: ['ready'],
    scheduled: ['ready', 'triage'],
    ready: ['scheduled', 'triage'],
    running: [],
    blocked: ['ready', 'review', 'triage', 'archived'],
    review: ['done', 'ready'],
    done: ['archived'],
    archived: []
}

const CONFIRM: Record<string, string> = {
    'review>ready': 'Send this back to the implementer? The review is discarded and the card returns to ready.',
    'blocked>triage': 'Send this back to triage? The phase it was blocked from is forgotten.',
    'done>archived': 'Archive this card? Completed cards are immutable history and archiving is one way.',
    'blocked>archived': 'Archive this card without resolving what blocked it?'
}

const LABELS: Record<Status, string> = {
    triage: 'triage',
    scheduled: 'scheduled',
    ready: 'ready',
    running: 'running',
    blocked: 'blocked',
    review: 'review',
    done: 'done',
    archived: 'archived'
}

const TONE: Record<Status, string> = {
    triage: 'idle',
    scheduled: 'idle',
    ready: 'idle',
    running: 'success',
    blocked: 'warning',
    review: 'idle',
    done: 'success',
    archived: 'idle'
}

export function rules(): Rules {
    return { order: ORDER, allow: ALLOW, confirm: CONFIRM, labels: LABELS, tone: TONE }
}

export function allows(from: Status, to: Status): boolean {
    return ALLOW[from].includes(to)
}

export function isClosed(status: Status): boolean {
    return CLOSED.includes(status)
}
