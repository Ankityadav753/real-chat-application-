import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/useAuthStore';
import { SocketProvider } from './context/SocketContext';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

function App() {
  const { isAuthenticated, isCheckingAuth, checkAuth, initTheme } = useAuthStore();

  // Validate session on app launch
  useEffect(() => {
    checkAuth();
    initTheme();
  }, []);

  // Show a premium visual spinner during auth check
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-dark-600">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="mt-4 text-xs font-semibold text-slate-400 dark:text-slate-500 tracking-wider uppercase">
          Verifying Session...
        </p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <SocketProvider>
        <Routes>
          {/* Landing / Welcome page */}
          <Route
            path="/"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />}
          />

          {/* Login Page */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
          />

          {/* Register Page */}
          <Route
            path="/register"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />}
          />

          {/* Dashboard (Protected Chat Workspace) */}
          <Route
            path="/dashboard"
            element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />}
          />

          {/* 404 Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>

        {/* Global Notifications Handler */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#333',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              style: {
                background: 'rgba(34, 197, 94, 0.95)',
                color: '#fff',
              },
            },
            error: {
              style: {
                background: 'rgba(239, 68, 68, 0.95)',
                color: '#fff',
              },
            },
          }}
        />
      </SocketProvider>
    </BrowserRouter>
  );
}

export default App;
