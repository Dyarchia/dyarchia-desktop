/*
 * A tip exists only on a key that has no word: kanon's hint popover, which the browser opens on
 * hover or focus and anchors to the control, never the platform's `title`, which is drawn by the
 * operating system in its own face. A control that spells anything gets no tip, since the tip
 * could only repeat what is already on screen; the guard reads the text outside any glyph at the
 * moment of the call. The tips of a panel live in one holder under its root, so they leave with
 * it and take no room in its layout; a second call on the same control changes its words, and an
 * empty one takes the tip away. A panel that repaints its keys leaves their tips behind, so once
 * the repaint is over every tip whose control has left the document goes too, closed first if it
 * was showing: an open hint whose anchor is gone falls to the corner of the window.
 */
export type Tip = (control: HTMLElement, text: string) => void

function spells(control: HTMLElement): boolean {
    const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.trim() && !node.parentElement?.closest('svg')) return true
    }
    return false
}

export function tips(holder: HTMLElement): Tip {
    holder.style.display = 'contents'
    const made = new WeakMap<HTMLElement, HTMLElement>()
    const owners = new Map<HTMLElement, { control: WeakRef<HTMLElement>; seen: boolean }>()
    let queued = false
    const sweep = (): void => {
        queued = false
        for (const [tip, owner] of owners) {
            const control = owner.control.deref()
            if (control?.isConnected) {
                owner.seen = true
                continue
            }
            if (control && !owner.seen) continue
            if (tip.matches(':popover-open')) tip.hidePopover()
            tip.remove()
            owners.delete(tip)
        }
    }
    return (control, text) => {
        if (!queued) {
            queued = true
            queueMicrotask(sweep)
        }
        control.removeAttribute('title')
        const words = spells(control) ? '' : text
        let tip = made.get(control)
        if (!tip) {
            if (!words) return
            tip = document.createElement('div')
            tip.className = 'dya-tip'
            tip.id = `dya-tip-${crypto.randomUUID()}`
            tip.setAttribute('popover', 'hint')
            holder.append(tip)
            made.set(control, tip)
            owners.set(tip, { control: new WeakRef(control), seen: control.isConnected })
        }
        tip.textContent = words
        if (words) control.setAttribute('interestfor', tip.id)
        else control.removeAttribute('interestfor')
    }
}
