import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.tsx'
import { ObraProvider } from './context/ObraContext.tsx'
import { Toaster } from 'sonner'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ObraProvider>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </ObraProvider>
    </AuthProvider>
  </React.StrictMode>,
)

