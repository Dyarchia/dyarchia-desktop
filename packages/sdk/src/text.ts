/*
 * The bytes of a text file somebody handed over, as text. A file says nothing about its encoding,
 * so it is read the way an editor reads one: a byte order mark decides, otherwise it is UTF-8 if it
 * decodes as UTF-8 without a single error, and otherwise it is Windows-1252, which is what a
 * subtitle or a note written on Windows in Spanish, French or German is when it is not UTF-8.
 * Latin-1 is a subset of it, so one fallback covers both.
 */
export function decodeText(bytes: Uint8Array): string {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
        return new TextDecoder('windows-1252').decode(bytes)
    }
}
