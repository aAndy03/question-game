import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { installDevFakeIfAsked } from './host/devFake'

// `?fake` on a dev URL installs the in-memory host with a demo library, so
// the shell can be worked on without Rust. A real host always wins.
installDevFakeIfAsked()

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
