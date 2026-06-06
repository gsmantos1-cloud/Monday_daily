import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { SocketProvider } from './contexts/SocketContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AlertProvider } from './contexts/AlertContext.jsx';
import { Layout } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Boards } from './pages/Boards.jsx';
import { Board } from './pages/Board.jsx';
import { Chat } from './pages/Chat.jsx';
import { Team } from './pages/Team.jsx';
import { Profile } from './pages/Profile.jsx';
import { Settings } from './pages/Settings.jsx';
import { Reports } from './pages/Reports.jsx';
import { Ideas } from './pages/Ideas.jsx';
import { Calendar } from './pages/Calendar.jsx';
import { Backups } from './pages/Backups.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={
        <PrivateRoute>
          <SocketProvider>
            <AlertProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/boards" element={<Boards />} />
                <Route path="/boards/:id" element={<Board />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/team" element={<Team />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/ideas" element={<Ideas />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/backups" element={<Backups />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
            </AlertProvider>
          </SocketProvider>
        </PrivateRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
