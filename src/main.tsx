import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { WorkspaceBootstrap } from './lib/workspace/WorkspaceBootstrap'
import './index.css'
import './styles/tokens.css'
import './styles/workspace.css'
import './styles/editorial.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceBootstrap><App /></WorkspaceBootstrap>
  </StrictMode>,
)
