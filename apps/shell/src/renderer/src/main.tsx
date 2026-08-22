import ReactDOM from 'react-dom/client'
import { App } from './App'
import { bootstrapTheme } from './theme'
import '@dyarchia/kanon/css/dyarchia.css'
import 'dockview/dist/styles/dockview.css'
import './styles.css'

bootstrapTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
