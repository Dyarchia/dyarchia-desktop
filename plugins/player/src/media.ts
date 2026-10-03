export const MIME_TYPES: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime'
}

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov'])

/*
 * What Chromium cannot open by itself and FFmpeg can: offered only on a machine that has FFmpeg,
 * and converted before it plays.
 */
export const CONVERTIBLE = [
    '.avi', '.wmv', '.flv', '.ts', '.m2ts', '.mts', '.mpg', '.mpeg', '.3gp', '.m4v', '.ogv', '.vob',
    '.wma', '.ac3', '.dts', '.ape', '.aiff', '.aif', '.amr', '.mka'
]

export const PLAYABLE_VIDEO = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1', 'theora'])

export const PLAYABLE_AUDIO = new Set([
    'aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_u8'
])
