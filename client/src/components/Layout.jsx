import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { toast } from './Toast.jsx';
import { SignalIcon, SignalSlashIcon, CloudIcon, Bars3Icon } from '@heroicons/react/24/outline';

export function Layout({ children }) {
  const { connected, serverless, on } = useSocket();
  const { user } = useAuth();
  const prevConnected = useRef(connected);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 sm:px-6 border-b min-h-[64px]"
          style={{ backgroundColor: '#090909', borderColor: '#1f1f1f' }}
        >
          {/* Hamburger — só no celular */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition"
            aria-label="Abrir menu"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <div className="hidden md:block" /> {/* spacer no desktop */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${connected || serverless ? '' : 'text-gray-600'}`}
            style={connected ? { color: '#D4AF37' } : serverless ? { color: '#10b981' } : {}}>
            {connected
              ? <><SignalIcon className="w-3.5 h-3.5" /> <span>ONLINE</span></>
              : serverless
                ? <><CloudIcon className="w-3.5 h-3.5" /> <span>NUVEM</span></>
                : <><SignalSlashIcon className="w-3.5 h-3.5" /> <span>CONECTANDO…</span></>
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
