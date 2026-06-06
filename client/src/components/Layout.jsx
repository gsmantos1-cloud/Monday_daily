import React, { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { toast } from './Toast.jsx';
import { SignalIcon, SignalSlashIcon } from '@heroicons/react/24/outline';

export function Layout({ children }) {
  const { connected, on } = useSocket();
  const { user } = useAuth();
  const prevConnected = useRef(connected);

  useEffect(() => {
    if (!prevConnected.current && connected) toast.success('Conexão restabelecida');
    prevConnected.current = connected;
  }, [connected]);

  useEffect(() => {
    const off = on('task:created', (task) => {
      if (task.assignee_id === user?.id && task.creator_id !== user?.id) {
        toast.info(`Nova tarefa atribuída: "${task.title}"`);
      }
    });
    return () => off?.();
  }, [on, user?.id]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#0d0d0d' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-6 border-b min-h-[64px]"
          style={{ backgroundColor: '#090909', borderColor: '#1f1f1f' }}
        >
          <div /> {/* spacer */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${connected ? '' : 'text-gray-600'}`}
            style={connected ? { color: '#D4AF37' } : {}}>
            {connected
              ? <><SignalIcon className="w-3.5 h-3.5" /> <span>ONLINE</span></>
              : <><SignalSlashIcon className="w-3.5 h-3.5" /> <span>RECONECTANDO…</span></>
            }
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
