export type Tool = 'download' | 'convert' | 'cut' | 'join' | 'extract' | 'compress' | 'gif' | 'record' | 'stream' | 'inspect'

export interface Spec {
    tool: Tool
    inputs: string[]
    options: Record<string, string>
}

export interface Job {
    id: number
    tool: Tool
    name: string
    state: 'running' | 'done' | 'failed' | 'stopped'
    percent: number | null
    started: number
    ended?: number
    output?: string
    error?: string
}

export interface Track {
    index: number
    type: string
    codec: string
    detail: string
}

export interface Probe {
    path: string
    name: string
    duration: number
    format: string
    size: number
    bitrate: number
    width: number
    height: number
    tracks: Track[]
}

export interface Ready {
    ffmpeg: boolean
    ytdlp: boolean
    capture: boolean
    codecs: string[]
}

export interface Sources {
    screens: { id: string; name: string }[]
    video: string[]
    audio: string[]
}
