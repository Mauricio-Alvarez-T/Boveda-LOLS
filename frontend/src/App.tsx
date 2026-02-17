import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import WorkersPage from './pages/Workers';
import AttendancePage from './pages/Attendance';
import FiscalizacionPage from './pages/Fiscalizacion';
import { MainLayout } from './components/layout/MainLayout';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-12 w-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
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
          <Route path="trabajadores" element={<WorkersPage />} />
          <Route path="asistencia" element={<AttendancePage />} />
          <Route path="fiscalizacion" element={<FiscalizacionPage />} />
          {/* Add more module routes here */}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
