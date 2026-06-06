import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  HomeIcon, ClipboardDocumentListIcon, ChatBubbleLeftRightIcon,
  UsersIcon, Cog6ToothIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon,
  ChartBarIcon, BellAlertIcon, LightBulbIcon, MegaphoneIcon, XMarkIcon,
  CalendarIcon, ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { useAlerts } from '../contexts/AlertContext.jsx';
import { Avatar } from './Avatar.jsx';
import { NotificationPanel } from './NotificationPanel.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: HomeIcon, exact: true },
  { to: '/boards', label: 'Boards', icon: ClipboardDocumentListIcon },
  { to: '/calendar', label: 'Calendário', icon: CalendarIcon },
  { to: '/chat', label: 'Chat', icon: ChatBubbleLeftRightIcon },
  { to: '/team', label: 'Equipe', icon: UsersIcon },
  { to: '/reports', label: 'Relatórios', icon: ChartBarIcon },
  { to: '/ideas', label: 'Banco de Ideias', icon: LightBulbIcon },
  { to: '/backups', label: 'Backups', icon: ShieldCheckIcon, ownerOnly: true },
];

const ROLE_LABELS = { owner: 'Dono', manager: 'Gerente', operational: 'Operacional' };

export function Sidebar() {
  const { user } = useAuth();
  const { onlineUsers, on, emit } = useSocket();
  const { alerts, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mentionAlerts, setMentionAlerts] = useState([]);
  const [announcement, setAnnouncement] = useState(null); // incoming announcement popup
  const [showAnnounceModal, setShowAnnounceModal] = useState(false); // compose modal (owner only)
  const [announceForm, setAnnounceForm] = useState({ title: '', message: '', emoji: '📢' });
  const isOnline = onlineUsers.includes(user?.id);
  const isOwner = user?.role === 'owner';

  useEffect(() => {
    if (!user?.id || !on) return;
    const offMention = on(`mention:${user.id}`, (data) => {
      const mentionAlert = {
        id: `mention_${Date.now()}`,
        type: 'mention',
        message: `${data.from} mencionou você!`,
        title: data.task_title || '',
        board: data.content?.slice(0, 60),
        board_id: data.board_id,
        task_id: data.task_id,
      };
      setMentionAlerts(prev => [...prev, mentionAlert]);
      setTimeout(() => {
        setMentionAlerts(prev => prev.filter(a => a.id !== mentionAlert.id));
      }, 8000);
    });

    const offAnnouncement = on('announcement:broadcast', (data) => {
      setAnnouncement(data);
    });

    return () => { offMention?.(); offAnnouncement?.(); };
  }, [user?.id, on]);

  const dismissMention = (id) => setMentionAlerts(prev => prev.filter(a => a.id !== id));

  const sendAnnouncement = () => {
    if (!announceForm.message.trim()) return;
    emit('announcement:send', {
      title: announceForm.title.trim() || 'Aviso',
      message: announceForm.message.trim(),
      emoji: announceForm.emoji,
    });
    setAnnounceForm({ title: '', message: '', emoji: '📢' });
    setShowAnnounceModal(false);
  };

  const EMOJIS = ['📢', '📣', '⚠️', '🔔', '📅', '🏆', '🎯', '💡', '🚨', '✅'];

  return (
    <aside
      className={`flex flex-col h-full border-r transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}
      style={{ backgroundColor: '#090909', borderColor: '#1f1f1f' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-3 border-b min-h-[64px]" style={{ borderColor: '#1f1f1f' }}>
        <div className="flex-shrink-0 rounded-lg overflow-hidden w-10 h-10">
          <img src="/logo.png" alt="GS MANTOS" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-black text-white tracking-widest text-sm leading-none">GS MANTOS</p>
            <p className="text-xs mt-0.5" style={{ color: '#D4AF37' }}>Sistema de Gestão</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV.filter(item => !item.ownerOnly || user?.role === 'owner').map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'text-black font-bold' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`
            }
            style={({ isActive }) => isActive ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="flex-1">{label}</span>}
            {!collapsed && label === 'Relatórios' && alerts.length > 0 && (
              <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-black">
                {alerts.length}
              </span>
            )}
            {collapsed && label === 'Relatórios' && alerts.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600" />
            )}
          </NavLink>
        ))}

        {(user?.role === 'owner' || user?.role === 'manager') && (
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'text-black font-bold' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`
            }
            style={({ isActive }) => isActive ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
          >
            <Cog6ToothIcon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Configurações</span>}
          </NavLink>
        )}

        {/* Announce button — owners only */}
        {isOwner && (
          <button
            onClick={() => setShowAnnounceModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-yellow-300 hover:bg-yellow-500/10 transition-all"
            title="Enviar aviso para todos"
          >
            <MegaphoneIcon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Enviar Aviso</span>}
          </button>
        )}
      </nav>

      {/* Notifications */}
      <div className="px-2 py-1 border-t" style={{ borderColor: '#1f1f1f' }}>
        <NotificationPanel collapsed={collapsed} />
      </div>

      {/* User profile */}
      <div className="px-2 py-3 border-t" style={{ borderColor: '#1f1f1f' }}>
        <NavLink to="/profile" className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 transition group">
          <Avatar user={user} size="sm" online={isOnline} />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-200 truncate">{user?.name}</p>
              <p className="text-xs truncate" style={{ color: '#D4AF37' }}>{ROLE_LABELS[user?.role] || user?.role}</p>
            </div>
          )}
        </NavLink>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-center p-3 border-t text-gray-600 hover:text-gray-300 hover:bg-white/5 transition"
        style={{ borderColor: '#1f1f1f' }}
      >
        {collapsed ? <ChevronDoubleRightIcon className="w-4 h-4" /> : <ChevronDoubleLeftIcon className="w-4 h-4" />}
      </button>

      {/* ── COMPOSE ANNOUNCEMENT MODAL (owner only) ── */}
      {showAnnounceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowAnnounceModal(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl border p-6 space-y-4"
            style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-100 flex items-center gap-2">
                <MegaphoneIcon className="w-5 h-5 text-yellow-400" />
                Enviar Aviso
              </h2>
              <button onClick={() => setShowAnnounceModal(false)} className="text-gray-500 hover:text-gray-200 transition">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Emoji picker row */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 block">Ícone</label>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => setAnnounceForm(f => ({ ...f, emoji: e }))}
                    className={`text-xl p-1.5 rounded-lg transition ${announceForm.emoji === e ? 'bg-yellow-500/30 ring-1 ring-yellow-500' : 'hover:bg-gray-800'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Título</label>
              <input
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-yellow-500 transition"
                placeholder="Ex: Reunião de equipe, Aviso importante…"
                value={announceForm.title}
                onChange={e => setAnnounceForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Message */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Mensagem *</label>
              <textarea
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-yellow-500 transition resize-none"
                rows={4}
                placeholder="Digite o aviso para toda a equipe…"
                value={announceForm.message}
                onChange={e => setAnnounceForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAnnounceModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-400 bg-gray-800 hover:bg-gray-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={sendAnnouncement}
                disabled={!announceForm.message.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-black text-black disabled:opacity-40 transition flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}
              >
                <MegaphoneIcon className="w-4 h-4" />
                Enviar para todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INCOMING ANNOUNCEMENT POPUP (all users) ── */}
      {announcement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg mx-4">
            <div
              className="relative rounded-2xl shadow-2xl border-2 p-7 text-center animate-slide-in"
              style={{ backgroundColor: '#0f0f0f', borderColor: '#D4AF37' }}
            >
              {/* Glow ring */}
              <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: '0 0 40px #D4AF3744' }} />

              <div className="relative">
                <div className="text-5xl mb-3">{announcement.emoji || '📢'}</div>
                <p className="text-xs font-bold uppercase tracking-widest text-yellow-500 mb-1">
                  Aviso de {announcement.from}
                </p>
                <h2 className="text-xl font-black text-white mb-3">{announcement.title}</h2>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap mb-6">
                  {announcement.message}
                </p>
                <button
                  onClick={() => setAnnouncement(null)}
                  className="px-8 py-2.5 rounded-xl text-sm font-black text-black transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}
                >
                  Entendido ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert overlay */}
      {(alerts.length > 0 || mentionAlerts.length > 0) && (
        <div className="fixed bottom-4 right-4 z-40 space-y-2 max-w-sm">
          {alerts.map(alert => {
            const isWarning = alert.type === 'warning';
            return (
              <div key={alert.id} className={`flex items-start gap-3 rounded-xl p-4 shadow-2xl animate-slide-in border ${isWarning ? 'bg-yellow-950 border-yellow-500/50' : 'bg-red-950 border-red-500/50'}`}>
                <span className="text-xl flex-shrink-0">{isWarning ? '⏰' : '🚨'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${isWarning ? 'text-yellow-300' : 'text-red-300'}`}>{alert.message || 'Tarefa crítica vence hoje!'}</p>
                  <p className={`text-xs mt-0.5 truncate ${isWarning ? 'text-yellow-400' : 'text-red-400'}`}>{alert.title}</p>
                  {alert.board && <p className={`text-xs ${isWarning ? 'text-yellow-600' : 'text-red-600'}`}>{alert.board}</p>}
                </div>
                <button onClick={() => dismissAlert(alert.id)} className={`flex-shrink-0 ${isWarning ? 'text-yellow-600 hover:text-yellow-400' : 'text-red-600 hover:text-red-400'}`}>✕</button>
              </div>
            );
          })}
          {mentionAlerts.map(alert => (
            <div
              key={alert.id}
              className="flex items-start gap-3 bg-blue-950 border border-blue-500/50 rounded-xl p-4 shadow-2xl animate-slide-in cursor-pointer hover:bg-blue-900/60 transition"
              onClick={() => {
                if (alert.board_id) navigate(`/boards/${alert.board_id}`);
                dismissMention(alert.id);
              }}
            >
              <span className="text-xl flex-shrink-0">💬</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-blue-300">{alert.message}</p>
                {alert.title && <p className="text-xs text-blue-400 mt-0.5 truncate">{alert.title}</p>}
                {alert.board && <p className="text-xs text-blue-600 truncate">{alert.board}</p>}
                {alert.board_id && <p className="text-xs text-blue-500 mt-1 font-semibold">Clique para ver a tarefa →</p>}
              </div>
              <button
                onClick={e => { e.stopPropagation(); dismissMention(alert.id); }}
                className="text-blue-600 hover:text-blue-400 flex-shrink-0"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
