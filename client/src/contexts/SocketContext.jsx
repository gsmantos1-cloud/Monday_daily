import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  // serverless = WebSocket indisponível (ex: Vercel) → app usa polling
  const [serverless, setServerless] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      setConnected(false);
      return;
    }

    const backendUrl = import.meta.env.VITE_API_URL || window.location.origin;
    // timeout curto: se WebSocket não conectar (serverless), o app cai para polling
    const socket = io(backendUrl, {
      auth: { token },
      transports: ['websocket'],
      timeout: 4000,
      reconnectionAttempts: 3,
    });
    socketRef.current = socket;

    let failCount = 0;
    socket.on('connect', () => { setConnected(true); setServerless(false); failCount = 0; });
    socket.on('connect_error', () => {
      setConnected(false);
      failCount++;
      // Após algumas falhas, assume modo serverless (sem WebSocket)
      if (failCount >= 2) setServerless(true);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('users:online', (ids) => setOnlineUsers(ids));

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token]);

  const emit = (event, data) => socketRef.current?.emit(event, data);

  const on = (event, handler) => {
    const s = socketRef.current;
    if (!s) return () => {};
    s.on(event, handler);
    return () => s.off(event, handler);
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, serverless, onlineUsers, emit, on }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
