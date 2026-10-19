import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { AppErrorBoundary } from './app/error-boundary'
import { installChunkReload } from './lib/platform/chunk-reload'
import { initTheme } from './lib/platform/theme'
import './styles/index.css'

initTheme()
installChunkReload()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
