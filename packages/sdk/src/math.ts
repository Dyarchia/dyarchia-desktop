const SYMBOLS: Record<string, string> = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
    zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
    lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
    tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
    Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',

    times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆',
    leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', equiv: '≡',
    approx: '≈', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫',

    in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃',
    supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',

    forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬',
    land: '∧', wedge: '∧', lor: '∨', vee: '∨', therefore: '∴', because: '∵',

    to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', Leftarrow: '⇐',
    leftrightarrow: '↔', Leftrightarrow: '⇔', mapsto: '↦', implies: '⟹', iff: '⟺',

    infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫',
    oint: '∮', sqrt: '√', angle: '∠', perp: '⊥', parallel: '∥',
    dots: '…', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',

    Im: 'ℑ', Re: 'ℜ', aleph: 'ℵ', hbar: 'ℏ', ell: 'ℓ', wp: '℘',
    mathbb: '', mathrm: '', mathbf: '', mathcal: '', text: '', textrm: '',
    left: '', right: '', big: '', Big: '', quad: ' ', qquad: '  ', ',': ' ', ';': ' '
}

const NAMED = new Set([
    'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin',
    'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'lim', 'limsup', 'liminf',
    'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'deg', 'gcd', 'lcm',
    'mod', 'bmod', 'pmod', 'arg'
])

const BLACKBOARD: Record<string, string> = {
    N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ', P: 'ℙ', F: '𝔽', H: 'ℍ'
}

const SUPER: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
    '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽',
    ')': '⁾', n: 'ⁿ', i: 'ⁱ'
}

const SUB: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
    '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍',
    ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', j: 'ⱼ', n: 'ₙ', o: 'ₒ', x: 'ₓ'
}

function script(body: string, table: Record<string, string>): string | null {
    const out = [...body].map((char) => table[char])
    return out.every((char) => char !== undefined) ? out.join('') : null
}

function shift(source: string, marker: string, table: Record<string, string>): string {
    return source.replace(
        new RegExp(`\\${marker}(?:\\{([^{}]*)\\}|(\\\\?[A-Za-z0-9+\\-=()]))`, 'g'),
        (all, braced: string | undefined, single: string | undefined) => {
            const body = braced ?? single ?? ''
            return script(body, table) ?? (braced === undefined ? `${marker}${body}` : `${marker}(${body})`)
        }
    )
}

const KEEP_OPEN = ''
const KEEP_CLOSE = ''

export function texToUnicode(source: string): string {
    let out = source

    out = out.replace(/\\\{/g, KEEP_OPEN).replace(/\\\}/g, KEEP_CLOSE)
    out = out.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    out = out.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    out = out.replace(/\\(mathbb|mathbf)\{([A-Z])\}/g, (all, _kind, letter: string) => BLACKBOARD[letter] ?? letter)
    out = out.replace(/\\(?:mathrm|mathcal|text|textrm|operatorname)\{([^{}]*)\}/g, '$1')

    out = out.replace(/\\([A-Za-z]+) ?/g, (all, name: string) => {
        if (NAMED.has(name)) return all.slice(1)
        const symbol = SYMBOLS[name]
        return symbol === undefined ? all : symbol
    })
    out = out.replace(/\\([,;!\s])/g, ' ')
    out = out.replace(/\\([$%&#_])/g, '$1')

    out = shift(out, '^', SUPER)
    out = shift(out, '_', SUB)

    out = out.replace(/\{([^{}]*)\}/g, '$1')
    out = out.split(KEEP_OPEN).join('{').split(KEEP_CLOSE).join('}')
    return out.replace(/[ \t]{2,}/g, ' ').trim()
}
