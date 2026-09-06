import ReactDOM from 'react-dom/client'
import { App } from './App'
import { applyTheme, readTheme } from './theme'
import '@dyarchia/kanon/css/dyarchia.css'
import 'dockview/dist/styles/dockview.css'
import './styles.css'

applyTheme(readTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
