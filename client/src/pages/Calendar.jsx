import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../contexts/ApiContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_COLORS = { todo: '#c4c4c4', in_progress: '#fdab3d', review: '#784bd1', done: '#00c875', stuck: '#e94c5e' };
const STATUS_LABELS = { todo: 'Não iniciado', in_progress: 'Em Andamento', review: 'Em Revisão', done: 'Concluído', stuck: 'Parado' };

export function Calendar() {
  const api = useApi();
  const { user } = useAuth();
  const { on } = useSocket();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [boards, setBoards] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterBoard, setFilterBoard] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [view, setView] = useState('month'); // 'month' | 'week'
  const [showNoDeadline, setShowNoDeadline] = useState(true);

  const isManager = user?.role === 'owner' || user?.role === 'manager';

  useEffect(() => {
    Promise.all([api.get('/api/tasks'), api.get('/api/users'), api.get('/api/boards')])
      .then(([t, u, b]) => { setTasks(t); setUsers(u); setBoards(b); });
  }, []);

  useEffect(() => {
    const offs = [
      on('task:created', t => setTasks(p => [t, ...p])),
      on('task:updated', t => setTasks(p => p.map(x => x.id === t.id ? t : x))),
      on('task:deleted', ({ id }) => setTasks(p => p.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(f => f?.());
  }, [on]);

  const applyCommonFilters = (t) => {
    // Operacional always sees only their own tasks
    if (!isManager) return String(t.assignee_id) === String(user?.id);
    if (filterAssignee && String(t.assignee_id) !== filterAssignee) return false;
    if (filterBoard && String(t.board_id) !== filterBoard) return false;
    return true;
  };

  const filtered = tasks.filter(t => t.deadline && applyCommonFilters(t));
  const noDeadlineTasks = tasks.filter(t => !t.deadline && applyCommonFilters(t));

  const tasksByDate = {};
  filtered.forEach(t => {
    if (!tasksByDate[t.deadline]) tasksByDate[t.deadline] = [];
    tasksByDate[t.deadline].push(t);
  });

  // Build calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(new Date(d));
    d = addDays(d, 1);
  }

  // Week view: 7 days starting from current week
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="flex flex-col h-full">
      {/* Header — row 1: title + filters */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: '#1f1f1f' }}>
        <div>
          <h1 className="text-lg font-bold text-gray-100">Calendário</h1>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} com prazo · {noDeadlineTasks.length} sem prazo</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentDate(v => view === 'month' ? subMonths(v, 1) : addDays(v, -7))} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-gray-100 min-w-[150px] text-center capitalize">
              {format(currentDate, view === 'month' ? 'MMMM yyyy' : "'Sem.' dd/MM", { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentDate(v => view === 'month' ? addMonths(v, 1) : addDays(v, 7))} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 transition">Hoje</button>
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-800 overflow-hidden">
            {['month', 'week'].map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-semibold transition ${view === v ? 'text-black' : 'text-gray-500 hover:text-gray-300'}`} style={view === v ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}>
                {v === 'month' ? 'Mês' : 'Semana'}
              </button>
            ))}
          </div>

          {/* Filters — managers/owners only */}
          {isManager && (
            <select className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 text-gray-300 focus:outline-none" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
              <option value="">Todos responsáveis</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <select className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 text-gray-300 focus:outline-none" value={filterBoard} onChange={e => setFilterBoard(e.target.value)}>
            <option value="">Todos os boards</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-4">
        {/* Day name headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map(dn => (
            <div key={dn} className="text-center text-xs font-bold text-gray-500 uppercase tracking-wider py-2">{dn}</div>
          ))}
        </div>

        {view === 'month' ? (
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDate[dateStr] || [];
              const isCurrentMonth = isSameMonth(day, currentDate);
              const today = isToday(day);
              return (
                <div
                  key={i}
                  className={`min-h-[100px] rounded-xl p-2 border transition ${today ? 'border-yellow-500/50 bg-yellow-500/5' : isCurrentMonth ? 'border-gray-800 bg-gray-900/40 hover:border-gray-700' : 'border-gray-900 bg-gray-950 opacity-40'}`}
                >
                  <div className={`text-xs font-bold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full ${today ? 'bg-yellow-500 text-black' : 'text-gray-500'}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(task => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="w-full text-left text-[10px] px-1.5 py-0.5 rounded font-medium truncate transition hover:opacity-80"
                        style={{ backgroundColor: STATUS_COLORS[task.status] + '30', color: STATUS_COLORS[task.status], border: `1px solid ${STATUS_COLORS[task.status]}40` }}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <button onClick={() => {}} className="w-full text-[10px] text-gray-500 text-center py-0.5 hover:text-gray-300 transition">
                        +{dayTasks.length - 3} mais
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Week view */
          <div className="grid grid-cols-7 gap-2 h-full">
            {weekDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDate[dateStr] || [];
              const today = isToday(day);
              return (
                <div key={i} className={`rounded-xl border flex flex-col ${today ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-gray-800 bg-gray-900/40'}`}>
                  <div className={`px-3 py-2 border-b text-center ${today ? 'border-yellow-500/30' : 'border-gray-800'}`}>
                    <p className="text-xs text-gray-500 uppercase font-bold">{DAY_NAMES[day.getDay()]}</p>
                    <div className={`text-lg font-black mt-0.5 w-8 h-8 flex items-center justify-center rounded-full mx-auto ${today ? 'bg-yellow-500 text-black' : 'text-gray-300'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                  <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                    {dayTasks.map(task => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="w-full text-left text-xs px-2 py-1.5 rounded-lg font-medium transition hover:opacity-80"
                        style={{ backgroundColor: STATUS_COLORS[task.status] + '25', color: STATUS_COLORS[task.status], border: `1px solid ${STATUS_COLORS[task.status]}40` }}
                      >
                        <div className="truncate font-semibold">{task.title}</div>
                        {task.assignee_name && <div className="text-[10px] opacity-70 mt-0.5">{task.assignee_name}</div>}
                      </button>
                    ))}
                    {dayTasks.length === 0 && (
                      <p className="text-xs text-gray-700 text-center py-4">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* No-deadline panel */}
      {noDeadlineTasks.length > 0 && (
        <div className="border-t border-gray-800 flex-shrink-0">
          <button
            onClick={() => setShowNoDeadline(v => !v)}
            className="w-full flex items-center gap-2 px-6 py-3 text-sm font-bold text-gray-400 hover:text-gray-200 transition"
          >
            <span className={`transition-transform ${showNoDeadline ? 'rotate-90' : ''}`}>▶</span>
            Tarefas sem prazo
            <span className="ml-1 text-xs font-normal text-gray-600">({noDeadlineTasks.length})</span>
          </button>
          {showNoDeadline && (
            <div className="px-6 pb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
              {noDeadlineTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="text-left text-xs px-2.5 py-2 rounded-lg border transition hover:opacity-80"
                  style={{ backgroundColor: STATUS_COLORS[task.status] + '15', color: STATUS_COLORS[task.status], borderColor: STATUS_COLORS[task.status] + '40' }}
                >
                  <div className="font-semibold truncate">{task.title}</div>
                  {task.assignee_name && <div className="opacity-60 mt-0.5 truncate">{task.assignee_name}</div>}
                  {!task.assignee_name && <div className="opacity-40 mt-0.5">Sem responsável</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task detail popup */}
      {selectedTask && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={() => setSelectedTask(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-sm mx-4 rounded-2xl shadow-2xl border p-5"
            style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-base font-bold text-gray-100 leading-snug">{selectedTask.title}</h3>
              <button onClick={() => setSelectedTask(null)} className="text-gray-500 hover:text-gray-200 flex-shrink-0 text-lg leading-none">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-24">Status</span>
                <span className="font-semibold px-2 py-0.5 rounded text-xs" style={{ color: STATUS_COLORS[selectedTask.status], backgroundColor: STATUS_COLORS[selectedTask.status] + '20' }}>
                  {STATUS_LABELS[selectedTask.status]}
                </span>
              </div>
              {selectedTask.assignee_name && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-24">Responsável</span>
                  <span className="text-gray-300">{selectedTask.assignee_name}</span>
                </div>
              )}
              {selectedTask.board_name && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-24">Board</span>
                  <span className="text-gray-300">{selectedTask.board_name}</span>
                </div>
              )}
              {selectedTask.deadline && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-24">Prazo</span>
                  <span className="text-gray-300">{selectedTask.deadline}</span>
                </div>
              )}
              {(selectedTask.estimated_hours != null || selectedTask.actual_hours != null) && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-24">Horas</span>
                  <span className="text-gray-300">
                    {selectedTask.estimated_hours != null ? `Est: ${selectedTask.estimated_hours}h` : ''}
                    {selectedTask.actual_hours != null ? ` / Real: ${selectedTask.actual_hours}h` : ''}
                  </span>
                </div>
              )}
              {selectedTask.description && (
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-gray-400 text-xs leading-relaxed">{selectedTask.description.slice(0, 200)}</p>
                </div>
              )}
            </div>
            {selectedTask.board_id && (
              <Link
                to={`/boards/${selectedTask.board_id}`}
                onClick={() => setSelectedTask(null)}
                className="mt-4 w-full py-2 rounded-lg text-sm font-bold text-black flex items-center justify-center gap-2 transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}
              >
                Abrir no Board →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
