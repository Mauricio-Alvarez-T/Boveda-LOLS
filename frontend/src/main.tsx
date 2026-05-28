import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.tsx'
import { ObraProvider } from './context/ObraContext.tsx'
import { Toaster } from 'sonner'
import { PageHeaderProvider } from './context/PageHeaderContext.tsx'
import { ThemeProvider, useTheme } from './context/ThemeContext.tsx'

/** Toaster que sigue el tema activo (claro/oscuro). */
const ThemedToaster: React.FC = () => {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      closeButton
      duration={3000}
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
            <App />
            <ThemedToaster />
          </PageHeaderProvider>
        </ObraProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
