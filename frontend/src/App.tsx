import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/Login';
import { MainLayout } from './components/layout/MainLayout';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Code-splitting: las páginas pesadas (recharts, dnd-kit, xlsx, etc.) se cargan
// al entrar a su ruta, no en el bundle inicial. Login y el layout quedan eager
// porque son el punto de entrada. `lazyWithRetry` auto-recupera el "chunk viejo
// tras deploy" (reintento + recarga única) en vez de mostrar "Algo salió mal".
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const AttendancePage = lazyWithRetry(() => import('./pages/Attendance'));
const ConsultasPage = lazyWithRetry(() => import('./pages/Consultas'));
const InventarioPage = lazyWithRetry(() => import('./pages/Inventario'));
const VehiculosPage = lazyWithRetry(() => import('./pages/Vehiculos'));
const ObrasFinalizadasPage = lazyWithRetry(() => import('./pages/ObrasFinalizadas'));
const CentroAyudaPage = lazyWithRetry(() => import('./pages/CentroAyuda'));
const SettingsPage = lazyWithRetry(() => import('./pages/Settings'));

const FullScreenSpinner: React.FC = () => (
  <div className="min-h-[100dvh] bg-background flex items-center justify-center">
    <div className="h-12 w-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes inside Layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="asistencia" element={<AttendancePage />} />
            <Route path="consultas" element={<ConsultasPage />} />
            <Route path="inventario" element={<InventarioPage />} />
            <Route path="vehiculos" element={<VehiculosPage />} />
            <Route path="obras-finalizadas" element={<ObrasFinalizadasPage />} />
            <Route path="ayuda" element={<CentroAyudaPage />} />
            <Route path="configuracion" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
