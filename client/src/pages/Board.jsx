import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useApi } from '../contexts/ApiContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { VoiceInput } from '../components/VoiceInput.jsx';
import {
  PlusIcon, SparklesIcon, TrashIcon, PencilIcon, CalendarIcon,
  UserIcon, ArrowLeftIcon, XMarkIcon, CheckCircleIcon,
  ListBulletIcon, Squares2X2Icon, MagnifyingGlassIcon,
  PaperAirplaneIcon, CheckIcon, FunnelIcon, ChatBubbleLeftIcon,
  ClockIcon, FlagIcon, PaperClipIcon, LinkIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import { format, isPast, isToday, parseISO, getISOWeek, startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const COLUMNS = [
  { key: 'todo',        label: 'A Fazer',      color: '#c4c4c4', bg: 'bg-gray-500/10 border-gray-500/20' },
  { key: 'in_progress', label: 'Em Andamento',  color: '#fdab3d', bg: 'bg-orange-500/10 border-orange-500/20' },
  { key: 'stuck',       label: 'Parado',        color: '#e94c5e', bg: 'bg-red-500/10 border-red-500/20' },
  { key: 'review',      label: 'Em Revisão',    color: '#784bd1', bg: 'bg-purple-500/10 border-purple-500/20' },
  { key: 'done',        label: 'Concluído',     color: '#00c875', bg: 'bg-green-500/10 border-green-500/20' },
];

const PRIORITIES = [
  { value: 'low',      label: 'Baixa',    color: '#6b7280', bg: '#1f2937' },
  { value: 'medium',   label: 'Média',    color: '#fdab3d', bg: '#2a1f0a' },
  { value: 'high',     label: 'Alta',     color: '#e2445c', bg: '#2a0a10' },
  { value: 'critical', label: 'Crítica',  color: '#ef4444', bg: '#2a0505' },
];

const PRIORITY_BAR = { low: 'bg-gray-600', medium: 'bg-warning', high: 'bg-danger', critical: 'bg-red-600' };

const emptyForm = { title: '', description: '', status: 'todo', priority: 'medium', assignee_id: '', sector: '', start_date: '', deadline: '', recurring: 'none', recurrence: 'none', published_url: '', approval_status: '', depends_on: [], fixed: false, estimated_hours: '', actual_hours: '', attachments: [] };

// ── Anexos (links e imagens por URL) ──────────────────────────────────────────
function isImageUrl(u = '') {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(u) || u.startsWith('data:image/');
}
function attLabel(a) {
  if (a.name) return a.name;
  try { return new URL(a.url).hostname.replace(/^www\./, ''); } catch { return a.url; }
}
// Normaliza para array, aceitando string JSON, array ou vazio.
function parseAttachments(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

// Comprime a imagem no navegador (redimensiona + JPEG) para caber no banco sem pesar.
async function fileToCompressedDataUrl(file, maxDim = 1280, quality = 0.72) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (Math.max(w, h) > maxDim) {
    const s = maxDim / Math.max(w, h);
    w = Math.round(w * s); h = Math.round(h * s);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// Editor + visualização de anexos. `canEdit` controla a UI de adicionar/remover.
function Attachments({ value = [], onChange, canEdit = true }) {
  const api = useApi();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const list = Array.isArray(value) ? value : [];

  const add = () => {
    const u = url.trim();
    if (!u) return;
    const full = /^(https?:\/\/|data:)/i.test(u) ? u : `https://${u}`;
    onChange([...list, { url: full, name: name.trim() }]);
    setUrl(''); setName('');
  };
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Selecione uma imagem.'); return; }
    setUploading(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      const saved = await api.post('/api/attachments', { dataUrl, name: file.name });
      onChange([...list, { url: saved.url, name: saved.name, type: 'image' }]);
    } catch (err) {
      alert(err.message || 'Falha ao enviar a imagem');
    } finally {
      setUploading(false);
    }
  };

  const isImg = (a) => a.type === 'image' || isImageUrl(a.url);

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.map((a, i) => (
            isImg(a) ? (
              <div key={i} className="relative group/att">
                <a href={a.url} target="_blank" rel="noreferrer" title={attLabel(a)}>
                  <img src={a.url} alt={attLabel(a)} className="w-16 h-16 object-cover rounded-lg border" style={{ borderColor: '#2a2a2a' }} />
                </a>
                {canEdit && (
                  <button onClick={() => remove(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 border border-gray-600 text-gray-300 hover:text-danger flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition">
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <span key={i} className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border bg-gray-800/60 text-gray-200" style={{ borderColor: '#2a2a2a' }}>
                <LinkIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline max-w-[180px] truncate">{attLabel(a)}</a>
                {canEdit && (
                  <button onClick={() => remove(i)} className="text-gray-500 hover:text-danger flex-shrink-0">
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            )
          ))}
        </div>
      )}
      {canEdit && (
        <div className="space-y-2">
          {/* Upload de imagem do aparelho (ex: foto do WhatsApp) */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border border-dashed transition disabled:opacity-50 text-gray-300 hover:text-white hover:border-primary"
            style={{ borderColor: '#3a3a3a', backgroundColor: '#161616' }}
          >
            <PaperClipIcon className="w-4 h-4" />
            {uploading ? 'Enviando imagem…' : 'Enviar imagem do aparelho'}
          </button>
          {/* Ou colar um link / URL de imagem */}
          <div className="flex flex-wrap gap-2">
            <input
              className="input text-sm flex-1 min-w-[160px]"
              placeholder="…ou colar link ou URL da imagem"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            />
            <input
              className="input text-sm w-28 flex-shrink-0"
              placeholder="Nome (opcional)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            />
            <button type="button" onClick={add} disabled={!url.trim()} className="px-3 py-2 rounded-lg text-black text-sm font-bold disabled:opacity-40 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {!canEdit && list.length === 0 && <span className="text-sm text-gray-600">Nenhum anexo.</span>}
    </div>
  );
}

function fmtDate(d) {
  if (!d) return null;
  try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return d; }
}
function fmtTime(d) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM HH:mm'); } catch { return d; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TASK DRAWER
// ─────────────────────────────────────────────────────────────────────────────
// ── Emoji Reactions ───────────────────────────
const EMOJIS = ['👍', '❤️', '🔥', '✅', '😮'];

function CommentReactions({ comment, currentUserId, onReact }) {
  const reactions = comment.reactions || [];
  const counts = {};
  EMOJIS.forEach(e => {
    const reactors = reactions.filter(r => r.emoji === e);
    if (reactors.length > 0) counts[e] = { count: reactors.length, mine: reactors.some(r => r.user_id === currentUserId) };
  });

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {Object.entries(counts).map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          onClick={() => onReact(comment.id, emoji)}
          className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition ${mine ? 'border-primary bg-primary/20 text-primary' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'}`}
        >
          {emoji} <span>{count}</span>
        </button>
      ))}
      <div className="relative group">
        <button className="text-xs text-gray-600 hover:text-gray-400 px-1 transition">+</button>
        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex bg-gray-800 border border-gray-700 rounded-lg p-1 gap-1 shadow-xl z-10">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => onReact(comment.id, e)} className="text-base hover:scale-125 transition-transform p-0.5">{e}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── @Mention Input ────────────────────────────
function MentionInput({ value, onChange, onKeyDown, users, placeholder }) {
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const ref = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(e);
    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1 && lastAt === val.length - 1) {
      setShowMentions(true);
      setMentionSearch('');
    } else if (lastAt !== -1 && !val.slice(lastAt + 1).includes(' ')) {
      setShowMentions(true);
      setMentionSearch(val.slice(lastAt + 1));
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name) => {
    const lastAt = value.lastIndexOf('@');
    const newVal = value.slice(0, lastAt) + '@' + name.split(' ')[0] + ' ';
    onChange({ target: { value: newVal } });
    setShowMentions(false);
    ref.current?.focus();
  };

  const filtered = users.filter(u => u.name.toLowerCase().includes(mentionSearch.toLowerCase()));

  return (
    <div className="relative flex-1">
      <input
        ref={ref}
        className="input w-full text-sm"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
      />
      {showMentions && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 max-h-40 overflow-y-auto w-48">
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => insertMention(u.name)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 text-left text-sm text-gray-200"
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-black" style={{ backgroundColor: u.avatar_color || '#D4AF37' }}>
                {u.name[0].toUpperCase()}
              </div>
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskDrawer({ task, users, canManage, currentUser, onClose, onSave, onDelete, api, on, boardTasks }) {
  const [tab, setTab] = useState(task?._openTab || 'details');
  const [form, setForm] = useState({});
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const fileInputRef = useRef(null);
  const commentsEndRef = useRef(null);
  const { token } = useAuth();

  const canAct = canManage || task.creator_id === currentUser.id || task.assignee_id === currentUser.id;
  const canEditMeta = canManage; // só owner/manager podem mudar prazo ou deletar

  useEffect(() => {
    if (!task) return;
    setForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assignee_id: task.assignee_id || '',
      sector: task.sector || '',
      start_date: task.start_date ? task.start_date.slice(0, 10) : '',
      deadline: task.deadline ? task.deadline.slice(0, 10) : '',
      checklist: task.checklist ? JSON.parse(task.checklist) : [],
      recurring: task.recurring || 'none',
      recurrence: task.recurrence || 'none',
      published_url: task.published_url || '',
      attachments: parseAttachments(task.attachments),
      depends_on: task.depends_on ? JSON.parse(task.depends_on) : [],
      fixed: task.fixed || false,
      estimated_hours: task.estimated_hours != null ? String(task.estimated_hours) : '',
      actual_hours: task.actual_hours != null ? String(task.actual_hours) : '',
    });
    setTab(task._openTab || 'details');
    setNewComment('');
  }, [task?.id]);

  useEffect(() => {
    if (tab !== 'comments') return;
    api.get(`/api/tasks/${task.id}/comments`).then(setComments).catch(() => {});
  }, [tab, task?.id]);

  useEffect(() => {
    if (tab !== 'history') return;
    api.get(`/api/tasks/${task.id}/history`).then(setHistory).catch(() => {});
  }, [tab, task?.id]);

  useEffect(() => {
    const off = on(`task:comment:${task.id}`, (c) => {
      if (c.type === 'reaction_update') {
        setComments(p => p.map(x => x.id === c.comment.id ? c.comment : x));
      } else {
        setComments(p => [...p, c]);
      }
    });
    return () => off?.();
  }, [task?.id, on]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: typeof e === 'object' && e.target ? e.target.value : e }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        assignee_id: form.assignee_id || null,
        checklist: JSON.stringify(form.checklist || []),
        depends_on: JSON.stringify(form.depends_on || []),
        attachments: JSON.stringify(form.attachments || []),
      };
      await onSave(task.id, payload);
    } finally {
      setSaving(false);
    }
  };

  const handleReact = async (commentId, emoji) => {
    try {
      const updated = await api.post(`/api/comments/${commentId}/reactions`, { emoji });
      setComments(p => p.map(c => c.id === commentId ? updated : c));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande. Máximo 5MB.'); return; }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) throw new Error('Falha no upload');
      const data = await res.json();
      setPendingAttachment(data);
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  };

  const sendComment = async () => {
    if (!newComment.trim() || sending) return;
    setSending(true);
    try {
      const body = { content: newComment };
      if (pendingAttachment) {
        body.attachment_url = pendingAttachment.url;
        body.attachment_name = pendingAttachment.name;
      }
      const c = await api.post(`/api/tasks/${task.id}/comments`, body);
      setComments(p => [...p, c]);
      setNewComment('');
      setPendingAttachment(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  const toggleCheck = (idx) => {
    const updated = form.checklist.map((item, i) => i === idx ? { ...item, done: !item.done } : item);
    setForm(f => ({ ...f, checklist: updated }));
  };

  const addCheckItem = () => {
    if (!newItem.trim()) return;
    setForm(f => ({ ...f, checklist: [...(f.checklist || []), { id: Date.now(), text: newItem.trim(), done: false }] }));
    setNewItem('');
  };

  const removeCheckItem = (idx) => {
    setForm(f => ({ ...f, checklist: f.checklist.filter((_, i) => i !== idx) }));
  };

  const checklist = form.checklist || [];
  const doneCount = checklist.filter(i => i.done).length;
  const progress = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;

  const col = COLUMNS.find(c => c.key === form.status);
  const pri = PRIORITIES.find(p => p.value === form.priority);

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-full sm:w-[520px] h-full flex flex-col shadow-2xl border-l animate-slide-in"
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: '#222' }}>
          <div className="flex gap-1.5">
            {['details', 'checklist', 'comments', 'history'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t ? 'text-black' : 'text-gray-400 hover:text-gray-200'}`}
                style={tab === t ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
              >
                {t === 'details' ? 'Detalhes' : t === 'checklist' ? `Checklist${checklist.length ? ` (${doneCount}/${checklist.length})` : ''}` : t === 'comments' ? `Comentários${comments.length ? ` (${comments.length})` : ''}` : `Histórico${history.length ? ` (${history.length})` : ''}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {canEditMeta && (
              <button onClick={() => onDelete(task.id)} className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-danger transition">
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-200 transition">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          {canAct ? (
            <textarea
              className="w-full text-lg font-bold text-gray-100 bg-transparent resize-none border-none outline-none focus:ring-0 placeholder-gray-600 leading-snug"
              value={form.title}
              onChange={setF('title')}
              rows={2}
              placeholder="Título da tarefa…"
            />
          ) : (
            <h2 className="text-lg font-bold text-gray-100 leading-snug">{task.title}</h2>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">

          {/* ── DETAILS TAB ── */}
          {tab === 'details' && (
            <div className="space-y-4">
              {/* Status + Priority row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Status</label>
                  {canAct ? (
                    <select className="input text-sm" value={form.status} onChange={setF('status')}>
                      {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm font-semibold px-2 py-1 rounded" style={{ color: col?.color, backgroundColor: col?.color + '20' }}>{col?.label}</span>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Prioridade</label>
                  {canAct ? (
                    <select className="input text-sm" value={form.priority} onChange={setF('priority')}>
                      {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm font-semibold px-2 py-1 rounded" style={{ color: pri?.color, backgroundColor: pri?.bg }}>{pri?.label}</span>
                  )}
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Responsável</label>
                {canAct ? (
                  <select className="input text-sm" value={form.assignee_id} onChange={setF('assignee_id')}>
                    <option value="">Sem responsável</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    {task.assignee_id ? (
                      <Avatar user={users.find(u => u.id === task.assignee_id)} size="sm" showRole={false} />
                    ) : (
                      <span className="text-sm text-gray-500">Sem responsável</span>
                    )}
                    {task.assignee_name && <span className="text-sm text-gray-200">{task.assignee_name}</span>}
                  </div>
                )}
              </div>

              {/* Date range: Início → Fim + Sector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Cronograma</label>
                {canEditMeta ? (
                  <div className="flex items-center gap-2">
                    <input className="input text-sm flex-1" type="date" placeholder="Início" value={form.start_date} onChange={setF('start_date')} />
                    <span className="text-gray-500 text-sm flex-shrink-0">→</span>
                    <input className="input text-sm flex-1" type="date" placeholder="Fim / Prazo" value={form.deadline} onChange={setF('deadline')} />
                  </div>
                ) : (
                  <span className={`text-sm ${task.deadline && isPast(new Date(task.deadline)) && task.status !== 'done' ? 'text-danger' : 'text-gray-300'}`}>
                    {task.start_date && task.deadline && task.start_date !== task.deadline
                      ? `${fmtDate(task.start_date)} → ${fmtDate(task.deadline)}`
                      : fmtDate(task.deadline) || '—'}
                  </span>
                )}
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Setor</label>
                {canAct ? (
                  <input className="input text-sm" placeholder="Ex: Marketing…" value={form.sector} onChange={setF('sector')} />
                ) : (
                  <span className="text-sm text-gray-300">{task.sector || '—'}</span>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Descrição</label>
                {canAct ? (
                  <textarea
                    className="input text-sm resize-y"
                    rows={10}
                    placeholder="Adicione uma descrição detalhada…"
                    value={form.description}
                    onChange={setF('description')}
                  />
                ) : (
                  <p className="text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">{task.description || 'Sem descrição.'}</p>
                )}
              </div>

              {/* Publication URL */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Link de Publicação</label>
                {canAct ? (
                  <input className="input text-sm" placeholder="Cole o link do Story publicado..." value={form.published_url || ''} onChange={setF('published_url')} />
                ) : (
                  task.published_url ? (
                    <a href={task.published_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Ver publicação</a>
                  ) : <span className="text-sm text-gray-600">Não publicado ainda</span>
                )}
              </div>

              {/* Attachments — links e imagens */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                  <PaperClipIcon className="w-3.5 h-3.5" /> Anexos
                </label>
                <Attachments
                  value={form.attachments || []}
                  onChange={(next) => setForm(f => ({ ...f, attachments: next }))}
                  canEdit={canAct}
                />
              </div>

              {/* Time estimates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Horas Estimadas</label>
                  {canAct ? (
                    <input className="input text-sm" type="number" min="0" step="0.5" placeholder="Ex: 2.5" value={form.estimated_hours || ''} onChange={setF('estimated_hours')} />
                  ) : (
                    <span className="text-sm text-gray-300">{task.estimated_hours != null ? `${task.estimated_hours}h` : '—'}</span>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Horas Reais</label>
                  {canAct ? (
                    <input className="input text-sm" type="number" min="0" step="0.5" placeholder="Ex: 3" value={form.actual_hours || ''} onChange={setF('actual_hours')} />
                  ) : (
                    <span className={`text-sm font-semibold ${task.actual_hours != null && task.estimated_hours != null && task.actual_hours > task.estimated_hours ? 'text-danger' : 'text-gray-300'}`}>
                      {task.actual_hours != null ? `${task.actual_hours}h` : '—'}
                    </span>
                  )}
                </div>
              </div>

              {/* Approval */}
              {(task.approval_status || canEditMeta) && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Aprovação</label>
                  {canEditMeta ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => api.put(`/api/tasks/${task.id}/approve`, { approval_status: 'approved' })}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${task.approval_status === 'approved' ? 'bg-success text-white' : 'bg-gray-800 text-gray-400 hover:bg-success/20'}`}
                      >
                        ✅ Aprovar
                      </button>
                      <button
                        onClick={() => api.put(`/api/tasks/${task.id}/approve`, { approval_status: 'rejected' })}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${task.approval_status === 'rejected' ? 'bg-danger text-white' : 'bg-gray-800 text-gray-400 hover:bg-danger/20'}`}
                      >
                        ❌ Reprovar
                      </button>
                    </div>
                  ) : (
                    <span className={`text-sm font-bold ${task.approval_status === 'approved' ? 'text-success' : task.approval_status === 'rejected' ? 'text-danger' : 'text-gray-500'}`}>
                      {task.approval_status === 'approved' ? '✅ Aprovado' : task.approval_status === 'rejected' ? '❌ Reprovado' : '⏳ Aguardando aprovação'}
                    </span>
                  )}
                </div>
              )}

              {/* Dependencies */}
              {boardTasks && boardTasks.length > 1 && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Depende de</label>
                  <div className="space-y-1.5">
                    {(form.depends_on || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(form.depends_on || []).map(depId => {
                          const depTask = boardTasks.find(t => t.id === depId);
                          if (!depTask) return null;
                          return (
                            <span key={depId} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">
                              {depTask.status === 'done' ? '✅' : '🔒'} {depTask.title.slice(0, 30)}{depTask.title.length > 30 ? '…' : ''}
                              {canAct && (
                                <button onClick={() => setForm(f => ({ ...f, depends_on: (f.depends_on || []).filter(id => id !== depId) }))} className="text-gray-500 hover:text-danger ml-0.5">×</button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {canAct && (
                      <select
                        className="input text-sm"
                        value=""
                        onChange={e => {
                          const depId = parseInt(e.target.value);
                          if (!depId || depId === task.id) return;
                          setForm(f => ({
                            ...f,
                            depends_on: (f.depends_on || []).includes(depId) ? f.depends_on : [...(f.depends_on || []), depId]
                          }));
                        }}
                      >
                        <option value="">+ Adicionar dependência...</option>
                        {boardTasks.filter(t => t.id !== task.id && !(form.depends_on || []).includes(t.id)).map(t => (
                          <option key={t.id} value={t.id}>{t.title.slice(0, 50)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* Recurrence */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Recorrência Automática</label>
                {canAct ? (
                  <select
                    className="input text-sm"
                    value={form.recurrence || 'none'}
                    onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
                    style={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
                  >
                    <option value="none">Não se repete</option>
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                ) : (
                  <span className="text-sm text-gray-300">
                    {{ none: 'Não se repete', daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }[form.recurrence] || 'Não se repete'}
                  </span>
                )}
              </div>

              {/* Fixed task toggle */}
              {canManage && (
                <div className="flex items-center justify-between py-2 px-3 bg-gray-900 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">📌 Tarefa Fixa</p>
                    <p className="text-xs text-gray-500 mt-0.5">Aparece fixada todos os dias no board</p>
                  </div>
                  <button
                    onClick={() => setForm(f => ({ ...f, fixed: !f.fixed }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.fixed ? 'bg-yellow-500' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.fixed ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}

              {/* Meta */}
              <div className="pt-2 border-t text-xs text-gray-600 space-y-1" style={{ borderColor: '#222' }}>
                <p>Criado por <span className="text-gray-400">{task.creator_name}</span> em {fmtTime(task.created_at)}</p>
                {task.completed_at && <p>Concluído em <span className="text-success">{fmtTime(task.completed_at)}</span></p>}
              </div>

              {/* Save button */}
              {canAct && (
                <button onClick={handleSave} disabled={saving} className="w-full py-2.5 rounded-lg font-black text-sm tracking-wider uppercase transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)', color: '#000' }}>
                  {saving ? 'Salvando…' : 'Salvar Alterações'}
                </button>
              )}
            </div>
          )}

          {/* ── CHECKLIST TAB ── */}
          {tab === 'checklist' && (
            <div className="space-y-3 pt-1">
              {/* Progress bar */}
              {checklist.length > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>{doneCount} de {checklist.length} concluídos</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-800">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #D4AF37, #00c875)' }} />
                  </div>
                </div>
              )}

              {/* Items */}
              {checklist.map((item, idx) => (
                <div key={item.id} className="flex items-start gap-3 group">
                  <button onClick={() => toggleCheck(idx)} className="mt-0.5 flex-shrink-0">
                    {item.done
                      ? <CheckCircleSolid className="w-5 h-5 text-success" />
                      : <div className="w-5 h-5 rounded-full border-2 border-gray-600 hover:border-primary transition" />
                    }
                  </button>
                  <span className={`flex-1 text-sm leading-snug pt-0.5 ${item.done ? 'line-through text-gray-600' : 'text-gray-200'}`}>
                    {item.text}
                  </span>
                  {canAct && (
                    <button onClick={() => removeCheckItem(idx)} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-danger transition">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add item */}
              {canAct && (
                <div className="flex gap-2 pt-2">
                  <input
                    className="input flex-1 text-sm"
                    placeholder="Adicionar item ao checklist… (ou 🎤)"
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                  />
                  <VoiceInput size="md" onTranscript={(t) => setNewItem(prev => (prev ? prev + ' ' : '') + t)} title="Ditar item" />
                  <button onClick={addCheckItem} className="px-3 py-2 rounded-lg text-black text-sm font-bold" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </div>
              )}

              {checklist.length > 0 && canAct && (
                <button onClick={handleSave} disabled={saving} className="w-full py-2 rounded-lg font-bold text-sm tracking-wider uppercase text-black transition-all disabled:opacity-50 mt-2" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>
                  {saving ? 'Salvando…' : 'Salvar Checklist'}
                </button>
              )}

              {checklist.length === 0 && !canAct && (
                <p className="text-sm text-gray-600 text-center py-8">Nenhum item no checklist.</p>
              )}
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === 'history' && (
            <div className="space-y-2 pt-1">
              {history.length === 0 && (
                <p className="text-sm text-gray-600 text-center py-8">Nenhuma alteração registrada ainda.</p>
              )}
              {history.map(entry => (
                <div key={entry.id} className="flex gap-3 py-2 border-b" style={{ borderColor: '#1a1a1a' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-black flex-shrink-0 mt-0.5" style={{ backgroundColor: '#D4AF37' }}>
                    {entry.user_name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-300">{entry.user_name}</span>
                      <span className="text-xs text-gray-600">{(() => { try { return format(new Date(entry.changed_at), 'dd/MM HH:mm'); } catch { return ''; } })()}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <span className="text-gray-500">alterou </span>
                      <span className="text-gray-300 font-semibold">{entry.field}</span>
                      {entry.old_value && <><span className="text-gray-500"> de </span><span className="text-red-400 line-through">{entry.old_value}</span></>}
                      <span className="text-gray-500"> para </span>
                      <span className="text-green-400 font-semibold">{entry.new_value || '—'}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── COMMENTS TAB ── */}
          {tab === 'comments' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-3 pb-3 overflow-y-auto" style={{ minHeight: 0 }}>
                {comments.length === 0 && (
                  <p className="text-sm text-gray-600 text-center py-8">Nenhum comentário ainda. Seja o primeiro!</p>
                )}
                {comments.map(c => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-black flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: c.avatar_color || '#D4AF37' }}>
                      {c.user_name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-xs font-bold text-gray-300">{c.user_name}</span>
                        <span className="text-xs text-gray-600">{fmtTime(c.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-snug">{c.content}</p>
                      {c.attachment_url && (() => {
                        const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(c.attachment_url) || /\.(png|jpe?g|gif|webp|svg)$/i.test(c.attachment_name || '');
                        return isImage ? (
                          <img
                            src={c.attachment_url}
                            alt={c.attachment_name || 'anexo'}
                            className="mt-2 max-w-xs rounded-lg cursor-pointer"
                            onClick={() => window.open(c.attachment_url)}
                          />
                        ) : (
                          <a
                            href={c.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-blue-400 text-xs mt-1 hover:underline"
                          >
                            <PaperClipIcon className="w-3 h-3" />
                            {c.attachment_name || 'anexo'}
                          </a>
                        );
                      })()}
                      <CommentReactions comment={c} currentUserId={currentUser.id} onReact={handleReact} />
                    </div>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>

              {/* Comment input */}
              <div className="pt-3 border-t flex-shrink-0" style={{ borderColor: '#222' }}>
                {/* Attachment preview */}
                {pendingAttachment && (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
                    {/\.(png|jpe?g|gif|webp|svg)$/i.test(pendingAttachment.url) || /\.(png|jpe?g|gif|webp|svg)$/i.test(pendingAttachment.name) ? (
                      <img src={pendingAttachment.url} alt="preview" className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <PaperClipIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    )}
                    <span className="text-xs text-gray-300 flex-1 truncate">{pendingAttachment.name}</span>
                    <button onClick={() => setPendingAttachment(null)} className="text-gray-500 hover:text-danger transition">
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Anexar arquivo"
                    className="px-2 py-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/10 transition flex-shrink-0"
                  >
                    <PaperClipIcon className="w-4 h-4" />
                  </button>
                  <MentionInput
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                    users={users}
                    placeholder="Escrever comentário… use @ ou 🎤"
                  />
                  <VoiceInput size="md" onTranscript={(t) => setNewComment(prev => (prev ? prev + ' ' : '') + t)} title="Ditar comentário" />
                  <button onClick={sendComment} disabled={sending || !newComment.trim()} className="px-3 py-2 rounded-lg text-black flex-shrink-0 disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  TASK CARD
// ─────────────────────────────────────────────────────────────────────────────
function TaskCard({ task, canManage, userId, onOpen, onDelete, onDragStart, onStatusChange, allTasks }) {
  const isLate = task.deadline && isPast(new Date(task.deadline + 'T23:59:59')) && task.status !== 'done';
  const checklist = task.checklist ? JSON.parse(task.checklist) : [];
  const isBlocked = (() => {
    if (!task.depends_on || task.status === 'done') return false;
    try {
      const depIds = JSON.parse(task.depends_on);
      return depIds.some(depId => {
        const dep = (allTasks || []).find(t => t.id === depId);
        return dep && dep.status !== 'done';
      });
    } catch { return false; }
  })();
  const doneCount = checklist.filter(i => i.done).length;
  const attCount = parseAttachments(task.attachments).length;
  const col = COLUMNS.find(c => c.key === task.status);
  const canAct = canManage || task.creator_id === userId || task.assignee_id === userId;

  const cycleStatus = (e) => {
    e.stopPropagation();
    if (!canAct) return;
    const idx = COLUMNS.findIndex(c => c.key === task.status);
    const next = COLUMNS[(idx + 1) % COLUMNS.length].key;
    onStatusChange(task.id, next);
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="card p-3 cursor-pointer hover:border-gray-600 transition-all group"
    >
      <div className={`h-0.5 w-full ${PRIORITY_BAR[task.priority]} rounded-full mb-2.5 opacity-70`} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-200 leading-snug flex-1">{task.title}</p>
        {canManage && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 hover:bg-gray-700 rounded text-gray-600 hover:text-danger transition opacity-0 group-hover:opacity-100 flex-shrink-0"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-snug">{task.description}</p>
      )}

      {/* Checklist progress */}
      {checklist.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-gray-800">
            <div className="h-1 rounded-full bg-success transition-all" style={{ width: `${Math.round((doneCount / checklist.length) * 100)}%` }} />
          </div>
          <span className="text-xs text-gray-500">{doneCount}/{checklist.length}</span>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        {/* Inline status badge — click to cycle */}
        <button
          onClick={cycleStatus}
          title="Clique para mudar status"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition hover:opacity-80 flex-shrink-0"
          style={{ color: col?.color, backgroundColor: col?.color + '22', border: `1px solid ${col?.color}44` }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col?.color }} />
          {col?.label}
        </button>
        {isBlocked && (
          <span title="Bloqueada por dependência" className="text-[10px] text-gray-500">🔒</span>
        )}
        {task.fixed && (
          <span title="Tarefa fixa" className="text-[10px] text-yellow-500">📌</span>
        )}
        {task.recurring && task.recurring !== 'none' && (
          <span title="Tarefa recorrente" className="text-[10px] text-gray-500">🔄</span>
        )}
        {task.recurrence && task.recurrence !== 'none' && (
          <span title={`Prazo automático: ${task.recurrence}`} className="text-[10px] text-blue-400">↻</span>
        )}
        {attCount > 0 && (
          <span title={`${attCount} anexo${attCount !== 1 ? 's' : ''}`} className="flex items-center gap-0.5 text-[10px] text-gray-400">
            <PaperClipIcon className="w-3 h-3" />{attCount}
          </span>
        )}
        {task.approval_status === 'approved' && (
          <span title="Aprovado" className="text-[10px]">✅</span>
        )}
        {task.approval_status === 'rejected' && (
          <span title="Reprovado" className="text-[10px]">❌</span>
        )}
        <div className="flex-1" />
        {task.assignee_id ? (
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-black flex-shrink-0"
            style={{ backgroundColor: task.assignee_color || '#D4AF37' }}>
            {task.assignee_name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-800 border border-dashed border-gray-700 flex items-center justify-center">
            <UserIcon className="w-3 h-3 text-gray-600" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LIST VIEW  (Monday.com-style)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META = {
  todo:        { label: 'Não iniciado',  bg: '#c4c4c4', fg: '#333' },
  in_progress: { label: 'Em andamento',  bg: '#fdab3d', fg: '#fff' },
  stuck:       { label: 'Parado',        bg: '#e94c5e', fg: '#fff' },
  review:      { label: 'Em revisão',    bg: '#784bd1', fg: '#fff' },
  done:        { label: 'Feito',         bg: '#00c875', fg: '#fff' },
};

const PRIORITY_META = {
  low:      { label: 'Baixa',    color: '#579bfc' },
  medium:   { label: 'Média',    color: '#784bd1' },
  high:     { label: 'Alta',     color: '#fdab3d' },
  critical: { label: 'Crítico',  color: '#e94c5e', icon: '⚠️' },
};

const TURNO_META = {
  manha: { label: 'Manhã', color: '#fdab3d', icon: '🌅' },
  tarde: { label: 'Tarde', color: '#0073ea', icon: '☀️' },
  noite: { label: 'Noite', color: '#784bd1', icon: '🌙' },
};

function relativeTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const mins = differenceInMinutes(new Date(), d);
    if (mins < 60) return `${mins || 1} min atrás`;
    const hrs = differenceInHours(new Date(), d);
    if (hrs < 24) return `${hrs}h atrás`;
    return `${differenceInDays(new Date(), d)} dias atrás`;
  } catch { return '—'; }
}

function weekLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const weekNum = getISOWeek(d);
  const start = startOfISOWeek(d);
  const end = endOfISOWeek(d);
  const startDay = format(start, 'd', { locale: ptBR });
  const endDay = format(end, 'd', { locale: ptBR });
  return { label: `SEM ${weekNum} / ( ${startDay} A ${endDay} )`, weekNum };
}

function groupByWeek(tasks) {
  const groups = {};
  tasks.forEach(t => {
    if (!t.deadline) {
      if (!groups['__nodate__']) groups['__nodate__'] = { key: '__nodate__', label: 'Sem Data', tasks: [], weekNum: 9999 };
      groups['__nodate__'].tasks.push(t);
    } else {
      const d = new Date(t.deadline + 'T12:00:00');
      const weekStart = format(startOfISOWeek(d), 'yyyy-MM-dd');
      if (!groups[weekStart]) {
        const { label, weekNum } = weekLabel(t.deadline);
        groups[weekStart] = { key: weekStart, label, tasks: [], weekNum };
      }
      groups[weekStart].tasks.push(t);
    }
  });
  return Object.values(groups).sort((a, b) => a.weekNum - b.weekNum);
}

// Dropdown that floats next to the trigger button using fixed positioning.
// `anchorRect` is the bounding-rect of the trigger button (from getBoundingClientRect).
function CellDropdown({ children, onClose, anchorRect, minWidth = 180 }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    const onScroll = () => onClose();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  // Position below the trigger; if not enough space below, flip above
  const dropdownHeight = 260;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const flipAbove = spaceBelow < dropdownHeight && anchorRect.top > dropdownHeight;
  const top = flipAbove ? Math.max(8, anchorRect.top - 4) : anchorRect.bottom + 4;
  const transform = flipAbove ? 'translateY(-100%)' : 'none';
  // Center horizontally on the trigger but clamp inside viewport
  const idealLeft = anchorRect.left + anchorRect.width / 2 - minWidth / 2;
  const left = Math.min(Math.max(8, idealLeft), window.innerWidth - minWidth - 8);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="fixed z-[60] rounded-lg shadow-2xl border overflow-hidden"
      style={{ backgroundColor: '#1f1f1f', borderColor: '#3a3a3a', top, left, minWidth, transform, maxHeight: dropdownHeight, overflowY: 'auto' }}
    >
      {children}
    </div>,
    document.body
  );
}

function StatusCell({ task, canAct, onChangeStatus }) {
  const [anchorRect, setAnchorRect] = useState(null);
  const meta = STATUS_META[task.status] || STATUS_META.todo;
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!canAct) return;
    setAnchorRect(anchorRect ? null : e.currentTarget.getBoundingClientRect());
  };
  return (
    <div className="relative w-full h-full">
      <button
        onClick={handleOpen}
        className="w-full h-9 flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-90"
        style={{ backgroundColor: meta.bg, color: meta.fg }}
      >
        {meta.label}
      </button>
      {anchorRect && (
        <CellDropdown onClose={() => setAnchorRect(null)} anchorRect={anchorRect} minWidth={180}>
          {Object.entries(STATUS_META).map(([key, m]) => (
            <button
              key={key}
              onClick={e => { e.stopPropagation(); onChangeStatus(task.id, key); setAnchorRect(null); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold hover:opacity-90 transition"
              style={{ backgroundColor: m.bg, color: m.fg }}
            >
              {m.label}
            </button>
          ))}
        </CellDropdown>
      )}
    </div>
  );
}

function PriorityCell({ task, canAct, onSaveTask }) {
  const [anchorRect, setAnchorRect] = useState(null);
  const meta = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!canAct) return;
    setAnchorRect(anchorRect ? null : e.currentTarget.getBoundingClientRect());
  };
  return (
    <div className="relative w-full h-full">
      <button
        onClick={handleOpen}
        className="w-full h-9 flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-90"
        style={{ backgroundColor: meta.color, color: '#fff' }}
        title={meta.label}
      >
        {meta.icon && <span className="mr-1">{meta.icon}</span>}{meta.label}
      </button>
      {anchorRect && (
        <CellDropdown onClose={() => setAnchorRect(null)} anchorRect={anchorRect} minWidth={160}>
          {Object.entries(PRIORITY_META).map(([key, m]) => (
            <button
              key={key}
              onClick={e => { e.stopPropagation(); onSaveTask(task.id, { priority: key }); setAnchorRect(null); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold hover:opacity-90 transition"
              style={{ backgroundColor: m.color, color: '#fff' }}
            >
              {m.icon && <span>{m.icon}</span>}{m.label}
            </button>
          ))}
        </CellDropdown>
      )}
    </div>
  );
}

function TurnoCell({ task, canAct, onSaveTask }) {
  const [anchorRect, setAnchorRect] = useState(null);
  const meta = TURNO_META[task.turno];
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!canAct) return;
    setAnchorRect(anchorRect ? null : e.currentTarget.getBoundingClientRect());
  };
  return (
    <div className="relative w-full h-full">
      <button
        onClick={handleOpen}
        className="w-full h-9 flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-90"
        style={meta ? { backgroundColor: meta.color, color: '#fff' } : { backgroundColor: '#2d2d2d', color: '#666' }}
        title={meta ? meta.label : 'Definir turno'}
      >
        {meta ? <><span className="mr-1">{meta.icon}</span>{meta.label}</> : <span className="italic">—</span>}
      </button>
      {anchorRect && (
        <CellDropdown onClose={() => setAnchorRect(null)} anchorRect={anchorRect} minWidth={140}>
          <button
            onClick={e => { e.stopPropagation(); onSaveTask(task.id, { turno: null }); setAnchorRect(null); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold transition hover:opacity-90"
            style={{ backgroundColor: '#2d2d2d', color: '#aaa' }}
          >
            Sem turno
          </button>
          {Object.entries(TURNO_META).map(([key, m]) => (
            <button
              key={key}
              onClick={e => { e.stopPropagation(); onSaveTask(task.id, { turno: key }); setAnchorRect(null); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold hover:opacity-90 transition"
              style={{ backgroundColor: m.color, color: '#fff' }}
            >
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </CellDropdown>
      )}
    </div>
  );
}

function AssigneeCell({ task, users, canAct, onSaveTask }) {
  const [anchorRect, setAnchorRect] = useState(null);
  const assignee = users.find(u => u.id === task.assignee_id);
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!canAct) return;
    setAnchorRect(anchorRect ? null : e.currentTarget.getBoundingClientRect());
  };
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <button
        onClick={handleOpen}
        className="flex items-center justify-center w-8 h-8 rounded-full hover:ring-2 hover:ring-gray-600 transition"
        style={assignee ? { backgroundColor: assignee.avatar_color || '#D4AF37' } : { backgroundColor: '#2d2d2d', border: '1.5px dashed #4a4a4a' }}
        title={assignee?.name || 'Sem responsável'}
      >
        {assignee ? (
          <span className="text-[10px] font-black text-black">
            {assignee.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </span>
        ) : (
          <UserIcon className="w-4 h-4 text-gray-500" />
        )}
      </button>
      {anchorRect && (
        <CellDropdown onClose={() => setAnchorRect(null)} anchorRect={anchorRect} minWidth={200}>
          <button
            onClick={e => { e.stopPropagation(); onSaveTask(task.id, { assignee_id: null }); setAnchorRect(null); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-400 hover:bg-white/5 transition"
          >
            <span className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-800 border border-dashed border-gray-600">
              <UserIcon className="w-3 h-3 text-gray-500" />
            </span>
            Sem responsável
          </button>
          {users.map(u => (
            <button
              key={u.id}
              onClick={e => { e.stopPropagation(); onSaveTask(task.id, { assignee_id: u.id }); setAnchorRect(null); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-200 hover:bg-white/5 transition"
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-black flex-shrink-0"
                style={{ backgroundColor: u.avatar_color || '#D4AF37' }}>
                {u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              {u.name}
            </button>
          ))}
        </CellDropdown>
      )}
    </div>
  );
}

function DateRangePopover({ initialStart, initialEnd, onSave, onClose, anchorRect }) {
  const [start, setStart] = useState(initialStart || '');
  const [end, setEnd] = useState(initialEnd || '');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    const onScroll = () => onClose();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  const setPreset = (s, e) => { setStart(s); setEnd(e); };
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
  const inWeek = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
  const weekStartStr = format(startOfISOWeek(new Date()), 'yyyy-MM-dd');
  const weekEndStr = format(endOfISOWeek(new Date()), 'yyyy-MM-dd');

  const handleSave = () => {
    onSave({ start_date: start || null, deadline: end || start || null });
    onClose();
  };
  const handleClear = () => {
    onSave({ start_date: null, deadline: null });
    onClose();
  };

  const dayCount = (start && end) ? Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) + 1) : (end || start ? 1 : 0);

  if (!anchorRect) return null;
  const width = 320;
  const popHeight = 280;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const flipAbove = spaceBelow < popHeight && anchorRect.top > popHeight;
  const top = flipAbove ? Math.max(8, anchorRect.top - 4 - popHeight) : anchorRect.bottom + 4;
  const idealLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const left = Math.min(Math.max(8, idealLeft), window.innerWidth - width - 8);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="fixed z-[60] rounded-xl shadow-2xl border overflow-hidden p-4"
      style={{ backgroundColor: '#1f1f1f', borderColor: '#3a3a3a', width, top, left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-200">Definir datas</span>
        {dayCount > 0 && <span className="text-[10px] text-gray-500">{dayCount} dia{dayCount !== 1 ? 's' : ''} selecionado{dayCount !== 1 ? 's' : ''}</span>}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <label className="block text-[10px] text-gray-500 mb-1">Início</label>
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] text-gray-500 mb-1">Fim</label>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:border-yellow-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {[
          { label: 'Hoje', s: today, e: today },
          { label: 'Amanhã', s: tomorrow, e: tomorrow },
          { label: 'Esta semana', s: weekStartStr, e: weekEndStr },
          { label: '+ 7 dias', s: today, e: inWeek },
        ].map(p => (
          <button
            key={p.label}
            onClick={() => setPreset(p.s, p.e)}
            className="text-[10px] px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleClear} className="text-[10px] text-gray-500 hover:text-danger transition">Limpar</button>
        <div className="flex-1" />
        <button onClick={onClose} className="text-[10px] text-gray-400 hover:text-gray-200 px-2 py-1 transition">Cancelar</button>
        <button onClick={handleSave} className="text-[10px] font-bold text-black px-3 py-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg,#D4AF37,#f0d060)' }}>Salvar</button>
      </div>
    </div>,
    document.body
  );
}

function DeadlineCell({ task, canAct, onSaveTask }) {
  const [anchorRect, setAnchorRect] = useState(null);
  const isLate = task.deadline && isPast(new Date(task.deadline + 'T23:59:59')) && task.status !== 'done';
  const isDone = task.status === 'done';
  const hasRange = task.start_date && task.deadline && task.start_date !== task.deadline;

  const handleOpen = (e) => {
    e.stopPropagation();
    if (!canAct) return;
    setAnchorRect(anchorRect ? null : e.currentTarget.getBoundingClientRect());
  };

  const pillStyle = isLate
    ? { backgroundColor: '#e94c5e', color: '#fff' }
    : isDone
      ? { backgroundColor: '#00c875', color: '#fff' }
      : { backgroundColor: '#2d2d2d', color: '#d4d4d4' };

  return (
    <div className="relative w-full flex items-center justify-center">
      <button
        onClick={handleOpen}
        className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md transition hover:opacity-90"
        style={pillStyle}
      >
        {isLate && <span className="font-black">!</span>}
        {isDone && task.deadline && <CheckIcon className="w-3 h-3 flex-shrink-0" />}
        {hasRange ? (
          <span>{format(new Date(task.start_date + 'T12:00:00'), 'dd MMM', { locale: ptBR })} → {format(new Date(task.deadline + 'T12:00:00'), 'dd MMM', { locale: ptBR })}</span>
        ) : task.deadline ? (
          <span>{format(new Date(task.deadline + 'T12:00:00'), 'dd MMM', { locale: ptBR })}</span>
        ) : (
          <span style={{ color: '#666' }}>—</span>
        )}
      </button>
      {anchorRect && (
        <DateRangePopover
          initialStart={task.start_date || ''}
          initialEnd={task.deadline || ''}
          onSave={(payload) => onSaveTask(task.id, payload)}
          onClose={() => setAnchorRect(null)}
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
}

function HoursCell({ task, canAct, onSaveTask }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        min="0"
        step="0.5"
        defaultValue={task.estimated_hours ?? ''}
        className="w-16 text-xs bg-transparent border-b border-primary outline-none text-gray-200 px-2"
        onClick={e => e.stopPropagation()}
        onBlur={e => { onSaveTask(task.id, { estimated_hours: e.target.value ? parseFloat(e.target.value) : null }); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false); }}
      />
    );
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); if (canAct) setEditing(true); }}
      className="w-full text-center text-xs text-gray-500 hover:bg-white/5 px-2 py-1 rounded transition"
    >
      {task.estimated_hours != null ? `${task.estimated_hours}h` : '—'}
    </button>
  );
}

function fmtDuration(totalSec) {
  totalSec = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// Live time tracker pill (Monday-style: "0m 0s ▶")
function TimeTrackerCell({ task, canAct, api }) {
  const isRunning = !!task.timer_started_at;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [isRunning, task.timer_started_at]);

  const baseSec = task.tracked_seconds || 0;
  const liveSec = isRunning ? Math.floor((now - new Date(task.timer_started_at).getTime()) / 1000) : 0;
  const totalSec = baseSec + liveSec;

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (!canAct) return;
    try {
      if (isRunning) await api.post(`/api/tasks/${task.id}/timer/stop`, {});
      else await api.post(`/api/tasks/${task.id}/timer/start`, {});
    } catch (err) {
      alert(err.message || 'Erro no timer');
    }
  };

  return (
    <div className="w-full flex items-center justify-center gap-1.5 px-1">
      <span className={`text-[11px] font-semibold tabular-nums ${isRunning ? 'text-green-400' : 'text-gray-400'}`}>
        {fmtDuration(totalSec)}
      </span>
      <button
        onClick={handleToggle}
        className={`flex items-center justify-center w-5 h-5 rounded-full transition ${isRunning ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}
        title={isRunning ? 'Parar' : 'Iniciar cronômetro'}
        disabled={!canAct}
      >
        {isRunning ? (
          <span className="block w-1.5 h-1.5 bg-current rounded-sm" />
        ) : (
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
    </div>
  );
}

// Last-update cell: avatar + relative time
function LastUpdateCell({ task, users }) {
  // The most recent user is approximated by assignee (we don't track per-update author here)
  const updater = users.find(u => u.id === task.assignee_id) || users.find(u => u.id === task.creator_id);
  return (
    <div className="flex items-center gap-1.5">
      {updater ? (
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-black flex-shrink-0"
          style={{ backgroundColor: updater.avatar_color || '#D4AF37' }}
          title={updater.name}>
          {updater.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
          <UserIcon className="w-3 h-3 text-gray-500" />
        </div>
      )}
      <span className="text-[10px] text-gray-400 truncate">{relativeTime(task.updated_at || task.created_at)}</span>
    </div>
  );
}

function InlineAddTask({ defaultDeadline, users, boardId, onSave, indent = 0, placeholder = 'Adicionar tarefa', parentId = null, columnsCount = 9 }) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { if (active) inputRef.current?.focus(); }, [active]);

  const submit = async () => {
    if (!title.trim()) { setActive(false); return; }
    const payload = { title: title.trim(), deadline: defaultDeadline || null, status: 'todo', priority: 'medium' };
    if (parentId) payload.parent_id = parentId;
    await onSave(payload);
    setTitle('');
    setActive(false);
  };

  if (!active) {
    return (
      <tr style={{ borderTop: '1px solid #1a1a1a' }}>
        <td colSpan={columnsCount}>
          <button
            onClick={() => setActive(true)}
            className="flex items-center gap-2 py-1.5 text-xs text-gray-600 hover:text-gray-300 transition w-full"
            style={{ paddingLeft: `${24 + indent * 28}px` }}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {placeholder}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ backgroundColor: '#161616', borderTop: '1px solid #1a1a1a' }}>
      <td colSpan={columnsCount} className="py-1.5" style={{ paddingLeft: `${16 + indent * 28}px`, paddingRight: 12 }}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setActive(false); setTitle(''); } }}
            placeholder={parentId ? 'Nome do subelemento…' : 'Nome da tarefa…'}
            className="flex-1 text-sm bg-transparent outline-none text-gray-200 placeholder-gray-600 border-b border-primary"
          />
          <VoiceInput onTranscript={(t) => setTitle(prev => (prev ? prev + ' ' : '') + t)} title="Ditar nome da tarefa" />
          <button onClick={submit} className="text-xs px-2 py-1 rounded font-bold text-black" style={{ background: 'linear-gradient(135deg,#D4AF37,#f0d060)' }}>Salvar</button>
          <button onClick={() => { setActive(false); setTitle(''); }} className="text-xs text-gray-600 hover:text-gray-400">Cancelar</button>
        </div>
      </td>
    </tr>
  );
}

// Render a single task row (used both for top-level tasks and subtasks)
function TaskRow({ task, users, canAct, canManage, userId, onOpen, onDelete, onSaveTask, onChangeStatus, onToggleSubtasks, isExpanded, isSubtask = false, hasSubtasks = false, indent = 0, api, groupColor = '#fdab3d' }) {
  const baseBg = isSubtask ? '#252525' : '#1f1f1f';
  const hoverBg = isSubtask ? '#2e2e2e' : '#272727';
  return (
    <tr
      onClick={() => onOpen(task)}
      className="cursor-pointer group transition-colors"
      style={{ borderBottom: '1px solid #2d2d2d', backgroundColor: baseBg }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverBg}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = baseBg}
    >
      {/* Group color bar + checkbox + expand */}
      <td className="py-0 w-14" style={{ borderLeft: `4px solid ${isSubtask ? '#0073ea88' : groupColor}`, paddingLeft: `${10 + indent * 22}px`, paddingRight: 4, borderRight: '1px solid #2d2d2d' }}>
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={task.status === 'done'}
            onChange={e => { e.stopPropagation(); onChangeStatus(task.id, e.target.checked ? 'done' : 'todo'); }}
            onClick={e => e.stopPropagation()}
            className="w-3.5 h-3.5 rounded accent-green-500 cursor-pointer flex-shrink-0"
          />
          {hasSubtasks ? (
            <button
              onClick={e => { e.stopPropagation(); onToggleSubtasks(task.id); }}
              className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition flex-shrink-0"
              title={isExpanded ? 'Recolher subelementos' : 'Expandir subelementos'}
            >
              {isExpanded
                ? <ChevronDownIcon className="w-3.5 h-3.5" />
                : <ChevronRightIcon className="w-3.5 h-3.5" />
              }
            </button>
          ) : null}
        </div>
      </td>

      {/* Title + comment badge */}
      <td className="py-0 pl-3 pr-3" style={{ minWidth: 240, borderRight: '1px solid #2d2d2d' }}>
        <div className="flex items-center gap-2 py-2.5">
          <span className={`text-[13px] font-medium leading-snug truncate uppercase ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-100'}`}>
            {task.title}
          </span>
          {/* Updates bubble — opens drawer to comments tab */}
          <button
            onClick={e => { e.stopPropagation(); onOpen(task, { tab: 'comments' }); }}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition flex-shrink-0 ${task.comment_count > 0 ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25' : 'opacity-0 group-hover:opacity-100 bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'}`}
            title="Atualizações"
          >
            <ChatBubbleLeftIcon className="w-3 h-3" />
            {task.comment_count > 0 && <span className="font-bold">{task.comment_count}</span>}
          </button>
          {/* Subtask count chip */}
          {hasSubtasks && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 flex-shrink-0" title={`${task.subtask_count} subelemento${task.subtask_count !== 1 ? 's' : ''}`}>
              {task.subtask_count}
            </span>
          )}
          {task.fixed && <span title="Fixada" className="text-[10px] text-yellow-500 flex-shrink-0">📌</span>}
        </div>
      </td>

      {/* Responsável */}
      <td className="py-0 px-1 w-28" onClick={e => e.stopPropagation()} style={{ borderRight: '1px solid #2d2d2d' }}>
        <AssigneeCell task={task} users={users} canAct={canAct} onSaveTask={onSaveTask} />
      </td>

      {/* Status — full colored cell */}
      <td className="py-0 px-0 w-36" onClick={e => e.stopPropagation()} style={{ padding: 0, borderRight: '1px solid #2d2d2d' }}>
        <StatusCell task={task} canAct={canAct} onChangeStatus={onChangeStatus} />
      </td>

      {/* Prioridade — full colored cell */}
      <td className="py-0 px-0 w-28" onClick={e => e.stopPropagation()} style={{ padding: 0, borderRight: '1px solid #2d2d2d' }}>
        <PriorityCell task={task} canAct={canAct} onSaveTask={onSaveTask} />
      </td>

      {/* Turno */}
      <td className="py-0 px-0 w-24" onClick={e => e.stopPropagation()} style={{ padding: 0, borderRight: '1px solid #2d2d2d' }}>
        <TurnoCell task={task} canAct={canAct} onSaveTask={onSaveTask} />
      </td>

      {/* Cronograma */}
      <td className="py-0 px-2 w-36" onClick={e => e.stopPropagation()} style={{ borderRight: '1px solid #2d2d2d' }}>
        <DeadlineCell task={task} canAct={canAct} onSaveTask={onSaveTask} />
      </td>

      {/* Controle de tempo (live tracker) */}
      <td className="py-0 px-1 w-24" onClick={e => e.stopPropagation()} style={{ borderRight: '1px solid #2d2d2d' }}>
        <TimeTrackerCell task={task} canAct={canAct} api={api} />
      </td>

      {/* Última atualização */}
      <td className="py-0 px-2.5 w-32" style={{ borderRight: '1px solid #2d2d2d' }}>
        <LastUpdateCell task={task} users={users} />
      </td>

      {/* Actions */}
      <td className="py-0 px-2 w-10 text-center">
        {canAct && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(task.id); }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-danger transition"
            title="Remover"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

// Monday-style group palette (cycle by index)
const GROUP_COLORS = ['#fdab3d', '#0073ea', '#00c875', '#a25ddc', '#e94c5e', '#00cec9', '#fdab3d'];

function ListViewGroup({ group, groupIdx, users, canManage, userId, onOpen, onDelete, onSaveTask, onChangeStatus, boardId, onCreateTask, allTasks, expandedTaskIds, onToggleSubtasks, api }) {
  const [collapsed, setCollapsed] = useState(false);
  const groupColor = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

  // Per-group stats
  const totalEst = group.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
  const doneCount = group.tasks.filter(t => t.status === 'done').length;
  const COL_COUNT = 10;

  return (
    <>
      {/* Group header row */}
      <tr style={{ backgroundColor: '#1a1a1a' }}>
        <td colSpan={COL_COUNT} style={{ borderLeft: `4px solid ${groupColor}`, padding: 0 }}>
          <button
            className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-white/[0.03] transition"
            onClick={() => setCollapsed(c => !c)}
          >
            {collapsed
              ? <ChevronRightIcon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              : <ChevronDownIcon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            }
            <span className="text-xs font-bold tracking-wide uppercase" style={{ color: groupColor }}>{group.label}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-gray-300" style={{ backgroundColor: '#2d2d2d' }}>
              {group.tasks.length} {group.tasks.length === 1 ? 'tarefa' : 'tarefas'}
            </span>
            {doneCount > 0 && (
              <span className="text-[10px] text-gray-500">• {doneCount} concluída{doneCount !== 1 ? 's' : ''}</span>
            )}
            {totalEst > 0 && (
              <span className="text-[10px] text-gray-500">• {totalEst}h estimadas</span>
            )}
          </button>
        </td>
      </tr>

      {/* Top-level task rows + their subtasks */}
      {!collapsed && group.tasks.map(task => {
        const canAct = canManage || task.creator_id === userId || task.assignee_id === userId;
        const hasSubtasks = (task.subtask_count || 0) > 0;
        const isExpanded = expandedTaskIds.has(task.id);
        const subtasks = isExpanded ? allTasks.filter(t => t.parent_id === task.id) : [];

        return (
          <React.Fragment key={task.id}>
            <TaskRow
              task={task}
              users={users}
              canAct={canAct}
              canManage={canManage}
              userId={userId}
              onOpen={onOpen}
              onDelete={onDelete}
              onSaveTask={onSaveTask}
              onChangeStatus={onChangeStatus}
              onToggleSubtasks={onToggleSubtasks}
              isExpanded={isExpanded}
              hasSubtasks={hasSubtasks}
              indent={0}
              api={api}
              groupColor={groupColor}
            />
            {/* Subtask rows */}
            {isExpanded && subtasks.map(sub => {
              const subCanAct = canManage || sub.creator_id === userId || sub.assignee_id === userId;
              return (
                <TaskRow
                  key={sub.id}
                  task={sub}
                  users={users}
                  canAct={subCanAct}
                  canManage={canManage}
                  userId={userId}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onSaveTask={onSaveTask}
                  onChangeStatus={onChangeStatus}
                  onToggleSubtasks={() => {}}
                  isSubtask
                  indent={1}
                  api={api}
                  groupColor={groupColor}
                />
              );
            })}
            {/* Inline add subtask row when expanded */}
            {isExpanded && (
              <InlineAddTask
                defaultDeadline={task.deadline || null}
                users={users}
                boardId={boardId}
                onSave={onCreateTask}
                indent={1}
                placeholder="+ Adicionar subelemento"
                parentId={task.id}
                columnsCount={COL_COUNT}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Inline add task row at the bottom of the group */}
      {!collapsed && (
        <InlineAddTask
          defaultDeadline={group.key !== '__nodate__' ? group.key : null}
          users={users}
          boardId={boardId}
          onSave={onCreateTask}
          columnsCount={COL_COUNT}
        />
      )}
    </>
  );
}

function ListView({ tasks, allTasks, users, canManage, userId, onOpen, onDelete, onSaveTask, onChangeStatus, boardId, onCreateTask, api }) {
  const topLevel = tasks.filter(t => !t.parent_id);
  const groups = groupByWeek(topLevel);
  const [expandedTaskIds, setExpandedTaskIds] = useState(new Set());

  const toggleSubtasks = (taskId) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto px-4 sm:px-6 py-4" style={{ backgroundColor: '#161616' }}>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#2d2d2d', backgroundColor: '#1f1f1f' }}>
        <table className="w-full border-collapse" style={{ minWidth: 1080 }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #2d2d2d', position: 'sticky', top: 0, zIndex: 10 }}>
              <th className="w-14 py-2.5" style={{ paddingLeft: 14, borderRight: '1px solid #2d2d2d' }} />
              <th className="text-left py-2.5 pl-3 pr-3 text-[10px] font-bold uppercase tracking-widest text-gray-400" style={{ borderRight: '1px solid #2d2d2d' }}>Tarefa</th>
              <th className="py-2.5 px-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-28 text-center" style={{ borderRight: '1px solid #2d2d2d' }}>Responsáv...</th>
              <th className="py-2.5 px-0 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-36 text-center" style={{ borderRight: '1px solid #2d2d2d' }}>Status</th>
              <th className="py-2.5 px-0 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-28 text-center" style={{ borderRight: '1px solid #2d2d2d' }}>Prioridade</th>
              <th className="py-2.5 px-0 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-24 text-center" style={{ borderRight: '1px solid #2d2d2d' }}>Turno</th>
              <th className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-36 text-center" style={{ borderRight: '1px solid #2d2d2d' }}>Cronograma</th>
              <th className="py-2.5 px-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-24 text-center" style={{ borderRight: '1px solid #2d2d2d' }}>Controle de tempo</th>
              <th className="py-2.5 px-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-32 text-left" style={{ borderRight: '1px solid #2d2d2d' }}>Última atualizaç...</th>
              <th className="w-10 py-2.5 px-2 text-center text-gray-500 text-xs">+</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={10} className="py-16 text-center text-gray-600 text-sm" style={{ backgroundColor: '#1f1f1f' }}>Nenhuma tarefa encontrada.</td></tr>
            )}
            {groups.map((group, idx) => (
              <ListViewGroup
                key={group.key}
                group={group}
                groupIdx={idx}
                users={users}
                canManage={canManage}
                userId={userId}
                onOpen={onOpen}
                onDelete={onDelete}
                onSaveTask={onSaveTask}
                onChangeStatus={onChangeStatus}
                boardId={boardId}
                onCreateTask={onCreateTask}
                allTasks={allTasks}
                expandedTaskIds={expandedTaskIds}
                onToggleSubtasks={toggleSubtasks}
                api={api}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOARD CALENDAR
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLORS = { todo: '#c4c4c4', in_progress: '#fdab3d', stuck: '#e94c5e', review: '#784bd1', done: '#00c875' };

// ─────────────────────────────────────────────────────────────────────────────
//  BOARD DASHBOARD (per-board performance view)
// ─────────────────────────────────────────────────────────────────────────────
function BoardDashboard({ tasks, users, currentUser, canManage, onOpenTask }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const weekStart = format(startOfISOWeek(new Date()), 'yyyy-MM-dd');
  const weekEnd = format(endOfISOWeek(new Date()), 'yyyy-MM-dd');

  // Operacional users see only their own data; owners/managers can switch user
  const [selectedUserId, setSelectedUserId] = useState(currentUser.id);
  const targetId = canManage ? selectedUserId : currentUser.id;
  const targetUser = users.find(u => u.id === targetId) || currentUser;

  // Filter tasks for target user (top-level only)
  const userTasks = tasks.filter(t => !t.parent_id && t.assignee_id === targetId);

  const tasksToday = userTasks.filter(t => {
    if (!t.deadline && !t.start_date) return false;
    const start = t.start_date || t.deadline;
    const end = t.deadline || t.start_date;
    return todayStr >= start && todayStr <= end;
  });
  const tasksWeek = userTasks.filter(t => {
    const end = t.deadline || t.start_date;
    const start = t.start_date || t.deadline;
    if (!end) return false;
    return end >= weekStart && start <= weekEnd;
  });
  const tasksDone = userTasks.filter(t => t.status === 'done');
  const tasksDoneWeek = userTasks.filter(t => t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) >= weekStart && t.completed_at.slice(0, 10) <= weekEnd);
  const tasksRemaining = userTasks.filter(t => t.status !== 'done');
  const tasksLate = userTasks.filter(t => t.deadline && t.deadline < todayStr && t.status !== 'done');

  // Points: 10 per done task, +2 if done before deadline, -5 per late task
  const points = tasksDone.reduce((sum, t) => {
    let p = 10;
    if (t.deadline && t.completed_at && t.completed_at.slice(0, 10) <= t.deadline) p += 2;
    return sum + p;
  }, 0) - tasksLate.length * 5;

  const weekProgress = tasksWeek.length > 0 ? Math.round((tasksDoneWeek.length / tasksWeek.length) * 100) : 0;

  const stats = [
    { label: 'Hoje',           value: tasksToday.length,     icon: '📅', color: '#fdab3d', sub: tasksToday.filter(t => t.status === 'done').length + ' concluídas' },
    { label: 'Esta semana',    value: tasksWeek.length,      icon: '🗓️', color: '#0073ea', sub: weekProgress + '% no prazo' },
    { label: 'Concluídas',     value: tasksDone.length,      icon: '✅', color: '#00c875', sub: tasksDoneWeek.length + ' nesta semana' },
    { label: 'Pendentes',      value: tasksRemaining.length, icon: '⏳', color: '#784bd1', sub: 'A entregar' },
    { label: 'Atrasadas',      value: tasksLate.length,      icon: '⚠️', color: '#e94c5e', sub: tasksLate.length > 0 ? 'Atenção!' : 'Em dia' },
    { label: 'Pontos',         value: points,                icon: '🏆', color: '#D4AF37', sub: '+10 por entrega · -5 atraso' },
  ];

  return (
    <div className="overflow-y-auto h-full px-4 sm:px-6 py-5" style={{ backgroundColor: '#161616' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-black text-white">Desempenho{targetUser.id !== currentUser.id ? ` — ${targetUser.name}` : ''}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Visão geral das suas tarefas neste board</p>
          </div>
          {canManage && (
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:border-yellow-500"
            >
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl border p-4" style={{ backgroundColor: '#1f1f1f', borderColor: '#2d2d2d' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{s.label}</span>
                <span className="text-lg">{s.icon}</span>
              </div>
              <div className="text-3xl font-black" style={{ color: s.color }}>{s.value}</div>
              <p className="text-[10px] text-gray-500 mt-1.5 truncate">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Week progress bar */}
        <div className="rounded-xl border p-4 mb-6" style={{ backgroundColor: '#1f1f1f', borderColor: '#2d2d2d' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Progresso da semana</span>
            <span className="text-xs font-black text-yellow-400">{tasksDoneWeek.length} / {tasksWeek.length}</span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${weekProgress}%`, background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }} />
          </div>
          <p className="text-[10px] text-gray-500 mt-2">Semana: {format(startOfISOWeek(new Date()), 'dd MMM', { locale: ptBR })} → {format(endOfISOWeek(new Date()), 'dd MMM', { locale: ptBR })}</p>
        </div>

        {/* Today's tasks */}
        <div className="rounded-xl border mb-4" style={{ backgroundColor: '#1f1f1f', borderColor: '#2d2d2d' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#2d2d2d' }}>
            <h3 className="text-sm font-black text-white">📅 Tarefas de hoje</h3>
            <span className="text-[10px] text-gray-500">{tasksToday.length} tarefa{tasksToday.length !== 1 ? 's' : ''}</span>
          </div>
          {tasksToday.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-6">Nenhuma tarefa para hoje.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#2d2d2d' }}>
              {tasksToday.map(t => {
                const meta = STATUS_META[t.status];
                return (
                  <button key={t.id} onClick={() => onOpenTask(t)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition text-left">
                    <input type="checkbox" checked={t.status === 'done'} readOnly className="w-3.5 h-3.5 rounded accent-green-500" />
                    <span className={`flex-1 text-sm truncate ${t.status === 'done' ? 'line-through text-gray-500' : 'text-gray-200'}`}>{t.title}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: meta.bg, color: meta.fg }}>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Late tasks alert */}
        {tasksLate.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor: '#2a0a0e', borderColor: '#4a1820' }}>
            <h3 className="text-sm font-black text-red-300 mb-2">⚠️ {tasksLate.length} tarefa{tasksLate.length !== 1 ? 's' : ''} atrasada{tasksLate.length !== 1 ? 's' : ''}</h3>
            <div className="space-y-1.5">
              {tasksLate.slice(0, 5).map(t => (
                <button key={t.id} onClick={() => onOpenTask(t)}
                  className="w-full flex items-center justify-between gap-2 text-xs hover:bg-white/5 px-2 py-1.5 rounded text-left">
                  <span className="text-gray-200 truncate flex-1">{t.title}</span>
                  <span className="text-red-400 font-semibold text-[10px]">venceu {format(new Date(t.deadline + 'T12:00:00'), 'dd MMM', { locale: ptBR })}</span>
                </button>
              ))}
              {tasksLate.length > 5 && (
                <p className="text-[10px] text-gray-500 px-2">e mais {tasksLate.length - 5}…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BoardCalendar({ tasks, onOpenTask }) {
  const [calMode, setCalMode] = useState('month'); // 'month' | 'week'
  const [current, setCurrent] = useState(new Date());

  // Build day cells
  let days = [];
  let headerLabel = '';
  if (calMode === 'month') {
    const mStart = startOfMonth(current);
    const mEnd = endOfMonth(current);
    const gridStart = startOfWeek(mStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(mEnd, { weekStartsOn: 0 });
    days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    headerLabel = format(current, 'MMMM yyyy', { locale: ptBR });
  } else {
    const wStart = startOfWeek(current, { weekStartsOn: 0 });
    const wEnd = endOfWeek(current, { weekStartsOn: 0 });
    days = eachDayOfInterval({ start: wStart, end: wEnd });
    headerLabel = `${format(wStart, 'dd MMM', { locale: ptBR })} – ${format(wEnd, 'dd MMM yyyy', { locale: ptBR })}`;
  }

  const navigate = (dir) => {
    const d = new Date(current);
    if (calMode === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCurrent(d);
  };

  // Map tasks to days they span
  const tasksByDay = {};
  tasks.forEach(task => {
    if (!task.deadline && !task.start_date) return;
    const start = task.start_date || task.deadline;
    const end = task.deadline || task.start_date;
    try {
      const dayList = eachDayOfInterval({ start: new Date(start + 'T12:00:00'), end: new Date(end + 'T12:00:00') });
      dayList.forEach(d => {
        const key = format(d, 'yyyy-MM-dd');
        if (!tasksByDay[key]) tasksByDay[key] = [];
        tasksByDay[key].push(task);
      });
    } catch {}
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const DAY_LABELS = calMode === 'month'
    ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    : ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const currentMonthNum = current.getMonth();

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#0d0d0d' }}>
      {/* Calendar header */}
      <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0" style={{ borderColor: '#1a1a1a' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-sm font-bold text-gray-200 capitalize min-w-[160px] text-center">{headerLabel}</h2>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button onClick={() => setCurrent(new Date())} className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition ml-1">Hoje</button>
        </div>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: '#2a2a2a' }}>
          {[['month', 'Mês'], ['week', 'Semana']].map(([mode, label]) => (
            <button key={mode} onClick={() => setCalMode(mode)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${calMode === mode ? 'text-black' : 'text-gray-500 hover:text-gray-300'}`}
              style={calMode === mode ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Day headers */}
      <div className={`grid flex-shrink-0`} style={{ gridTemplateColumns: `repeat(7, 1fr)`, borderBottom: '1px solid #1a1a1a' }}>
        {DAY_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: calMode === 'week' ? '1fr' : 'minmax(80px, auto)' }}>
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const isToday_ = key === today;
            const isOtherMonth = calMode === 'month' && day.getMonth() !== currentMonthNum;
            const dayTasks = tasksByDay[key] || [];

            return (
              <div key={key} className="border-r border-b p-1.5 min-h-[80px]"
                style={{ borderColor: '#1a1a1a', backgroundColor: isToday_ ? '#1a1a0f' : isOtherMonth ? '#0a0a0a' : '#0d0d0d' }}>
                <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday_ ? 'text-black' : isOtherMonth ? 'text-gray-700' : 'text-gray-500'}`}
                  style={isToday_ ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map(task => (
                    <button
                      key={task.id}
                      onClick={() => onOpenTask(task)}
                      className="w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate hover:opacity-80 transition"
                      style={{ backgroundColor: STATUS_COLORS[task.status] + '33', color: STATUS_COLORS[task.status], border: `1px solid ${STATUS_COLORS[task.status]}55` }}
                      title={task.title}
                    >
                      {task.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-gray-600 px-1">+{dayTasks.length - 3} mais</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN BOARD
// ─────────────────────────────────────────────────────────────────────────────
export function Board() {
  const { id } = useParams();
  const { user } = useAuth();
  const api = useApi();
  const { on, connected } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();

  const [board, setBoard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [view, setView] = useState('kanban');
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  // Sort: { field: 'deadline' | 'priority' | 'status' | 'turno' | 'title' | 'updated_at' | 'assignee' | '', dir: 'asc' | 'desc' }
  const [sortBy, setSortBy] = useState({ field: '', dir: 'asc' });
  const [showSortMenu, setShowSortMenu] = useState(false);
  // Saved views per board (localStorage)
  const [savedViews, setSavedViews] = useState([]);
  const [showSaveView, setShowSaveView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [openTask, setOpenTask] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [aiForm, setAiForm] = useState({ sector: '', context: '', count: 5 });
  const [aiTasks, setAiTasks] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiWeekDates, setAiWeekDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(null);

  // Protege edições locais recém-feitas de serem sobrescritas pelo polling (modo nuvem/Vercel).
  // Map<taskId, expiraEm(ms)>: enquanto não expirar, o poll mantém a versão local da tarefa.
  const pendingEditsRef = useRef(new Map());
  // Map<taskId, expiraEm(ms)>: tarefas removidas localmente que o poll NÃO deve trazer de volta.
  const pendingDeletesRef = useRef(new Map());
  const PENDING_TTL = 8000; // janela p/ cobrir latência de leitura do servidor (Turso)

  const markPending = (taskId) => {
    pendingEditsRef.current.set(taskId, Date.now() + PENDING_TTL);
  };
  const clearPending = (taskId) => {
    // pequena folga após a confirmação do servidor p/ cobrir read-after-write
    pendingEditsRef.current.set(taskId, Date.now() + 1500);
  };
  const markPendingDelete = (taskId) => {
    pendingEditsRef.current.delete(taskId);
    pendingDeletesRef.current.set(taskId, Date.now() + PENDING_TTL);
  };

  const canManage = ['owner', 'manager'].includes(user?.role);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get('/api/boards'),
      api.get(`/api/tasks?board_id=${id}`),
      api.get('/api/users'),
    ]).then(([boards, t, u]) => {
      setBoard(boards.find(b => b.id === parseInt(id)));
      setTasks(t);
      setUsers(u);
    });
    // Load saved views for this board
    try {
      const stored = JSON.parse(localStorage.getItem(`board:${id}:views`) || '[]');
      setSavedViews(stored);
    } catch { setSavedViews([]); }
  }, [id]);

  // Persist saved views
  const persistViews = (views) => {
    setSavedViews(views);
    localStorage.setItem(`board:${id}:views`, JSON.stringify(views));
  };

  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) return;
    const view = {
      id: Date.now(),
      name,
      filters: { search, filterAssignee, filterPriority, filterStatus, quickFilter },
      sortBy,
    };
    persistViews([...savedViews, view]);
    setNewViewName('');
    setShowSaveView(false);
  };

  const applyView = (v) => {
    setSearch(v.filters.search || '');
    setFilterAssignee(v.filters.filterAssignee || '');
    setFilterPriority(v.filters.filterPriority || '');
    setFilterStatus(v.filters.filterStatus || '');
    setQuickFilter(v.filters.quickFilter || '');
    setSortBy(v.sortBy || { field: '', dir: 'asc' });
  };

  const removeView = (viewId) => {
    persistViews(savedViews.filter(v => v.id !== viewId));
  };

  useEffect(() => {
    const offs = [
      on('task:created', t => { if (t.board_id === parseInt(id)) setTasks(p => [t, ...p]); }),
      on('task:updated', t => {
        setTasks(p => p.map(x => x.id === t.id ? t : x));
        setOpenTask(prev => prev?.id === t.id ? t : prev);
      }),
      on('task:deleted', ({ id: tid }) => {
        setTasks(p => p.filter(x => x.id !== tid));
        setOpenTask(prev => prev?.id === tid ? null : prev);
      }),
    ];
    return () => offs.forEach(f => f?.());
  }, [on, id]);

  // Polling das tarefas quando não há WebSocket (modo serverless/nuvem, ex: Vercel).
  // Sem isso, criar/editar/mover/excluir não reflete na tela porque os eventos de socket não chegam.
  useEffect(() => {
    if (connected || !id) return; // com WebSocket, o socket cuida do tempo real
    const interval = setInterval(() => {
      api.get(`/api/tasks?board_id=${id}`).then(serverTasks => {
        setTasks(prev => {
          const pending = pendingEditsRef.current;
          const deletes = pendingDeletesRef.current;
          // remove marcações expiradas
          const now = Date.now();
          for (const [tid, exp] of pending) if (exp <= now) pending.delete(tid);
          for (const [tid, exp] of deletes) if (exp <= now) deletes.delete(tid);
          if (pending.size === 0 && deletes.size === 0) return serverTasks;
          const prevById = new Map(prev.map(t => [t.id, t]));
          const serverIds = new Set(serverTasks.map(t => t.id));
          const merged = serverTasks
            // tarefas removidas localmente: não deixa o servidor trazer de volta
            .filter(st => !deletes.has(st.id))
            // tarefas com edição pendente: mantém a versão local (não deixa "voltar")
            .map(st => pending.has(st.id) && prevById.has(st.id) ? prevById.get(st.id) : st);
          // tarefas recém-criadas que o servidor ainda não devolveu: preserva no topo
          for (const [tid] of pending) {
            if (!serverIds.has(tid) && prevById.has(tid)) merged.unshift(prevById.get(tid));
          }
          return merged;
        });
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [connected, id]);

  // Abre o painel da tarefa ao chegar por link (/boards/:id?task=<id>), ex: marcação no chat
  useEffect(() => {
    const taskId = parseInt(searchParams.get('task'));
    if (!taskId || !tasks.length) return;
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    setOpenTask(t);
    searchParams.delete('task'); // evita reabrir o painel depois de fechado
    setSearchParams(searchParams, { replace: true });
  }, [tasks, searchParams]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const filteredTasks = tasks.filter(t => {
    // Hide subtasks from kanban/calendar — they appear only inside their parent in list view
    if (t.parent_id && view !== 'list') return false;
    // Auto-hide concluded past tasks (unless fixed or user toggled to show them).
    // Fixed tasks always show. Done tasks with deadline in the past disappear from the board
    // but remain in the DB for reports/history.
    if (!showCompleted && !t.fixed && t.status === 'done' && t.deadline && t.deadline < todayStr) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterAssignee && String(t.assignee_id) !== filterAssignee) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (quickFilter === 'today') {
      const today = format(new Date(), 'yyyy-MM-dd');
      if (!(t.deadline === today || t.start_date === today ||
        (t.start_date && t.deadline && today >= t.start_date && today <= t.deadline))) return false;
    }
    if (quickFilter === 'week') {
      const weekStart = format(startOfISOWeek(new Date()), 'yyyy-MM-dd');
      const weekEnd = format(endOfISOWeek(new Date()), 'yyyy-MM-dd');
      const taskEnd = t.deadline || t.start_date;
      const taskStart = t.start_date || t.deadline;
      if (!taskEnd) return false;
      if (!(taskEnd >= weekStart && taskStart <= weekEnd)) return false;
    }
    if (quickFilter === 'month') {
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      const taskEnd = t.deadline || t.start_date;
      const taskStart = t.start_date || t.deadline;
      if (!taskEnd) return false;
      if (!(taskEnd >= monthStart && taskStart <= monthEnd)) return false;
    }
    return true;
  });

  // Apply sort to filteredTasks
  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER = { stuck: 0, in_progress: 1, todo: 2, review: 3, done: 4 };
  const TURNO_ORDER = { manha: 0, tarde: 1, noite: 2 };
  if (sortBy.field) {
    const dir = sortBy.dir === 'desc' ? -1 : 1;
    filteredTasks.sort((a, b) => {
      const va = a[sortBy.field], vb = b[sortBy.field];
      let cmp = 0;
      if (sortBy.field === 'priority') cmp = (PRIORITY_ORDER[va] ?? 99) - (PRIORITY_ORDER[vb] ?? 99);
      else if (sortBy.field === 'status') cmp = (STATUS_ORDER[va] ?? 99) - (STATUS_ORDER[vb] ?? 99);
      else if (sortBy.field === 'turno') cmp = (TURNO_ORDER[va] ?? 99) - (TURNO_ORDER[vb] ?? 99);
      else if (sortBy.field === 'deadline' || sortBy.field === 'updated_at' || sortBy.field === 'created_at') {
        cmp = (va || 'ZZZZ').localeCompare(vb || 'ZZZZ');
      } else if (sortBy.field === 'assignee') {
        cmp = (a.assignee_name || 'ZZZZ').localeCompare(b.assignee_name || 'ZZZZ');
      } else if (sortBy.field === 'title') {
        cmp = (va || '').localeCompare(vb || '');
      }
      return cmp * dir;
    });
  }

  const hasFilters = search || filterAssignee || filterPriority || filterStatus || quickFilter || sortBy.field;

  const saveTask = async (taskId, payload) => {
    // Update otimista: reflete na hora e protege do polling até o servidor confirmar.
    const prevSnapshot = tasks.find(t => t.id === taskId);
    markPending(taskId);
    setTasks(p => p.map(x => x.id === taskId ? { ...x, ...payload } : x));
    setOpenTask(prev => prev?.id === taskId ? { ...prev, ...payload } : prev);
    try {
      const updated = await api.put(`/api/tasks/${taskId}`, payload);
      if (updated?.id) {
        setTasks(p => p.map(x => x.id === taskId ? updated : x));
        setOpenTask(prev => prev?.id === taskId ? updated : prev);
      }
      clearPending(taskId);
    } catch (err) {
      // Falhou: reverte para o estado anterior (verdade do servidor)
      pendingEditsRef.current.delete(taskId);
      if (prevSnapshot) {
        setTasks(p => p.map(x => x.id === taskId ? prevSnapshot : x));
        setOpenTask(prev => prev?.id === taskId ? prevSnapshot : prev);
      }
      alert(err.message || 'Erro ao salvar a alteração');
    }
  };

  const saveNewTask = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const created = await api.post('/api/tasks', { ...form, assignee_id: form.assignee_id || null, board_id: parseInt(id) });
      // Sem WebSocket (serverless), adiciona localmente na hora e protege do polling
      // até o servidor devolver a tarefa (cobre latência de leitura do Turso).
      if (!connected && created?.id) {
        markPending(created.id);
        setTasks(p => p.some(x => x.id === created.id) ? p : [created, ...p]);
      }
      setShowAdd(false);
      setForm(emptyForm);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Remover esta tarefa?')) return;
    const prevSnapshot = tasks.find(t => t.id === taskId);
    // Otimista: some da tela na hora e impede o polling de trazer de volta.
    markPendingDelete(taskId);
    setTasks(p => p.filter(x => x.id !== taskId));
    setOpenTask(prev => prev?.id === taskId ? null : prev);
    try {
      await api.del(`/api/tasks/${taskId}`);
      // mantém o escudo até o servidor parar de devolver a tarefa (já expira pelo TTL)
    } catch (err) {
      pendingDeletesRef.current.delete(taskId);
      if (prevSnapshot) setTasks(p => p.some(x => x.id === taskId) ? p : [prevSnapshot, ...p]);
      alert(err.message || 'Erro ao remover a tarefa');
    }
  };

  const changeStatus = async (taskId, status) => {
    const prevSnapshot = tasks.find(t => t.id === taskId);
    markPending(taskId);
    setTasks(p => p.map(x => x.id === taskId ? { ...x, status } : x));
    setOpenTask(prev => prev?.id === taskId ? { ...prev, status } : prev);
    try {
      const updated = await api.patch(`/api/tasks/${taskId}/status`, { status });
      if (updated?.id) {
        setTasks(p => p.map(x => x.id === taskId ? updated : x));
        setOpenTask(prev => prev?.id === taskId ? updated : prev);
      }
      clearPending(taskId);
    } catch (err) {
      pendingEditsRef.current.delete(taskId);
      if (prevSnapshot) {
        setTasks(p => p.map(x => x.id === taskId ? prevSnapshot : x));
        setOpenTask(prev => prev?.id === taskId ? prevSnapshot : prev);
      }
      alert(err.message || 'Erro ao mudar o status');
    }
  };

  const generateAI = async () => {
    if (!aiForm.sector) return alert('Informe o setor');
    setAiLoading(true);
    try {
      const data = await api.post('/api/ai/generate-tasks', aiForm);
      setAiTasks(data.tasks.map(t => ({ ...t, assignee_id: '' })));
      if (data.weekDates) setAiWeekDates(data.weekDates);
    } catch (err) {
      alert(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const updateAiTask = (index, field, value) => {
    setAiTasks(p => p.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const addAiTask = async (aiTask, index) => {
    await api.post('/api/tasks', {
      title: aiTask.title,
      description: aiTask.description,
      priority: aiTask.priority,
      deadline: aiTask.deadline || null,
      estimated_hours: aiTask.estimated_hours || null,
      board_id: parseInt(id),
      status: 'todo',
      assignee_id: aiTask.assignee_id ? parseInt(aiTask.assignee_id) : null,
    });
    setAiTasks(p => p.filter((_, i) => i !== index));
  };

  const addAllAiTasks = async () => {
    for (const t of aiTasks) {
      await api.post('/api/tasks', {
        title: t.title,
        description: t.description,
        priority: t.priority,
        deadline: t.deadline || null,
        estimated_hours: t.estimated_hours || null,
        board_id: parseInt(id),
        status: 'todo',
        assignee_id: t.assignee_id ? parseInt(t.assignee_id) : null,
      });
    }
    setAiTasks([]);
    setShowAI(false);
  };

  const onDrop = (status) => { if (dragging) changeStatus(dragging, status); setDragging(null); };

  const tasksByStatus = (status) => filteredTasks.filter(t => t.status === status);

  if (!board) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (board.locked) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-black text-white mb-2">Sem acesso</h1>
          <p className="text-sm text-gray-400 mb-1">Você não é membro do board <strong className="text-gray-200">{board.name}</strong>.</p>
          <p className="text-xs text-gray-500 mb-6">Peça ao dono para te adicionar como membro.</p>
          <Link to="/boards" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm text-black" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>
            <ArrowLeftIcon className="w-4 h-4" /> Voltar para boards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <Link to="/boards" className="text-gray-400 hover:text-gray-200 transition">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: board.color }} />
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-100 truncate">{board.name}</h1>
          {(() => {
            const topLevel = tasks.filter(t => !t.parent_id);
            const done = topLevel.filter(t => t.status === 'done').length;
            const total = topLevel.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div className="flex items-center gap-2 mt-0.5">
                {board.description && <p className="text-xs text-gray-500 truncate max-w-xs">{board.description}</p>}
                {total > 0 && (
                  <>
                    <div className="flex-1 max-w-[160px] h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400">{done}/{total} · {pct}%</span>
                  </>
                )}
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button onClick={() => setShowAI(true)} className="flex items-center gap-1.5 btn-ghost border border-gray-700 text-sm px-3 py-2">
              <SparklesIcon className="w-4 h-4 text-purple-400" />
              IA
            </button>
          )}
          <button onClick={() => { setForm(emptyForm); setShowAdd(true); }} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2">
            <PlusIcon className="w-4 h-4" /> Nova Tarefa
          </button>
        </div>
      </div>

      {/* Monday-style tab bar */}
      <div className="flex items-center gap-0 px-4 sm:px-6 border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: '#1f2937' }}>
        {[
          { id: 'kanban', label: 'Quadro principal' },
          { id: 'list',   label: 'Tabela' },
          { id: 'calendar', label: 'Calendário' },
          { id: 'dashboard', label: 'Desempenho' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative flex-shrink-0 ${view === tab.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            style={view === tab.id ? { borderBottom: '2px solid #D4AF37', marginBottom: '-1px' } : { borderBottom: '2px solid transparent', marginBottom: '-1px' }}
          >
            {tab.label}
          </button>
        ))}
        <button className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1 flex-shrink-0">
          <PlusIcon className="w-3.5 h-3.5" />
          Nova visualização
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 border-b flex-shrink-0 overflow-x-auto" style={{ backgroundColor: '#0d0d0d', borderColor: '#1a1a1a' }}>
        {/* Search */}
        <div className="relative flex-shrink-0">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-primary w-44"
            placeholder="Buscar tarefas…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Assignee filter */}
        <select
          className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 text-gray-300 focus:outline-none focus:border-primary flex-shrink-0"
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
        >
          <option value="">Todos responsáveis</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        {/* Priority filter */}
        <select
          className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 text-gray-300 focus:outline-none focus:border-primary flex-shrink-0"
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
        >
          <option value="">Todas prioridades</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {/* Status filter — shown for all views */}
        <select
          className="px-2 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 text-gray-300 focus:outline-none focus:border-primary flex-shrink-0"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Todos status</option>
          <option value="todo">A Fazer</option>
          <option value="in_progress">Em Andamento</option>
          <option value="stuck">Parado</option>
          <option value="review">Em Revisão</option>
          <option value="done">Feito</option>
        </select>

        {/* Quick filter buttons */}
        <div className="flex items-center gap-1.5 ml-1 flex-shrink-0">
          {[
            { key: 'today', label: 'Hoje' },
            { key: 'week',  label: 'Esta Semana' },
            { key: 'month', label: 'Este Mês' },
          ].map(qf => (
            <button
              key={qf.key}
              onClick={() => setQuickFilter(q => q === qf.key ? '' : qf.key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${quickFilter === qf.key ? 'text-black border-transparent' : 'bg-gray-800/50 text-gray-500 hover:text-gray-300 border-gray-700'}`}
              style={quickFilter === qf.key ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)', borderColor: 'transparent' } : {}}
            >
              {qf.label}
            </button>
          ))}
        </div>

        {/* Show completed toggle */}
        <button
          onClick={() => setShowCompleted(s => !s)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ml-1 flex-shrink-0 ${showCompleted ? 'text-black border-transparent' : 'bg-gray-800/50 text-gray-400 hover:text-gray-200 border-gray-700'}`}
          style={showCompleted ? { background: 'linear-gradient(135deg, #00c875, #34d399)', borderColor: 'transparent' } : {}}
          title={showCompleted ? 'Esconder concluídas antigas' : 'Mostrar concluídas antigas'}
        >
          <CheckIcon className="w-3.5 h-3.5" />
          {showCompleted ? 'Ocultar concluídas' : 'Mostrar concluídas'}
        </button>

        {/* Sort button */}
        <div className="relative ml-1 flex-shrink-0">
          <button
            onClick={() => setShowSortMenu(s => !s)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${sortBy.field ? 'text-black border-transparent' : 'bg-gray-800/50 text-gray-400 hover:text-gray-200 border-gray-700'}`}
            style={sortBy.field ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)', borderColor: 'transparent' } : {}}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Ordenar
            {sortBy.field && <span className="text-[10px] opacity-80">/{sortBy.field === 'deadline' ? 'Prazo' : sortBy.field === 'priority' ? 'Prio' : sortBy.field === 'status' ? 'Status' : sortBy.field === 'turno' ? 'Turno' : sortBy.field === 'title' ? 'Nome' : sortBy.field === 'assignee' ? 'Resp' : sortBy.field === 'updated_at' ? 'Atual' : sortBy.field}</span>}
          </button>
          {showSortMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-2xl border overflow-hidden min-w-[200px]" style={{ backgroundColor: '#1f1f1f', borderColor: '#3a3a3a' }} onMouseLeave={() => setShowSortMenu(false)}>
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b" style={{ borderColor: '#2d2d2d' }}>Ordenar por</div>
              {[
                { f: '',          label: 'Sem ordenação' },
                { f: 'priority',  label: 'Prioridade' },
                { f: 'status',    label: 'Status' },
                { f: 'deadline',  label: 'Cronograma' },
                { f: 'turno',     label: 'Turno' },
                { f: 'title',     label: 'Nome (A→Z)' },
                { f: 'assignee',  label: 'Responsável' },
                { f: 'updated_at', label: 'Última atualização' },
              ].map(opt => (
                <button
                  key={opt.f}
                  onClick={() => { setSortBy(s => ({ ...s, field: opt.f })); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-white/5 transition ${sortBy.field === opt.f ? 'text-yellow-400' : 'text-gray-300'}`}
                >
                  {opt.label}
                  {sortBy.field === opt.f && <CheckIcon className="w-3 h-3" />}
                </button>
              ))}
              {sortBy.field && (
                <>
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 border-t border-b" style={{ borderColor: '#2d2d2d' }}>Direção</div>
                  {[
                    { d: 'asc',  label: 'Crescente (A→Z, 1→9, mais antigo)' },
                    { d: 'desc', label: 'Decrescente (Z→A, 9→1, mais recente)' },
                  ].map(opt => (
                    <button
                      key={opt.d}
                      onClick={() => { setSortBy(s => ({ ...s, dir: opt.d })); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-white/5 transition ${sortBy.dir === opt.d ? 'text-yellow-400' : 'text-gray-300'}`}
                    >
                      {opt.label}
                      {sortBy.dir === opt.d && <CheckIcon className="w-3 h-3" />}
                    </button>
                  ))}
                </>
              )}
              <div className="border-t" style={{ borderColor: '#2d2d2d' }}>
                <button
                  onClick={() => { setShowSaveView(true); setShowSortMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-yellow-400 hover:bg-yellow-500/10 transition"
                >
                  💾 Salvar esta visualização…
                </button>
              </div>
            </div>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterAssignee(''); setFilterPriority(''); setFilterStatus(''); setQuickFilter(''); setSortBy({ field: '', dir: 'asc' }); setShowCompleted(false); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition px-2 py-1.5 rounded-lg hover:bg-gray-800 flex-shrink-0"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
            Limpar
          </button>
        )}

        <div className="flex-1 min-w-[8px]" />
        <span className="text-xs text-gray-600 flex-shrink-0">{filteredTasks.length} tarefa{filteredTasks.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Saved views chips bar */}
      {savedViews.length > 0 && (
        <div className="flex items-center gap-1.5 px-6 py-2 border-b flex-shrink-0 overflow-x-auto" style={{ backgroundColor: '#101010', borderColor: '#1a1a1a' }}>
          <span className="text-[10px] uppercase font-bold text-gray-600 tracking-wider mr-2 flex-shrink-0">Visualizações:</span>
          {savedViews.map(v => (
            <div key={v.id} className="flex items-center gap-0.5 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: '#2a2a2a' }}>
              <button
                onClick={() => applyView(v)}
                className="px-2.5 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-800 transition"
              >
                {v.name}
              </button>
              <button
                onClick={() => removeView(v.id)}
                className="px-1.5 py-1 text-gray-600 hover:text-danger hover:bg-gray-800 transition"
                title="Remover visualização"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save view modal */}
      {showSaveView && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setShowSaveView(false)}>
          <div className="rounded-xl border p-5 shadow-2xl w-full max-w-sm" style={{ backgroundColor: '#1f1f1f', borderColor: '#3a3a3a' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black text-white mb-3">💾 Salvar visualização</h3>
            <p className="text-xs text-gray-500 mb-3">Os filtros e a ordenação atuais serão salvos. Você pode aplicar essa visualização depois com um clique.</p>
            <input
              autoFocus
              type="text"
              value={newViewName}
              onChange={e => setNewViewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCurrentView(); }}
              placeholder="Ex: Críticas de hoje · Atrasadas · Sprint 3"
              className="w-full px-3 py-2 rounded-lg text-sm bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:border-yellow-500 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveView(false)} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition">Cancelar</button>
              <button onClick={saveCurrentView} disabled={!newViewName.trim()} className="flex-1 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-50 transition" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === 'dashboard' ? (
          <BoardDashboard
            tasks={tasks}
            users={users}
            currentUser={user}
            canManage={canManage}
            onOpenTask={setOpenTask}
          />
        ) : view === 'calendar' ? (
          <BoardCalendar tasks={filteredTasks} onOpenTask={setOpenTask} />
        ) : view === 'kanban' ? (
          <div className="h-full overflow-x-auto p-4 sm:p-6">
            {/* ── GROUP BY DAY ── */}
            {(() => {
                const dateMap = {};
                filteredTasks.filter(t => !t.fixed).forEach(t => {
                  const key = t.deadline || '__nodate__';
                  if (!dateMap[key]) dateMap[key] = [];
                  dateMap[key].push(t);
                });
                const sortedKeys = Object.keys(dateMap).sort((a, b) => {
                  if (a === '__nodate__') return 1;
                  if (b === '__nodate__') return -1;
                  return new Date(a) - new Date(b);
                });
                const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                return (
                  <div className="flex gap-4 h-full min-w-max">
                    {filteredTasks.some(t => t.fixed) && (
                      <div className="flex flex-col w-72 flex-shrink-0">
                        <div className="flex items-center justify-between px-3 py-2 rounded-t-xl border bg-yellow-500/10 border-yellow-500/20 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">📌</span>
                            <span className="text-sm font-bold text-yellow-300">Fixas</span>
                            <span className="text-xs bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full">{filteredTasks.filter(t => t.fixed).length}</span>
                          </div>
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                          {filteredTasks.filter(t => t.fixed).map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              canManage={canManage}
                              userId={user.id}
                              onOpen={() => setOpenTask(task)}
                              onDelete={() => deleteTask(task.id)}
                              onDragStart={() => setDragging(task.id)}
                              onStatusChange={changeStatus}
                              allTasks={tasks}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {sortedKeys.map(dateKey => {
                      const dayTasks = dateMap[dateKey];
                      let label, sublabel, headerBg, dotColor;
                      if (dateKey === '__nodate__') {
                        label = 'Sem Data';
                        sublabel = '';
                        headerBg = 'bg-gray-700/20 border-gray-700/30';
                        dotColor = '#6b7280';
                      } else {
                        const d = new Date(dateKey + 'T12:00:00');
                        const dayName = DAY_NAMES[d.getDay()];
                        label = `${dayName}, ${format(d, 'dd/MM')}`;
                        sublabel = format(d, 'EEEE', { locale: ptBR });
                        const today = new Date(); today.setHours(0,0,0,0);
                        const tgt = new Date(d); tgt.setHours(0,0,0,0);
                        if (tgt < today) { headerBg = 'bg-red-900/20 border-red-900/30'; dotColor = '#e2445c'; }
                        else if (tgt.getTime() === today.getTime()) { headerBg = 'bg-yellow-500/10 border-yellow-500/20'; dotColor = '#fdab3d'; }
                        else { headerBg = 'bg-blue-500/10 border-blue-500/20'; dotColor = '#0073ea'; }
                      }
                      return (
                        <div key={dateKey} className="flex flex-col w-72 flex-shrink-0">
                          <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${headerBg} mb-2`}>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                              <div>
                                <span className="text-sm font-bold text-gray-200">{label}</span>
                                {sublabel && <span className="text-xs text-gray-500 ml-1.5 capitalize">{sublabel}</span>}
                              </div>
                              <span className="text-xs bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full">{dayTasks.length}</span>
                            </div>
                            <button onClick={() => { setForm({ ...emptyForm, deadline: dateKey !== '__nodate__' ? dateKey : '' }); setShowAdd(true); }} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200 transition">
                              <PlusIcon className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                            {dayTasks.map(task => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                canManage={canManage}
                                userId={user.id}
                                onOpen={() => setOpenTask(task)}
                                onDelete={() => deleteTask(task.id)}
                                onDragStart={() => setDragging(task.id)}
                                onStatusChange={changeStatus}
                                allTasks={tasks}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {sortedKeys.length === 0 && (
                      <div className="flex items-center justify-center text-gray-600 text-sm w-full">
                        Nenhuma tarefa encontrada.
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        ) : (
          <div className="overflow-y-auto h-full" style={{ backgroundColor: '#0d0d0d' }}>
            <ListView
              tasks={filteredTasks}
              allTasks={tasks}
              users={users}
              canManage={canManage}
              userId={user.id}
              onOpen={(task, opts) => setOpenTask({ ...task, _openTab: opts?.tab })}
              onDelete={deleteTask}
              onSaveTask={saveTask}
              onChangeStatus={changeStatus}
              boardId={id}
              onCreateTask={async (payload) => {
                const created = await api.post('/api/tasks', { ...emptyForm, ...payload, board_id: parseInt(id) });
                // Sem WebSocket (serverless), adiciona localmente na hora e protege do polling.
                if (!connected && created?.id) {
                  markPending(created.id);
                  setTasks(p => p.some(x => x.id === created.id) ? p : [created, ...p]);
                }
              }}
              api={api}
            />
          </div>
        )}
      </div>

      {/* Task Drawer */}
      {openTask && (
        <TaskDrawer
          task={openTask}
          users={users}
          canManage={canManage}
          currentUser={user}
          onClose={() => setOpenTask(null)}
          onSave={saveTask}
          onDelete={async (tid) => { await deleteTask(tid); setOpenTask(null); }}
          api={api}
          on={on}
          boardTasks={tasks}
        />
      )}

      {/* Add Task Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Nova Tarefa" size="md">
        <form onSubmit={saveNewTask} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Título *</label>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="O que precisa ser feito? (ou clique no 🎤)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              <VoiceInput size="md" onTranscript={(t) => setForm(f => ({ ...f, title: (f.title ? f.title + ' ' : '') + t }))} title="Ditar título" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Descrição</label>
            <div className="flex gap-2 items-start">
              <textarea className="input resize-none flex-1" rows={2} placeholder="Detalhes opcionais…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <VoiceInput size="md" onTranscript={(t) => setForm(f => ({ ...f, description: (f.description ? f.description + ' ' : '') + t }))} title="Ditar descrição" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Prioridade</label>
              <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Responsável</label>
            <select className="input" value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
              <option value="">Sem responsável</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Cronograma</label>
            <div className="flex items-center gap-2">
              <input className="input flex-1" type="date" placeholder="Início" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              <span className="text-gray-500 text-sm flex-shrink-0">→</span>
              <input className="input flex-1" type="date" placeholder="Fim / Prazo" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Setor</label>
            <input className="input" placeholder="Ex: Marketing, Financeiro…" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Recorrência</label>
              <select className="input" value={form.recurring || 'none'} onChange={e => setForm(f => ({ ...f, recurring: e.target.value }))}>
                <option value="none">Sem recorrência</option>
                <option value="daily">Diária (seg-sex)</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Prazo Automático</label>
              <select
                className="input"
                value={form.recurrence || 'none'}
                onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
                style={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
              >
                <option value="none">Não se repete</option>
                <option value="daily">Diário</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center justify-between py-2 px-3 bg-gray-900 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-gray-200">📌 Tarefa Fixa</p>
                <p className="text-xs text-gray-500">Aparece fixada todos os dias</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, fixed: !f.fixed }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.fixed ? 'bg-yellow-500' : 'bg-gray-700'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.fixed ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-1.5">
              <PaperClipIcon className="w-3.5 h-3.5" /> Anexos (links e imagens)
            </label>
            <Attachments
              value={form.attachments || []}
              onChange={(next) => setForm(f => ({ ...f, attachments: next }))}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Criando…' : 'Criar Tarefa'}</button>
          </div>
        </form>
      </Modal>

      {/* AI Modal */}
      <Modal open={showAI} onClose={() => { setShowAI(false); setAiTasks([]); }} title="✨ Gerar Demandas da Semana com IA" size="lg">
        <div className="space-y-4">
          {/* Sector quick-select chips */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Setor *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {['Marketing', 'Atendimento', 'Operacional', 'Financeiro', 'Vendas', 'RH'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAiForm(f => ({ ...f, sector: s }))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${aiForm.sector === s ? 'text-black border-transparent' : 'text-gray-400 border-gray-700 hover:border-gray-500'}`}
                  style={aiForm.sector === s ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)', borderColor: 'transparent' } : {}}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              className="input text-sm"
              placeholder="Ou digite outro setor…"
              value={aiForm.sector}
              onChange={e => setAiForm(f => ({ ...f, sector: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Quantidade</label>
              <select className="input" value={aiForm.count} onChange={e => setAiForm(f => ({ ...f, count: parseInt(e.target.value) }))}>
                {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} tarefas</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Contexto da semana</label>
              <input className="input text-sm" placeholder="Ex: lançamento, fechamento…" value={aiForm.context} onChange={e => setAiForm(f => ({ ...f, context: e.target.value }))} />
            </div>
          </div>

          {aiWeekDates.length > 0 && aiTasks.length === 0 && (
            <p className="text-xs text-gray-500 text-center">Semana: {aiWeekDates[0]} → {aiWeekDates[4]}</p>
          )}

          <button onClick={generateAI} disabled={aiLoading} className="btn-primary w-full flex items-center justify-center gap-2">
            <SparklesIcon className="w-4 h-4" />
            {aiLoading ? 'Analisando equipe e gerando…' : 'Gerar Demandas da Semana'}
          </button>

          {aiTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium">{aiTasks.length} tarefa{aiTasks.length !== 1 ? 's' : ''} gerada{aiTasks.length !== 1 ? 's' : ''} • Ajuste responsável e prazo:</p>
                <button onClick={addAllAiTasks} className="text-xs font-bold px-3 py-1 rounded-lg text-black" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>Adicionar todas</button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {aiTasks.map((t, i) => {
                  const priorityInfo = PRIORITIES.find(p => p.value === t.priority);
                  return (
                    <div key={i} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-100 leading-snug">{t.title}</p>
                          {t.description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{t.description}</p>}
                        </div>
                        <button onClick={() => setAiTasks(p => p.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-gray-400 flex-shrink-0 transition">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Priority badge */}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: priorityInfo?.color, backgroundColor: (priorityInfo?.color || '#888') + '20' }}>
                          {priorityInfo?.label}
                        </span>
                        {/* Estimated hours */}
                        {t.estimated_hours && (
                          <span className="text-[10px] text-gray-500">⏱ {t.estimated_hours}h</span>
                        )}
                        {/* Deadline picker */}
                        <input
                          type="date"
                          value={t.deadline || ''}
                          onChange={e => updateAiTask(i, 'deadline', e.target.value)}
                          className="text-[10px] bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 focus:outline-none focus:border-yellow-500"
                        />
                        {/* Assignee */}
                        <select
                          value={t.assignee_id || ''}
                          onChange={e => updateAiTask(i, 'assignee_id', e.target.value)}
                          className="text-[10px] bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 focus:outline-none focus:border-yellow-500 flex-1 min-w-0"
                        >
                          <option value="">Sem responsável</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                        {/* Add button */}
                        <button onClick={() => addAiTask(t, i)} className="ml-auto p-1.5 rounded-lg text-black flex-shrink-0" style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }} title="Adicionar esta tarefa">
                          <PlusIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
