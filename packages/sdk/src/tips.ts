/*
 * Every control that is only a glyph carries a tip: kanon's hint popover, which the browser opens
 * on hover or focus and anchors to the control, never the platform's `title`, which is drawn by
 * the operating system in its own face. The tips of a panel live in one holder under its root, so
 * they leave with it and take no room in its layout; a second call on the same control changes
 * its words, and an empty one takes the tip away while the control spells its own.
 */
export type Tip = (control: HTMLElement, text: string) => void

export function tips(holder: HTMLElement): Tip {
    holder.style.display = 'contents'
    const made = new WeakMap<HTMLElement, HTMLElement>()
    return (control, text) => {
        control.removeAttribute('title')
        let tip = made.get(control)
        if (!tip) {
            tip = document.createElement('div')
            tip.className = 'dya-tip'
            tip.id = `dya-tip-${crypto.randomUUID()}`
            tip.setAttribute('popover', 'hint')
            holder.append(tip)
            made.set(control, tip)
        }
        tip.textContent = text
        if (text) control.setAttribute('interestfor', tip.id)
        else control.removeAttribute('interestfor')
    }
}
