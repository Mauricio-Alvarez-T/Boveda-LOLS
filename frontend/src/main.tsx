import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.tsx'
import { ObraProvider } from './context/ObraContext.tsx'
import { Toaster } from 'sonner'
import { PageHeaderProvider } from './context/PageHeaderContext.tsx'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ObraProvider>
        <PageHeaderProvider>
          <App />
          <Toaster
            position="top-right"
            closeButton
            duration={3000}
            toastOptions={{
              style: {
                background: 'white',
              },
              className: 'shadow-lg border border-[#E8E8ED] !opacity-100',
              classNames: {
                closeButton: '!bg-[#F5F5F7] !text-[#1D1D1F] !border border-[#E8E8ED] hover:!bg-[#E8E8ED] !opacity-100 focus:!ring-2 focus:!ring-[#0071E3]'
              }
            }}
          />
        </PageHeaderProvider>
      </ObraProvider>
    </AuthProvider>
  </React.StrictMode>,
)

