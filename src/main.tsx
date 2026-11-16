import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AuthProvider from './components/AuthProvider.tsx'
import { listenNotificationClicks, registerServiceWorker } from './lib/notifications'

// Service worker de las notificaciones; tocar un aviso abre ese viaje
void registerServiceWorker()
listenNotificationClicks((hash) => {
  if (hash) window.location.hash = hash
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
