import 'react'

/*
 * `interestfor` is the attribute that anchors a hint popover to the control it describes. It is
 * native in the Chromium this application ships with and is not in React's own typings yet, so it
 * is declared once here rather than cast away at every call site: every icon-only control in the
 * shell carries one, and a control with no label but a tooltip nobody can reach is the shape the
 * top bar had.
 *
 * This file is a module — it imports — so the block below augments React rather than replacing it,
 * which is what the same declaration does from a script file.
 */
declare module 'react' {
    interface HTMLAttributes<T> {
        interestfor?: string
    }
}
