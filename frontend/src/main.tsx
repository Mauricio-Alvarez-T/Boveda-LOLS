import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.tsx'
import { ObraProvider } from './context/ObraContext.tsx'
import { ResponsiveToaster } from './components/ResponsiveToaster'
import { PageHeaderProvider } from './context/PageHeaderContext.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ObraProvider>
        <PageHeaderProvider>
          <App />
          <ResponsiveToaster />
        </PageHeaderProvider>
      </ObraProvider>
    </AuthProvider>
  </React.StrictMode>,
)