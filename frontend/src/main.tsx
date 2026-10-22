import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.tsx'
import { ObraProvider } from './context/ObraContext.tsx'
import { Toaster } from 'sonner'
import { MotionConfig } from 'framer-motion'
import { PageHeaderProvider } from './context/PageHeaderContext.tsx'
import { ThemeProvider, useTheme } from './context/ThemeContext.tsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.tsx'
import { reloadOnceForChunkError } from './utils/lazyWithRetry.ts'
import { DURACION_AVISO, ESTILO_AVISO } from './utils/avisos';

// "Chunk viejo tras deploy": si Vite no puede precargar un módulo (deploy en curso o
// chunk rotado), recarga UNA vez para traer el build nuevo. Complementa lazyWithRetry.
window.addEventListener('vite:preloadError', () => { reloadOnceForChunkError(); });

/** Toaster que sigue el tema activo (claro/oscuro). */
const ThemedToaster: React.FC = () => {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      closeButton
      duration={DURACION_AVISO}
      toastOptions={{ style: ESTILO_AVISO }}
      theme={resolvedTheme}
    />
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ObraProvider>
          <PageHeaderProvider>
            {/* Base única de movimiento (diseno.md §9.1): si el sistema pide «reducir
                movimiento», framer apaga transform/layout y deja solo la opacidad.
                No cubre pathLength, filter, animate() imperativo, keyframes CSS ni
                recharts: esos casos se gatean aparte (useReducedMotion / motion-safe:). */}
            <MotionConfig reducedMotion="user">
              <ErrorBoundary fullScreen>
                <App />
              </ErrorBoundary>
              <ThemedToaster />
            </MotionConfig>
          </PageHeaderProvider>
        </ObraProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
