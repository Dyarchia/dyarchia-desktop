import ReactDOM from 'react-dom/client'
import { App } from './App'
import '@dyarchia/kanon/css/dyarchia.css'
import 'dockview/dist/styles/dockview.css'
import './styles.css'

/*
 * A key that carries a tip opens it on focus, and a window given back its focus gives it back to
 * the key last clicked, so coming back to the application showed the tip of whatever had been
 * pressed. A key the pointer pressed lets go of the focus when the window loses it; one reached
 * from the keyboard keeps it, since that reader navigates by focus and the tip is theirs.
 */
window.addEventListener('blur', () => {
    const held = document.activeElement
    if (held instanceof HTMLElement && held.hasAttribute('interestfor') && !held.matches(':focus-visible')) held.blur()
})

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
