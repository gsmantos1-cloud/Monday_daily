import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useApi } from '../contexts/ApiContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { useAlerts } from '../contexts/AlertContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import {
  ClipboardDocumentListIcon, CheckCircleIcon, ClockIcon,
  UserGroupIcon, PlusIcon, ArrowRightIcon, ExclamationTriangleIcon,
  BellAlertIcon
} from '@heroicons/react/24/outline';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_COLORS = { todo: '#c4c4c4', in_progress: '#fdab3d', stuck: '#e94c5e', review: '#784bd1', done: '#00c875' };
const STATUS_LABELS = { todo: 'A Fazer', in_progress: 'Em Andamento', stuck: 'Parado', review: 'Em Revisão', done: 'Concluído' };
const STATUS_NEXT = { todo: 'in_progress', in_progress: 'review', review: 'done', done: 'todo', stuck: 'in_progress' };
const PRIORITY_COLORS = { low: 'text-gray-400', medium: 'text-warning', high: 'text-danger', critical: 'text-red-400 font-bold' };

function fmtMinutes(mins) {
  if (!mins) return 'Offline';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export function Dashboard() {
  const { user } = useAuth();
  const api = useApi();
  const { on } = useSocket();
  const { alerts, dismissAlert } = useAlerts();
  const canManage = ['owner', 'manager'].includes(user?.role);

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [boards, setBoards] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const reqs = [api.get('/api/tasks'), api.get('/api/users'), api.get('/api/boards')];
    if (canManage) reqs.push(api.get('/api/sessions/today'));
    Promise.all(reqs)
      .then(([t, u, b, s]) => { setTasks(t); setUsers(u); setBoards(b); if (s) setSessions(s); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const offs = [
      on('task:created', t => setTasks(p => [t, ...p])),
      on('task:updated', t => setTasks(p => p.map(x => x.id === t.id ? t : x))),
      on('task:deleted', ({ id }) => setTasks(p => p.filter(x => x.id !== id))),
      on('user:updated', u => setUsers(p => p.map(x => x.id === u.id ? { ...x, ...u } : x))),
    ];
    return () => offs.forEach(f => f?.());
  }, [on]);

  const myTasks = tasks.filter(t => t.assignee_id === user.id);
  const todayTasks = myTasks.filter(t => t.deadline && isToday(new Date(t.deadline + 'T12:00:00')));
  const overdue = myTasks.filter(t => t.deadline && isPast(new Date(t.deadline + 'T23:59:59')) && t.status !== 'done' && !isToday(new Date(t.deadline + 'T12:00:00')));
  const dueToday = myTasks.filter(t => t.deadline && isToday(new Date(t.deadline + 'T12:00:00')) && t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done').length;

  const cycleStatus = async (taskId, currentStatus) => {
    const next = STATUS_NEXT[currentStatus];
    try {
      await api.patch(`/api/tasks/${taskId}/status`, { status: next });
    } catch {}
  };

  const stats = [
    { label: 'Total de Tarefas', value: tasks.length, icon: ClipboardDocumentListIcon, color: 'text-primary' },
    { label: 'Concluídas', value: done, icon: CheckCircleIcon, color: 'text-success' },
    { label: 'Minhas Tarefas', value: myTasks.length, icon: ClockIcon, color: 'text-warning' },
    { label: 'Membros', value: users.length, icon: UserGroupIcon, color: 'text-purple' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Greeting */}
      <div className="flex items-center gap-4">
        <Avatar user={user} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">
            Olá, {user.name.split(' ')[0]}! 👋
          </h1>
          <p className="text-sm text-gray-400">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {overdue.length > 0 && (
        <div className="flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-4 py-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-danger flex-shrink-0" />
          <p className="text-sm text-red-300">
            Você tem <strong>{overdue.length}</strong> tarefa{overdue.length > 1 ? 's' : ''} atrasada{overdue.length > 1 ? 's' : ''}!
          </p>
          <Link to="/boards" className="ml-auto text-xs text-danger hover:underline">Ver tarefas</Link>
        </div>
      )}
      {dueToday.length > 0 && (
        <div className="flex items-center gap-3 bg-warning/10 border border-warning/30 rounded-xl px-4 py-3">
          <ClockIcon className="w-5 h-5 text-warning flex-shrink-0" />
          <p className="text-sm text-orange-300">
            <strong>{dueToday.length}</strong> tarefa{dueToday.length > 1 ? 's' : ''} vence{dueToday.length > 1 ? 'm' : ''} hoje.
          </p>
        </div>
      )}

      {/* Today's tasks panel */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-100 flex items-center gap-2">
            <BellAlertIcon className="w-5 h-5 text-warning" />
            Suas Tarefas de Hoje
          </h2>
          <span className="text-xs text-gray-500">{todayTasks.length} tarefa{todayTasks.length !== 1 ? 's' : ''}</span>
        </div>
        {todayTasks.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">Boa sorte hoje! Nenhuma tarefa com prazo pra hoje. 🎉</div>
        ) : (
          <div className="space-y-2">
            {todayTasks.map(task => {
              const col = STATUS_COLORS[task.status];
              return (
                <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-900 hover:bg-gray-800 transition">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col }} />
                  <span className={`flex-1 text-sm ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-200'}`}>{task.title}</span>
                  {task.board_name && <span className="text-xs text-gray-600">{task.board_name}</span>}
                  <button
                    onClick={() => cycleStatus(task.id, task.status)}
                    className="text-xs font-bold px-2 py-0.5 rounded transition hover:opacity-80 flex-shrink-0"
                    style={{ color: col, backgroundColor: col + '22', border: `1px solid ${col}44` }}
                  >
                    {STATUS_LABELS[task.status]}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-3xl font-bold text-gray-100">{value}</div>
          </div>
        ))}
      </div>

      {/* Boards + My Tasks */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Boards */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100">Boards</h2>
            <Link to="/boards" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todos <ArrowRightIcon className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {boards.slice(0, 5).map(board => (
              <Link key={board.id} to={`/boards/${board.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition group">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: board.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate">{board.name}</p>
                  <p className="text-xs text-gray-500">{board.task_count} tarefa{board.task_count !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-xs text-success">{board.done_count}/{board.task_count}</div>
              </Link>
            ))}
            {boards.length === 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">
                Nenhum board criado ainda.
              </div>
            )}
          </div>
        </div>

        {/* My Tasks */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100">Minhas Tarefas</h2>
            <Link to="/boards" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todas <ArrowRightIcon className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {myTasks.filter(t => t.status !== 'done').slice(0, 6).map(task => {
              const late = task.deadline && isPast(new Date(task.deadline + 'T23:59:59')) && !isToday(new Date(task.deadline + 'T12:00:00'));
              return (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-800 transition">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[task.status] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{task.board_name || 'Sem board'}</span>
                      {task.deadline && (
                        <span className={`text-xs ${late ? 'text-danger' : isToday(new Date(task.deadline + 'T12:00:00')) ? 'text-warning' : 'text-gray-500'}`}>
                          • {late ? '⚠ ' : ''}{format(new Date(task.deadline + 'T12:00:00'), 'dd/MM')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">{STATUS_LABELS[task.status]}</span>
                </div>
              );
            })}
            {myTasks.filter(t => t.status !== 'done').length === 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">
                Nenhuma tarefa pendente. 🎉
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Session tracking panel — managers only */}
      {canManage && sessions.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100 flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-primary" />
              Presença Online Hoje
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.map(({ user: u, total_minutes, last_seen }) => (
              <div key={u.id} className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3">
                <Avatar user={u} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-200 truncate">{u.name}</p>
                  <p className={`text-xs mt-0.5 ${total_minutes > 0 ? 'text-success' : 'text-gray-600'}`}>
                    {fmtMinutes(total_minutes)}
                  </p>
                </div>
                {last_seen && total_minutes > 0 && (
                  <span className="text-[10px] text-gray-600">
                    {format(new Date(last_seen), 'HH:mm')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team status */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-100">Equipe</h2>
          <Link to="/team" className="text-xs text-primary hover:underline flex items-center gap-1">
            Gerenciar <ArrowRightIcon className="w-3 h-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          {users.map(u => {
            const userTasks = tasks.filter(t => t.assignee_id === u.id && t.status !== 'done').length;
            return (
              <div key={u.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
                <Avatar user={u} size="sm" />
                <div>
                  <p className="text-xs font-medium text-gray-200">{u.name}</p>
                  <p className="text-xs text-gray-500">{userTasks} tarefa{userTasks !== 1 ? 's' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
