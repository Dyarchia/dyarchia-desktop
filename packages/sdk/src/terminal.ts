const ANSI_TOKENS = {
    black: 'border-strong',
    red: 'ansi-red',
    green: 'ansi-green',
    yellow: 'ansi-yellow',
    blue: 'ansi-blue',
    magenta: 'ansi-magenta',
    cyan: 'ansi-cyan',
    white: 'text-muted',
    brightBlack: 'text-off',
    brightRed: 'ansi-bright-red',
    brightGreen: 'ansi-bright-green',
    brightYellow: 'ansi-bright-yellow',
    brightBlue: 'ansi-bright-blue',
    brightMagenta: 'ansi-bright-magenta',
    brightCyan: 'ansi-bright-cyan',
    brightWhite: 'text'
} as const

/*
 * An xterm theme read from the current kanon tokens, for every terminal the application draws. It
 * is a function of `token` because a theme can change: a terminal reads it again on `theme.on`.
 */
export function terminalTheme(token: (name: string) => string): Record<string, string> {
    return {
        ...Object.fromEntries(Object.entries(ANSI_TOKENS).map(([slot, name]) => [slot, token(name)])),
        background: token('field'),
        foreground: token('text'),
        cursor: token('text'),
        cursorAccent: token('field'),
        selectionBackground: token('accent-soft')
    }
}
