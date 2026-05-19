import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/auth-context'
import { PlanUpgradeProvider } from './context/plan-upgrade-context'
import { ThemeProvider } from './context/theme-context'
import { router } from './routes/router'
import './styles/globals.css'

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        void reg.update().catch(() => {})
      })
      .catch(() => {
        /* ignore */
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <PlanUpgradeProvider>
          <RouterProvider router={router} />
        </PlanUpgradeProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
