import type { PluginContext } from '@dyarchia/sdk'

/*
 * The plugin's mark, one of the set in black and white: an aspis, its face halved, the one shield
 * worn in two lights.
 */
const KANON_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10.6" style="fill:var(--dya-text)"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" style="fill:var(--dya-on-accent)"/><circle cx="12" cy="12" r="2.2" style="fill:var(--dya-text);stroke:var(--dya-on-accent);stroke-width:1.2"/></svg>'

/*
 * Nothing but the palette: one command for each theme kanon declares other than the one worn, so
 * the list says what can be changed to and never offers the present state.
 */
export function activate(ctx: PluginContext): void {
    ctx.mark(KANON_ICON)
    let registered: (() => void)[] = []

    function offer(): void {
        for (const remove of registered) remove()
        registered = ctx.theme
            .list()
            .filter((theme) => theme.id !== ctx.theme.current())
            .map((theme) =>
                ctx.registerCommand({
                    id: `theme.${theme.id}`,
                    title: theme.name,
                    icon: KANON_ICON,
                    run: () => ctx.theme.set(theme.id)
                })
            )
    }

    offer()
    ctx.theme.on(offer)
}
