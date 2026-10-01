import ReactDOM from 'react-dom/client'
import { App } from './App'
import '@dyarchia/kanon/css/dyarchia.css'
import 'dockview/dist/styles/dockview.css'
import './styles.css'

/*
 * A key that carries a tip opens it on hover and on focus, and both come back to a key long after
 * it was pressed: a palette or a menu closing uncovers the key under a pointer that never moved,
 * hands the focus back, and so does the window regaining it. So a key the pointer pressed puts its
 * tip away, lets go of the focus, and keeps no tip until the pointer has left its box; a scrim laid
 * over it does not count as leaving. One reached from the keyboard keeps the focus and the tip,
 * since that reader navigates by them. It is done here, once, because plugin keys share this
 * document.
 */
function release(held: Element | null, pressed: boolean): void {
    if (!(held instanceof HTMLElement)) return
    const id = held.getAttribute('interestfor')
    if (!id || held.matches(':focus-visible')) return
    const tip = document.getElementById(id)
    if (tip?.matches(':popover-open')) tip.hidePopover()
    held.blur()
    if (!pressed) return
    held.removeAttribute('interestfor')
    const away = (event: PointerEvent): void => {
        const box = held.getBoundingClientRect()
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
        if (inside && held.isConnected) return
        document.removeEventListener('pointermove', away)
        held.setAttribute('interestfor', id)
    }
    document.addEventListener('pointermove', away)
}

document.addEventListener('click', (event) => {
    if (event.detail === 0) return
    release(event.target instanceof Element ? event.target.closest('[interestfor]') : null, true)
}, true)
window.addEventListener('blur', () => release(document.activeElement, false))

/*
 * The browser closes a tip when the pointer leaves its key, and only then. A key redrawn or taken
 * away under the pointer, by a fold, a board refreshing or a menu opening, never sees the pointer
 * leave, and its tip stayed open over whatever came next. So every pointer move checks each open
 * tip against its key: a key that is gone, or is neither under the pointer nor holding the
 * keyboard's focus, takes its tip away.
 */
const shown = new Set<HTMLElement>()

document.addEventListener('toggle', (event) => {
    const tip = event.target
    if (!(tip instanceof HTMLElement) || !tip.classList.contains('dya-tip')) return
    if ((event as ToggleEvent).newState === 'open') shown.add(tip)
    else shown.delete(tip)
}, true)

document.addEventListener('pointermove', () => {
    for (const tip of shown) {
        const key = document.querySelector(`[interestfor="${tip.id}"]`)
        if (key?.matches(':hover, :focus-visible')) continue
        shown.delete(tip)
        if (tip.matches(':popover-open')) tip.hidePopover()
    }
}, { passive: true })

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
