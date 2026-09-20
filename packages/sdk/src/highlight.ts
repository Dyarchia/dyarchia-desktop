type TokenKind = 'kw' | 'str' | 'num' | 'com' | 'fn' | 'pun'

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
    'break case cat cd continue do done echo elif else esac exit export fi for function ' +
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

/*
 * YAML was reading as shell, which gave it `done` and `esac` as keywords and nothing for the one
 * thing a YAML file is made of. A key is the name of the thing under it, so it takes the colour
 * a function name takes; an anchor and an alias are the only two references the format has.
 */
const YAML = grammar(
    [
        HASH_COMMENT,
        { kind: 'kw', re: sticky(String.raw`(?<=^|\n)(?:---|\.\.\.)(?=\s|$)`) },
        ...QUOTED,
        /*
         * A colon followed by anything but whitespace is not a key, which is what keeps the
         * scheme of a URL an ordinary word.
         */
        { kind: 'fn', re: sticky(String.raw`[A-Za-z_][\w.\- ]*(?= *:(?:\s|$))`) },
        { kind: 'str', re: sticky(String.raw`[&*][\w.-]+`) },
        NUMBER
    ],
    'true false null True False Null TRUE FALSE NULL yes no on off ~'
)

/*
 * Apex is Java with a query language inside square brackets. The SOQL words are listed in upper
 * case only, which is how they are written and which keeps `select` as an ordinary identifier.
 */
const APEX = grammar(
    [...C_COMMENTS, ...QUOTED, NUMBER],
    'abstract break case catch class continue default delete do else enum extends final ' +
        'finally for global if implements insert instanceof interface merge new null override ' +
        'private protected public return static super switch testMethod this throw transient ' +
        'trigger try undelete update upsert virtual void while sharing without with ' +
        'Boolean Date Datetime Decimal Double Id Integer Long Object String Time Blob ' +
        'List Map Set SObject Database System Test Schema Trigger ' +
        'true false ' +
        'SELECT FROM WHERE AND OR NOT IN LIKE ORDER BY GROUP HAVING LIMIT OFFSET ASC DESC ' +
        'NULLS FIRST LAST COUNT TYPEOF WHEN THEN ELSE END FOR UPDATE VIEW ALL ROWS'
)

/*
 * Prose is not code, and the fallback grammar was treating it as such: a `#` opening a heading
 * became a comment that swallowed the line, and an apostrophe in an ordinary word opened a
 * string that ran to the next one. This grammar marks only what markdown actually punctuates
 * with and leaves every sentence alone, which is why it does not go through `grammar()` and
 * take its keyword and punctuation fall-through.
 */
const MARKDOWN: Grammar = {
    rules: [
        { kind: 'pun', re: sticky(String.raw`(?<=^|\n)\x60{3,}[^\n]*`) },
        { kind: 'kw', re: sticky(String.raw`(?<=^|\n)#{1,6} [^\n]*`) },
        { kind: 'str', re: sticky(String.raw`\x60[^\x60\n]*\x60`) },
        { kind: 'fn', re: sticky(String.raw`!?\[[^\]\n]*\]`) },
        { kind: 'pun', re: sticky(String.raw`(?<=^|\n)[ \t]*(?:[-*+]|\d+\.)(?= )`) },
        { kind: 'pun', re: sticky(String.raw`(?<=^|\n)[ \t]*>[ \t]?`) },
        { kind: 'plain', re: sticky(String.raw`[^\n\x60\[\]]+`) }
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
    java: APEX,
    apex: APEX,
    cls: APEX,
    trigger: APEX,
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
    yaml: YAML,
    yml: YAML,
    toml: YAML,
    sql: SQL,
    css: CSS_GRAMMAR,
    scss: CSS_GRAMMAR,
    html: MARKUP,
    xml: MARKUP,
    svg: MARKUP,
    md: MARKDOWN,
    markdown: MARKDOWN,
    mdx: MARKDOWN,
    txt: MARKDOWN
}

function wrap(kind: TokenKind, text: string): string {
    return `<span class="dya-code__${kind}">${escape(text)}</span>`
}

interface Token {
    kind: TokenKind | null
    text: string
}

function tokenise(source: string, language: string): Token[] {
    const spec = BY_LANGUAGE[language.toLowerCase()] ?? PLAIN
    const out: Token[] = []
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
                    out.push({ kind: 'kw', text })
                } else if (source[index + text.length] === '(') {
                    out.push({ kind: 'fn', text })
                } else {
                    out.push({ kind: null, text })
                }
            } else if (rule.kind === 'plain') {
                out.push({ kind: null, text })
            } else {
                out.push({ kind: rule.kind, text })
            }

            index += text.length
            matched = true
            break
        }

        if (!matched) {
            out.push({ kind: null, text: source[index] })
            index += 1
        }
    }

    return out
}

function piece(token: Token, text: string): string {
    return token.kind === null ? escape(text) : wrap(token.kind, text)
}

export function highlight(source: string, language = ''): string {
    return tokenise(source, language)
        .map((token) => piece(token, token.text))
        .join('')
}

/*
 * The same highlighting, one string of HTML per line, because a reader that can be asked to show
 * line 412 needs an element per line to point at and a block comment does not stop at a newline.
 * Splitting the finished HTML by `\n` would cut a span in half; splitting the tokens cannot,
 * since every piece of a token that crosses a line is wrapped again on the line it lands on.
 */
export function highlightLines(source: string, language = ''): string[] {
    const lines: string[] = []
    let current = ''

    for (const token of tokenise(source, language)) {
        const parts = token.text.split('\n')
        for (const [index, part] of parts.entries()) {
            if (index > 0) {
                lines.push(current)
                current = ''
            }
            if (part) current += piece(token, part)
        }
    }

    lines.push(current)
    return lines
}
