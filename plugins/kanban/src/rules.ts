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
    'review>ready': 'Discard the review and send it back?',
    'blocked>triage': 'Back to triage?',
    'done>archived': 'Archive? It cannot come back.',
    'blocked>archived': 'Archive while blocked?'
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
    running: 'busy',
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
