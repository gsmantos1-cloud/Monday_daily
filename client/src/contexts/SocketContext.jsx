import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      setConnected(false);
      return;
    }

    const backendUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(backendUrl, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
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
    <SocketContext.Provider value={{ socket: socketRef.current, connected, onlineUsers, emit, on }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
