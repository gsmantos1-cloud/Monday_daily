import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../contexts/ApiContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import {
  ChartBarIcon, CheckCircleIcon, ClockIcon,
  ExclamationTriangleIcon, FunnelIcon, StarIcon,
  TrophyIcon, FireIcon, FaceSmileIcon, FaceFrownIcon,
  ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon
} from '@heroicons/react/24/outline';
import { TrophyIcon as TrophySolid, StarIcon as StarSolid, FireIcon as FireSolid } from '@heroicons/react/24/solid';
import { format, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PERIODS = [
  { key: 'day',   label: 'Dia' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mês' },
];

const TIERS = {
  destaque: {
    label: 'Destaque',
    icon: TrophySolid,
    color: '#D4AF37',
    bg: '#2a200a',
    border: '#D4AF37',
    msg: 'Excelente desempenho! Continue assim.',
  },
  bom: {
    label: 'Bom',
    icon: StarSolid,
    color: '#00c875',
    bg: '#0a2a1a',
    border: '#00c875',
    msg: 'Bom ritmo! Pequenos ajustes fazem a diferença.',
  },
  regular: {
    label: 'Regular',
    icon: FireSolid,
    color: '#fdab3d',
    bg: '#2a1a0a',
    border: '#fdab3d',
    msg: 'Atenção às tarefas pendentes.',
  },
  critico: {
    label: 'Crítico',
    icon: ExclamationTriangleIcon,
    color: '#e2445c',
    bg: '#2a0a10',
    border: '#e2445c',
    msg: 'Muitas tarefas atrasadas. Precisa de atenção.',
  },
  sem_dados: {
    label: 'Sem dados',
    icon: ClockIcon,
    color: '#6b7280',
    bg: '#1a1a1a',
    border: '#374151',
    msg: 'Nenhuma tarefa com prazo definido ainda.',
  },
};

const STATUS_LABELS = { todo: 'A Fazer', in_progress: 'Em Andamento', stuck: 'Parado', review: 'Em Revisão', done: 'Concluído' };
const STATUS_COLORS = {
  todo: 'bg-gray-500/20 text-gray-300',
  in_progress: 'bg-orange-500/20 text-orange-300',
  stuck: 'bg-red-500/20 text-red-300',
  review: 'bg-purple-500/20 text-purple-300',
  done: 'bg-green-500/20 text-green-300',
};

function periodLabel(period, date) {
  const d = date ? new Date(date + 'T12:00:00') : new Date();
  if (period === 'day') return format(d, "dd 'de' MMMM yyyy", { locale: ptBR });
  if (period === 'week') {
    const mon = startOfWeek(d, { weekStartsOn: 1 });
    const sun = endOfWeek(d, { weekStartsOn: 1 });
    return `${format(mon, 'dd/MM')} – ${format(sun, 'dd/MM/yyyy')}`;
  }
  return format(d, "MMMM 'de' yyyy", { locale: ptBR });
}

function navigate(period, date, dir) {
  const d = date ? new Date(date + 'T12:00:00') : new Date();
  let next;
  if (period === 'day')   next = dir > 0 ? addDays(d, 1)    : subDays(d, 1);
  if (period === 'week')  next = dir > 0 ? addWeeks(d, 1)   : subWeeks(d, 1);
  if (period === 'month') next = dir > 0 ? addMonths(d, 1)  : subMonths(d, 1);
  return format(next, 'yyyy-MM-dd');
}

function ScoreBar({ value, max = 100 }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = pct >= 80 ? '#D4AF37' : pct >= 50 ? '#00c875' : pct >= 30 ? '#fdab3d' : '#e2445c';
  return (
    <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function ScoreRing({ score }) {
  const isPositive = score >= 0;
  const color = score >= 50 ? '#D4AF37' : score >= 20 ? '#00c875' : score >= 0 ? '#fdab3d' : '#e2445c';
  return (
    <div className="flex flex-col items-center justify-center w-20 h-20 rounded-full border-4 flex-shrink-0"
      style={{ borderColor: color, backgroundColor: color + '15' }}>
      <span className="text-xl font-black leading-none" style={{ color }}>{score > 0 ? '+' : ''}{score}</span>
      <span className="text-[9px] text-gray-500 mt-0.5">pontos</span>
    </div>
  );
}

function fmtMinutes(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export function Reports() {
  const api = useApi();
  const { user: me } = useAuth();
  const canManage = ['owner', 'manager'].includes(me?.role);

  const [period, setPeriod] = useState('week');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [activeTab, setActiveTab] = useState('desempenho');
  const [sessions, setSessions] = useState([]);
  const [history, setHistory] = useState(null);
  const [goals, setGoals] = useState([]);
  const [goalInputs, setGoalInputs] = useState({});
  const [savingGoal, setSavingGoal] = useState({});

  useEffect(() => { api.get('/api/users').then(setUsers); }, []);
  useEffect(() => { api.get('/api/tasks').then(setTasks).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period, date, ...(userId ? { user_id: userId } : {}) });
      const data = await api.get(`/api/reports?${qs}`);
      setReport(data);
    } finally {
      setLoading(false);
    }
  }, [period, date, userId]);

  useEffect(() => { load(); }, [load]);

  const goTo = (dir) => setDate(d => navigate(period, d, dir));

  const toggle = (uid) => setExpanded(p => ({ ...p, [uid]: !p[uid] }));

  const topScorer = report?.report?.[0];

  useEffect(() => {
    if (activeTab === 'presenca' && canManage) {
      api.get('/api/sessions/today').then(setSessions).catch(() => {});
    }
    if (activeTab === 'historico') {
      api.get('/api/reports/history').then(setHistory).catch(() => {});
    }
    if (activeTab === 'metas' && canManage) {
      api.get('/api/goals').then(g => {
        setGoals(g);
        const inputs = {};
        g.forEach(goal => { inputs[goal.user_id] = goal.weekly_tasks; });
        setGoalInputs(inputs);
      }).catch(() => {});
    }
  }, [activeTab]);

  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    const today = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

    const userRows = report?.report.map(r => `
      <tr>
        <td>${r.user.name}</td>
        <td>${r.performance.score > 0 ? '+' : ''}${r.performance.score} pts</td>
        <td>${r.performance.on_time}</td>
        <td>${r.performance.late_done}</td>
        <td>${r.performance.overdue_total}</td>
        <td>${r.performance.completion_rate !== null ? r.performance.completion_rate + '%' : '—'}</td>
        <td>${TIERS[r.performance.tier]?.label}</td>
      </tr>
    `).join('') || '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório GS Mantos - ${today}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #333; border-bottom: 3px solid #D4AF37; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #D4AF37; color: #000; padding: 10px; text-align: left; }
          td { padding: 8px 10px; border-bottom: 1px solid #eee; }
          tr:nth-child(even) { background: #f9f9f9; }
          .footer { margin-top: 30px; font-size: 12px; color: #999; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>GS MANTOS — Relatório de Desempenho</h1>
        <p>Gerado em: ${today} | Período: ${periodLabel(period, date)}</p>
        <h2>Ranking da Equipe</h2>
        <table>
          <thead>
            <tr><th>Colaborador</th><th>Pontuação</th><th>No Prazo</th><th>Com Atraso</th><th>Não Feitas</th><th>Taxa</th><th>Nível</th></tr>
          </thead>
          <tbody>${userRows}</tbody>
        </table>
        <div class="footer">Sistema GS MANTOS — Team Hub</div>
        <br>
        <button onclick="window.print()">Imprimir / Salvar PDF</button>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const saveGoal = async (userId) => {
    setSavingGoal(p => ({ ...p, [userId]: true }));
    try {
      const updated = await api.put(`/api/goals/${userId}`, { weekly_tasks: goalInputs[userId] || 0 });
      setGoals(p => {
        const i = p.findIndex(g => g.user_id === userId);
        if (i === -1) return [...p, updated];
        return p.map(g => g.user_id === userId ? updated : g);
      });
    } catch {}
    setSavingGoal(p => ({ ...p, [userId]: false }));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <ChartBarIcon className="w-6 h-6" style={{ color: '#D4AF37' }} />
            Desempenho da Equipe
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Pontuação, tarefas no prazo e ranking por colaborador</p>
        </div>
        {activeTab === 'desempenho' && report && (
          <button onClick={exportPDF} className="flex items-center gap-2 btn-ghost border border-gray-700 text-sm px-3 py-2">
            📄 Exportar PDF
          </button>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-xl p-1 w-fit">
        {[
          { key: 'desempenho', label: 'Desempenho' },
          ...(canManage ? [{ key: 'presenca', label: 'Presença' }] : []),
          { key: 'historico', label: 'Histórico' },
          ...(canManage ? [{ key: 'metas', label: 'Metas' }] : []),
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === tab.key ? 'text-black font-bold' : 'text-gray-400 hover:text-gray-200'}`}
            style={activeTab === tab.key ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab === 'desempenho' && <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${period === p.key ? 'text-black font-bold' : 'text-gray-400 hover:text-gray-200'}`}
              style={period === p.key ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => goTo(-1)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-200 transition">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-200 min-w-[160px] text-center">
            {periodLabel(period, date)}
          </span>
          <button onClick={() => goTo(1)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-200 transition">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
          <button onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))} className="text-xs hover:underline ml-1" style={{ color: '#D4AF37' }}>Hoje</button>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 ml-auto">
            <FunnelIcon className="w-4 h-4 text-gray-400" />
            <select className="input w-44 py-1.5 text-sm" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Toda a equipe</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>}

      {activeTab === 'desempenho' && loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#D4AF37' }} />
        </div>
      )}

      {activeTab === 'desempenho' && !loading && report && (
        <>
          {/* Ranking podium (only if multiple users, manager view) */}
          {canManage && report.report.length > 1 && (
            <div className="card p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Ranking Geral</h2>
              <div className="space-y-3">
                {report.report.map((r, idx) => {
                  const tier = TIERS[r.performance.tier];
                  const TierIcon = tier.icon;
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <div key={r.user.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: idx === 0 ? '#1a1500' : '#111' }}>
                      <span className="text-xl w-8 text-center flex-shrink-0">{medals[idx] || `${idx + 1}°`}</span>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-black flex-shrink-0"
                        style={{ backgroundColor: r.user.avatar_color || '#D4AF37' }}>
                        {r.user.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-200">{r.user.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <ScoreBar value={r.performance.score} max={Math.max(...report.report.map(x => x.performance.score), 10)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <TierIcon className="w-4 h-4" style={{ color: tier.color }} />
                        <span className="text-sm font-black" style={{ color: tier.color }}>
                          {r.performance.score > 0 ? '+' : ''}{r.performance.score} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-user performance cards */}
          <div className="space-y-4">
            {report.report.map((r) => {
              const tier = TIERS[r.performance.tier];
              const TierIcon = tier.icon;
              const p = r.performance;
              const isOpen = expanded[r.user.id];

              return (
                <div key={r.user.id} className="card overflow-hidden border" style={{ borderColor: tier.border + '44' }}>

                  {/* User header */}
                  <button
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/5 transition"
                    onClick={() => toggle(r.user.id)}
                  >
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-black flex-shrink-0"
                      style={{ backgroundColor: r.user.avatar_color || '#D4AF37' }}>
                      {r.user.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>

                    {/* Name + tier badge */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-100">{r.user.name}</span>
                        <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ color: tier.color, backgroundColor: tier.bg, border: `1px solid ${tier.border}55` }}>
                          <TierIcon className="w-3 h-3" />
                          {tier.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 italic">"{tier.msg}"</p>
                    </div>

                    {/* Score ring */}
                    <ScoreRing score={p.score} />

                    <ChevronDownIcon className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-t" style={{ borderColor: '#1a1a1a' }}>
                    {[
                      { label: 'No Prazo', value: p.on_time, color: '#00c875', points: '+10 pts cada', icon: '✅' },
                      { label: 'Com Atraso', value: p.late_done, color: '#fdab3d', points: '+3 pts cada', icon: '⚠️' },
                      { label: 'Não Feitas', value: p.overdue_total, color: '#e2445c', points: '-5 pts cada', icon: '❌' },
                      { label: 'Taxa Conclusão', value: p.completion_rate !== null ? `${p.completion_rate}%` : '—', color: p.completion_rate >= 80 ? '#D4AF37' : p.completion_rate >= 50 ? '#fdab3d' : '#e2445c', points: 'do total com prazo', icon: '📊' },
                    ].map(s => (
                      <div key={s.label} className="flex flex-col items-center justify-center p-4 border-r last:border-r-0" style={{ borderColor: '#1a1a1a' }}>
                        <span className="text-lg mb-0.5">{s.icon}</span>
                        <span className="text-2xl font-black" style={{ color: s.color }}>{s.value}</span>
                        <span className="text-xs text-gray-500 text-center leading-tight mt-0.5">{s.label}</span>
                        <span className="text-[10px] text-gray-700 mt-0.5">{s.points}</span>
                      </div>
                    ))}
                  </div>

                  {/* Completion rate bar */}
                  {p.total_with_deadline > 0 && (
                    <div className="px-5 py-3 border-t" style={{ borderColor: '#1a1a1a' }}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>Progresso geral ({p.on_time + p.late_done} de {p.total_with_deadline} tarefas)</span>
                        <span style={{ color: tier.color }}>{p.completion_rate}%</span>
                      </div>
                      <ScoreBar value={p.on_time + p.late_done} max={p.total_with_deadline} />
                    </div>
                  )}

                  {/* Expanded task list */}
                  {isOpen && (
                    <div className="border-t" style={{ borderColor: '#1a1a1a' }}>
                      {/* Period summary */}
                      <div className="grid grid-cols-3 border-b" style={{ borderColor: '#1a1a1a' }}>
                        {[
                          { label: `Criadas no período`, value: r.summary.created, color: '#D4AF37' },
                          { label: `Concluídas no período`, value: r.summary.completed, color: '#00c875' },
                          { label: `Atrasadas`, value: r.summary.overdue, color: r.summary.overdue > 0 ? '#e2445c' : '#6b7280' },
                        ].map(s => (
                          <div key={s.label} className="flex flex-col items-center p-3 border-r last:border-r-0" style={{ borderColor: '#1a1a1a' }}>
                            <span className="text-xl font-bold" style={{ color: s.color }}>{s.value}</span>
                            <span className="text-xs text-gray-600 text-center">{s.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Tasks */}
                      {r.tasks.assigned.length === 0 ? (
                        <div className="py-10 text-center text-gray-600 text-sm">
                          Nenhuma tarefa atribuída neste período.
                        </div>
                      ) : (
                        <div className="divide-y" style={{ '--tw-divide-opacity': 1, borderColor: '#111' }}>
                          {r.tasks.assigned.map(task => {
                            const isDone = task.status === 'done';
                            const hasDeadline = !!task.deadline;
                            const deadlineEnd = hasDeadline ? new Date(task.deadline + 'T23:59:59') : null;
                            const onTime = isDone && task.completed_at && deadlineEnd && new Date(task.completed_at) <= deadlineEnd;
                            const lateDone = isDone && task.completed_at && deadlineEnd && new Date(task.completed_at) > deadlineEnd;
                            const overdue = !isDone && deadlineEnd && deadlineEnd < new Date();

                            let pointBadge = null;
                            if (onTime)   pointBadge = { label: '+10 pts', color: '#00c875', bg: '#0a2a1a' };
                            else if (lateDone) pointBadge = { label: '+3 pts', color: '#fdab3d', bg: '#2a1a0a' };
                            else if (overdue)  pointBadge = { label: '-5 pts', color: '#e2445c', bg: '#2a0a10' };

                            return (
                              <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-200 truncate">{task.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {task.deadline && (
                                      <span className={`text-xs ${overdue ? 'text-danger font-semibold' : 'text-gray-500'}`}>
                                        Prazo: {format(new Date(task.deadline), 'dd/MM')}
                                      </span>
                                    )}
                                    {task.completed_at && (
                                      <span className="text-xs text-gray-600">
                                        Feito: {format(new Date(task.completed_at), 'dd/MM HH:mm')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                                    {STATUS_LABELS[task.status]}
                                  </span>
                                  {pointBadge && (
                                    <span className="text-xs font-black px-2 py-0.5 rounded-full"
                                      style={{ color: pointBadge.color, backgroundColor: pointBadge.bg }}>
                                      {pointBadge.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {report.report.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <ChartBarIcon className="w-14 h-14 mx-auto mb-3 text-gray-700" />
              <p>Nenhum dado encontrado neste período.</p>
            </div>
          )}

          {/* Time efficiency table */}
          {(() => {
            const usersWithHours = report?.report?.filter(r => {
              const allTasks = tasks.filter(t => t.assignee_id === r.user.id && (t.estimated_hours > 0 || t.actual_hours > 0));
              return allTasks.length > 0;
            }) || [];
            if (usersWithHours.length === 0) return null;
            return (
              <div className="card p-5 mt-4">
                <h3 className="font-semibold text-gray-100 mb-4 flex items-center gap-2">
                  ⏱ Eficiência de Tempo
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Colaborador', 'Est. (h)', 'Real (h)', 'Diferença', 'Eficiência'].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.report.map(r => {
                        const userTasks = tasks.filter(t => t.assignee_id === r.user.id && (t.estimated_hours > 0 || t.actual_hours > 0));
                        if (userTasks.length === 0) return null;
                        const totalEst = userTasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
                        const totalReal = userTasks.reduce((s, t) => s + (t.actual_hours || 0), 0);
                        const diff = totalReal - totalEst;
                        const eff = totalEst > 0 && totalReal > 0 ? Math.round((totalEst / totalReal) * 100) : null;
                        return (
                          <tr key={r.user.id} className="border-b border-gray-900 hover:bg-white/5">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-black" style={{ backgroundColor: r.user.avatar_color || '#D4AF37' }}>
                                  {r.user.name[0]}
                                </div>
                                <span className="text-gray-200 font-medium">{r.user.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-gray-300">{totalEst > 0 ? `${totalEst}h` : '—'}</td>
                            <td className="py-2.5 px-3 text-gray-300">{totalReal > 0 ? `${totalReal}h` : '—'}</td>
                            <td className="py-2.5 px-3">
                              {totalEst > 0 && totalReal > 0 ? (
                                <span className={`font-bold text-xs ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                                  {diff > 0 ? `+${diff.toFixed(1)}h` : diff < 0 ? `${diff.toFixed(1)}h` : '='}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-2.5 px-3">
                              {eff != null ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-gray-800 max-w-[60px]">
                                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(eff, 100)}%`, backgroundColor: eff >= 100 ? '#00c875' : eff >= 80 ? '#fdab3d' : '#e2445c' }} />
                                  </div>
                                  <span className={`text-xs font-bold ${eff >= 100 ? 'text-green-400' : eff >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>{eff}%</span>
                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Points legend */}
          <div className="card p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Como funciona a pontuação</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {[
                { icon: '✅', label: 'Concluída no prazo', points: '+10 pts', color: '#00c875' },
                { icon: '⚠️', label: 'Concluída com atraso', points: '+3 pts', color: '#fdab3d' },
                { icon: '❌', label: 'Não feita (vencida)', points: '-5 pts', color: '#e2445c' },
                { icon: '🏆', label: 'Destaque: 90%+ no prazo', points: 'Badge de Ouro', color: '#D4AF37' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-2 p-3 rounded-lg bg-gray-900">
                  <span className="text-base">{item.icon}</span>
                  <div>
                    <p className="text-xs text-gray-400 leading-snug">{item.label}</p>
                    <p className="text-xs font-black mt-0.5" style={{ color: item.color }}>{item.points}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── PRESENÇA TAB ── */}
      {activeTab === 'presenca' && canManage && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Presença Online Hoje</h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-8">Nenhuma sessão registrada hoje.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map(({ user: u, total_minutes, last_seen }) => (
                  <div key={u.id} className="flex items-center gap-4 p-3 rounded-xl bg-gray-900">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-black flex-shrink-0"
                      style={{ backgroundColor: u.avatar_color || '#D4AF37' }}>
                      {u.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-200">{u.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (total_minutes / 480) * 100)}%`, backgroundColor: total_minutes > 0 ? '#00c875' : '#374151' }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className={`text-sm font-bold ${total_minutes > 0 ? 'text-success' : 'text-gray-600'}`}>{fmtMinutes(total_minutes)}</span>
                      {last_seen && total_minutes > 0 && (
                        <span className="text-[10px] text-gray-600">visto {format(new Date(last_seen), 'HH:mm')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTÓRICO TAB ── */}
      {activeTab === 'historico' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Histórico de Pontuação — Últimas 8 Semanas</h2>
            {!history ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#D4AF37' }} />
              </div>
            ) : history.weeks.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-8">Nenhum dado histórico disponível.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-3 min-w-max pb-2">
                  {history.weeks.map((week, wi) => {
                    const maxScore = Math.max(1, ...history.users.flatMap(u => [week.scores[u.id]?.score || 0]));
                    return (
                      <div key={wi} className="flex flex-col items-center gap-2 w-20 flex-shrink-0">
                        <div className="flex items-end gap-1 h-28">
                          {history.users.map(u => {
                            const score = Math.max(0, week.scores[u.id]?.score || 0);
                            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                            return (
                              <div key={u.id} className="flex flex-col items-center gap-0.5 flex-1 min-w-0" title={`${u.name}: ${score} pts`}>
                                <span className="text-[8px] text-gray-600 leading-none">{score}</span>
                                <div className="w-full rounded-t" style={{ height: `${Math.max(2, pct)}%`, minHeight: 2, backgroundColor: u.avatar_color || '#D4AF37', opacity: 0.85 }} />
                              </div>
                            );
                          })}
                        </div>
                        <span className="text-[9px] text-gray-500 text-center leading-tight">{week.label}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t" style={{ borderColor: '#1a1a1a' }}>
                  {history.users.map(u => (
                    <div key={u.id} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: u.avatar_color || '#D4AF37' }} />
                      <span className="text-xs text-gray-400">{u.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── METAS TAB ── */}
      {activeTab === 'metas' && canManage && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-1">Metas Semanais</h2>
            <p className="text-xs text-gray-600 mb-4">Defina quantas tarefas cada membro deve concluir por semana.</p>
            <div className="space-y-4">
              {users.map(u => {
                const goal = goals.find(g => g.user_id === u.id);
                const target = goal?.weekly_tasks || 0;
                const inputVal = goalInputs[u.id] !== undefined ? goalInputs[u.id] : target;
                // Count tasks done this week
                return (
                  <div key={u.id} className="flex items-center gap-4 p-4 rounded-xl bg-gray-900">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-black flex-shrink-0"
                      style={{ backgroundColor: u.avatar_color || '#D4AF37' }}>
                      {u.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-200 mb-2">{u.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Meta semanal:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="input w-20 text-sm py-1 px-2"
                          value={inputVal}
                          onChange={e => setGoalInputs(p => ({ ...p, [u.id]: parseInt(e.target.value) || 0 }))}
                        />
                        <span className="text-xs text-gray-500">tarefas</span>
                        <button
                          onClick={() => saveGoal(u.id)}
                          disabled={savingGoal[u.id]}
                          className="px-3 py-1 rounded-lg text-xs font-bold text-black disabled:opacity-50 transition"
                          style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}
                        >
                          {savingGoal[u.id] ? '...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
