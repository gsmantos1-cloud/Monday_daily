import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

const TYPE_DOT = {
  mention: '#3b82f6',      // blue
  announcement: '#eab308', // yellow
  task_alert: '#ef4444',   // red
};

export function NotificationPanel({ collapsed }) {
  const { user, token } = useAuth();
  const { on } = useSocket();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const panelRef = useRef(null);

  const unread = notifications.filter(n => !n.read).length;

  // Fetch notifications on mount
  useEffect(() => {
    if (!token) return;
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setNotifications)
      .catch(() => {});
  }, [token]);

  // Listen for real-time notifications
  useEffect(() => {
    if (!user?.id || !on) return;
    const off = on(`notification:new:${user.id}`, (notif) => {
      setNotifications(prev => [notif, ...prev].slice(0, 50));
    });
    return () => off?.();
  }, [user?.id, on]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClick = async (n) => {
    if (!n.read) {
      await fetch(`/api/notifications/${n.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Notificações"
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-all"
      >
        <div className="relative flex-shrink-0">
          <BellIcon className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
        {!collapsed && <span className="flex-1 text-left">Notificações</span>}
        {!collapsed && unread > 0 && (
          <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-black">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-full top-0 ml-2 w-80 rounded-xl shadow-2xl border z-50 flex flex-col overflow-hidden"
          style={{ backgroundColor: '#141414', borderColor: '#2a2a2a', maxHeight: '420px' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: '#2a2a2a' }}
          >
            <span className="text-sm font-bold text-gray-100">Notificações</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition font-semibold"
              >
                Marcar tudo como lido
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-gray-600 text-sm">
                Nenhuma notificação
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition border-b ${n.read ? '' : 'bg-white/[0.03]'}`}
                  style={{ borderColor: '#1f1f1f' }}
                >
                  {/* Colored dot */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: TYPE_DOT[n.type] || '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug ${n.read ? 'text-gray-500' : 'text-gray-200 font-semibold'}`}>
                      {n.message}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{relativeTime(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
