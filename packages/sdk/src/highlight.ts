export type TokenKind = 'kw' | 'str' | 'num' | 'com' | 'fn' | 'pun'

interface Rule {
    kind: TokenKind | 'word' | 'plain'
    re: RegExp
}

interface Grammar {
    rules: Rule[]
    keywords: Set<string>
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

function escape(text: string): string {
    return text.replace(/[&<>]/g, (char) => ENTITIES[char])
}

function sticky(source: string): RegExp {
    return new RegExp(source, 'y')
}

function words(list: string): Set<string> {
    return new Set(list.split(' '))
}

const PUNCTUATION = String.raw`[{}()\[\];:,.<>+\-*/%=!&|^~?@]+`
const WORD = String.raw`[A-Za-z_$][\w$]*`
const SAFE = String.raw`[^\s\w$'"\`#{}()\[\];:,.<>+\-*/%=!&|^~?@]+`

function grammar(rules: Rule[], keywords: string): Grammar {
    return {
        rules: [
            ...rules,
            { kind: 'word', re: sticky(WORD) },
            { kind: 'pun', re: sticky(PUNCTUATION) },
            { kind: 'plain', re: sticky(SAFE) }
        ],
        keywords: words(keywords)
    }
}

const C_COMMENTS: Rule[] = [
    { kind: 'com', re: sticky(String.raw`//[^\n]*`) },
    { kind: 'com', re: sticky(String.raw`/\*[\s\S]*?(?:\*/|$)`) }
]

const HASH_COMMENT: Rule = { kind: 'com', re: sticky(String.raw`#[^\n]*`) }

const QUOTED: Rule[] = [
    { kind: 'str', re: sticky(String.raw`'(?:[^'\\\n]|\\.)*'?`) },
    { kind: 'str', re: sticky(String.raw`"(?:[^"\\\n]|\\.)*"?`) }
]

const NUMBER: Rule = {
    kind: 'num',
    re: sticky(String.raw`0[xXbBoO][0-9a-fA-F_]+n?|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?n?`)
}

const SCRIPT = grammar(
    [
        ...C_COMMENTS,
        { kind: 'str', re: sticky(String.raw`\`(?:[^\`\\]|\\[\s\S])*\`?`) },
        ...QUOTED,
        NUMBER
    ],
    'abstract any as async await boolean break case catch class const constructor continue ' +
        'debugger declare default delete do else enum export extends false finally for from ' +
        'function get if implements import in infer instanceof interface is keyof let map ' +
        'namespace never new null number of private protected public readonly record require ' +
        'return satisfies set static string super switch symbol this throw true try type ' +
        'typeof undefined union unknown var void while with yield'
)

const PYTHON = grammar(
    [
        HASH_COMMENT,
        { kind: 'str', re: sticky(String.raw`[rbfu]{0,2}'''[\s\S]*?(?:'''|$)`) },
        { kind: 'str', re: sticky(String.raw`[rbfu]{0,2}"""[\s\S]*?(?:"""|$)`) },
        { kind: 'str', re: sticky(String.raw`[rbfu]{0,2}'(?:[^'\\\n]|\\.)*'?`) },
        { kind: 'str', re: sticky(String.raw`[rbfu]{0,2}"(?:[^"\\\n]|\\.)*"?`) },
        NUMBER
    ],
    'and as assert async await break class continue def del elif else except False finally ' +
        'for from global if import in is lambda match None nonlocal not or pass raise return ' +
        'self True try while with yield'
)

const JSON_GRAMMAR = grammar([...QUOTED, NUMBER], 'true false null')

const SHELL = grammar(
    [
        HASH_COMMENT,
        ...QUOTED,
        { kind: 'num', re: sticky(String.raw`\$\{[^}]*\}|\$[\w@*#?]+`) },
        NUMBER
    ],
    'break case cd cat cd continue do done echo elif else esac exit export fi for function ' +
        'grep if in local read return set shift source then unset until while'
)

const SQL = grammar(
    [{ kind: 'com', re: sticky(String.raw`--[^\n]*`) }, ...C_COMMENTS.slice(1), ...QUOTED, NUMBER],
    'ALTER AND AS ASC BY CASE COUNT CREATE DELETE DESC DISTINCT DROP ELSE END EXISTS FROM ' +
        'FULL GROUP HAVING IN INNER INSERT INTO IS JOIN LEFT LIKE LIMIT NOT NULL OFFSET ON OR ' +
        'ORDER OUTER RIGHT SELECT SET TABLE THEN UNION UPDATE VALUES WHEN WHERE WITH'
)

const CSS_GRAMMAR = grammar(
    [
        C_COMMENTS[1],
        ...QUOTED,
        { kind: 'num', re: sticky(String.raw`#[0-9a-fA-F]{3,8}\b`) },
        { kind: 'num', re: sticky(String.raw`\d[\d.]*(?:px|rem|em|%|vh|vw|s|ms|fr|deg)?`) }
    ],
    'and important media not supports keyframes container layer'
)

const MARKUP: Grammar = {
    rules: [
        { kind: 'com', re: sticky(String.raw`<!--[\s\S]*?(?:-->|$)`) },
        { kind: 'kw', re: sticky(String.raw`</?[A-Za-z][\w:-]*`) },
        ...QUOTED,
        { kind: 'fn', re: sticky(String.raw`[A-Za-z-][\w:-]*(?==)`) },
        { kind: 'pun', re: sticky(String.raw`/?>`) },
        { kind: 'plain', re: sticky(String.raw`[^<'">]+`) }
    ],
    keywords: new Set()
}

const PLAIN = grammar([HASH_COMMENT, ...C_COMMENTS, ...QUOTED, NUMBER], '')

const BY_LANGUAGE: Record<string, Grammar> = {
    js: SCRIPT,
    jsx: SCRIPT,
    javascript: SCRIPT,
    ts: SCRIPT,
    tsx: SCRIPT,
    typescript: SCRIPT,
    mjs: SCRIPT,
    cjs: SCRIPT,
    java: SCRIPT,
    apex: SCRIPT,
    c: SCRIPT,
    cpp: SCRIPT,
    cs: SCRIPT,
    go: SCRIPT,
    rust: SCRIPT,
    rs: SCRIPT,
    swift: SCRIPT,
    kotlin: SCRIPT,
    py: PYTHON,
    python: PYTHON,
    json: JSON_GRAMMAR,
    jsonc: JSON_GRAMMAR,
    sh: SHELL,
    bash: SHELL,
    zsh: SHELL,
    shell: SHELL,
    console: SHELL,
    ps1: SHELL,
    powershell: SHELL,
    yaml: SHELL,
    yml: SHELL,
    toml: SHELL,
    sql: SQL,
    css: CSS_GRAMMAR,
    scss: CSS_GRAMMAR,
    html: MARKUP,
    xml: MARKUP,
    svg: MARKUP
}

export function knownLanguage(language: string): boolean {
    return language.toLowerCase() in BY_LANGUAGE
}

function wrap(kind: TokenKind, text: string): string {
    return `<span class="dya-code__${kind}">${escape(text)}</span>`
}

export function highlight(source: string, language = ''): string {
    const key = language.toLowerCase()
    const spec = BY_LANGUAGE[key] ?? PLAIN
    const out: string[] = []
    let index = 0

    while (index < source.length) {
        let matched = false

        for (const rule of spec.rules) {
            rule.re.lastIndex = index
            const found = rule.re.exec(source)
            if (!found || !found[0]) continue

            const text = found[0]
            if (rule.kind === 'word') {
                if (spec.keywords.has(text)) {
                    out.push(wrap('kw', text))
                } else if (source[index + text.length] === '(') {
                    out.push(wrap('fn', text))
                } else {
                    out.push(escape(text))
                }
            } else if (rule.kind === 'plain') {
                out.push(escape(text))
            } else {
                out.push(wrap(rule.kind, text))
            }

            index += text.length
            matched = true
            break
        }

        if (!matched) {
            out.push(escape(source[index]))
            index += 1
        }
    }

    return out.join('')
}
