import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { cargarPagina } from './paginas';

// Code-splitting: las páginas pesadas (recharts, dnd-kit, xlsx, etc.) se cargan
// al entrar a su ruta, no en el bundle inicial. Login y el layout quedan eager
// porque son el punto de entrada. `lazyWithRetry` auto-recupera el "chunk viejo
// tras deploy" (reintento + recarga única) en vez de mostrar "Algo salió mal".
// Login también va aparte (2026-10-21, celular lento): trae zod + react-hook-form (~70 KB) que quien ya
// tiene sesión —casi todas las aperturas— no necesita.
const LoginPage = lazyWithRetry(cargarPagina.login);
const Dashboard = lazyWithRetry(cargarPagina.dashboard);
const AttendancePage = lazyWithRetry(cargarPagina.asistencia);
const ConsultasPage = lazyWithRetry(cargarPagina.consultas);
const InventarioPage = lazyWithRetry(cargarPagina.inventario);
const VehiculosPage = lazyWithRetry(cargarPagina.vehiculos);
const ObrasFinalizadasPage = lazyWithRetry(cargarPagina.obrasFinalizadas);
const CentroAyudaPage = lazyWithRetry(cargarPagina.ayuda);
const SettingsPage = lazyWithRetry(cargarPagina.configuracion);
const IdeasPage = lazyWithRetry(cargarPagina.ideas);
const CostosPage = lazyWithRetry(cargarPagina.costos);
// Soporte · usuarios (2026-10-23): solo Super Administrador; el servidor lo verifica en cada petición.
const SoportePage = lazyWithRetry(cargarPagina.soporte);

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
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="costos" element={<CostosPage />} />
            <Route path="soporte" element={<SoportePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
