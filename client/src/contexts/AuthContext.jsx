import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const sessionIdRef = useRef(null);
  const heartbeatRef = useRef(null);

  const startSession = async (tok) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      });
      const s = await res.json();
      sessionIdRef.current = s.id;
      // Heartbeat every 2 minutes
      heartbeatRef.current = setInterval(() => {
        if (sessionIdRef.current) {
          fetch(`/api/sessions/${sessionIdRef.current}/heartbeat`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tok}` },
          }).catch(() => {});
        }
      }, 120000);
    } catch {}
  };

  const stopSession = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    sessionIdRef.current = null;
  };

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => {
          setUser(u);
          setLoading(false);
          if (u) startSession(token);
        })
        .catch(() => { setToken(null); localStorage.removeItem('token'); setLoading(false); });
    } else {
      setLoading(false);
    }
    return () => stopSession();
  }, [token]);

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    startSession(data.token);
    return data.user;
  };

  const register = async (name, email, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    startSession(data.token);
    return data.user;
  };

  const logout = () => {
    stopSession();
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser) => setUser(prev => ({ ...prev, ...updatedUser }));

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
