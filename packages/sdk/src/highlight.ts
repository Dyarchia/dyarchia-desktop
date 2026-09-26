import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/*
 * highlight.js, with the grammars this application meets and nothing else, emitting its scopes
 * under kanon's prefix so that `dya-code__string` and its siblings land on the six measured inks.
 * The hand-written tokeniser this replaces coloured a block only when it was declared in one of
 * the languages it knew, gave Rust and Go the grammar of JavaScript, and could not tell a JSON
 * key from its value.
 */
const GRAMMARS = {
    bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, markdown,
    powershell, python, rust, shell, sql, typescript, xml, yaml
}

for (const [name, grammar] of Object.entries(GRAMMARS)) hljs.registerLanguage(name, grammar)
hljs.configure({ classPrefix: 'dya-code__' })

/*
 * What a fence or a file extension says, to the grammar that reads it. Apex has no grammar of its
 * own and is Java closely enough to read as it. Text is named so that it is left alone rather
 * than guessed at.
 */
const ALIASES: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    py: 'python', pyi: 'python',
    jsonc: 'json', json5: 'json', jsonl: 'json',
    yml: 'yaml',
    md: 'markdown', mdx: 'markdown',
    sh: 'bash', zsh: 'bash', console: 'shell',
    ps1: 'powershell', psm1: 'powershell', pwsh: 'powershell',
    scss: 'css',
    html: 'xml', htm: 'xml', svg: 'xml', xhtml: 'xml',
    apex: 'java', cls: 'java', trigger: 'java',
    patch: 'diff',
    toml: 'ini', env: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini',
    rs: 'rust', cs: 'csharp', 'c++': 'cpp', hpp: 'cpp', h: 'c',
    docker: 'dockerfile'
}

const PLAIN = new Set(['text', 'txt', 'plain', 'plaintext', 'log', 'csv', 'ascii', 'none'])

/*
 * An undeclared block is guessed, and left plain when nothing is sure: a paragraph of prose inside
 * a fence coloured as if it were SQL is worse than no colour at all. highlight.js scores a sentence
 * of English as SQL at 4 and a short YAML block at 4 too, so its score alone cannot tell them
 * apart. JSON is known for certain by parsing it, YAML by every line being a key, an item or a
 * comment, and anything else has to score 5 or more.
 */
const GUESSES = ['python', 'typescript', 'javascript', 'bash', 'powershell', 'sql', 'xml', 'css', 'java']
const CONFIDENT = 5
const YAML_LINE = /^\s*(?:#.*|- .*|-$|[\w.\-"']+:(?:\s.*)?|---)$/

function guess(source: string): string | null {
    const trimmed = source.trim()
    if (/^[[{]/.test(trimmed)) {
        try {
            JSON.parse(trimmed)
            return 'json'
        } catch {}
    }
    const lines = trimmed.split('\n').filter((line) => line.trim())
    if (lines.length > 0 && lines.every((line) => YAML_LINE.test(line))) return 'yaml'
    return null
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

function escape(text: string): string {
    return text.replace(/[&<>]/g, (char) => ENTITIES[char])
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/

/*
 * Markdown read as source, with every fenced block coloured in the language it declares. The
 * markdown grammar sees a fence as one string and paints the whole block green, which is how a
 * document full of code read as a document with no colour in it. The prose between fences goes to
 * that grammar, each fence's body to its own, and the fence lines are punctuation.
 */
function markdownSource(source: string): string {
    const out: string[] = []
    let prose: string[] = []
    const lines = source.split('\n')
    const flush = (): void => {
        if (prose.length) out.push(hljs.highlight(prose.join('\n'), { language: 'markdown', ignoreIllegals: true }).value)
        prose = []
    }
    let index = 0
    while (index < lines.length) {
        const open = FENCE.exec(lines[index])
        if (!open) {
            prose.push(lines[index])
            index += 1
            continue
        }
        const marker = open[1]
        let close = index + 1
        while (close < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[close])) close += 1
        flush()
        const body = lines.slice(index + 1, close).join('\n')
        const fence = (line: string): string => `<span class="dya-code__punctuation">${escape(line)}</span>`
        out.push(fence(lines[index]) + (close > index + 1 ? `\n${highlight(body, open[2])}` : ''))
        if (close < lines.length) out.push(fence(lines[close]))
        index = close + 1
    }
    flush()
    return out.join('\n')
}

export function highlight(source: string, language = ''): string {
    const declared = language.trim().toLowerCase()
    if (PLAIN.has(declared)) return escape(source)
    const name = ALIASES[declared] ?? declared
    if (name === 'markdown') return markdownSource(source)
    if (name && hljs.getLanguage(name)) {
        return hljs.highlight(source, { language: name, ignoreIllegals: true }).value
    }
    if (declared) return escape(source)
    const known = guess(source)
    if (known) return hljs.highlight(source, { language: known, ignoreIllegals: true }).value
    const scored = hljs.highlightAuto(source, GUESSES)
    return scored.relevance >= CONFIDENT ? scored.value : escape(source)
}

/*
 * The same highlighting, one string of HTML per line, because a reader that can be asked to show
 * line 412 needs an element per line to point at and a block comment does not stop at a newline.
 * A span that crosses a line is closed at the end of it and opened again at the start of the
 * next, so every line is well formed on its own and keeps the colour it is written in.
 */
export function highlightLines(source: string, language = ''): string[] {
    const lines: string[] = []
    const open: string[] = []
    let current = ''

    for (const piece of highlight(source, language).split(/(<span [^>]*>|<\/span>)/)) {
        if (piece.startsWith('<span ')) {
            open.push(piece)
            current += piece
        } else if (piece === '</span>') {
            open.pop()
            current += piece
        } else {
            const parts = piece.split('\n')
            for (const [index, part] of parts.entries()) {
                if (index > 0) {
                    lines.push(current + '</span>'.repeat(open.length))
                    current = open.join('')
                }
                current += part
            }
        }
    }

    lines.push(current)
    return lines
}
