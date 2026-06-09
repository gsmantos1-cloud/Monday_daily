/**
 * db-turso.js — Camada de banco de dados via Turso (libSQL/SQLite na nuvem).
 * Mesma API do db.js original, mas persiste no Turso em vez de arquivo JSON local.
 * Usa cache em memória para performance, sincroniza com o Turso a cada write.
 */

const { createClient } = require('@libsql/client/web');

let client;
function getClient() {
  if (!client) {
    if (!process.env.TURSO_URL || !process.env.TURSO_AUTH_TOKEN) {
      throw new Error('TURSO_URL e TURSO_AUTH_TOKEN são obrigatórios no .env');
    }
    client = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

// Cache em memória (carregado do Turso na inicialização)
let data = {
  users: [], boards: [], tasks: [], comments: [], sessions: [],
  goals: [], ideas: [], task_history: [], notifications: [],
  channels: [], messages: [],
  _seq: { users: 0, boards: 0, tasks: 0, comments: 0, channels: 2, messages: 0, sessions: 0, goals: 0, ideas: 0, task_history: 0, notifications: 0 }
};

let initialized = false;

// Recarrega TODO o estado do Turso para o cache em memória.
// Essencial em serverless (Vercel): cada instância tem seu próprio cache; sem
// recarregar a cada request, instâncias diferentes devolvem dados divergentes
// (tarefas "aparecem e somem" conforme o poll cai numa instância ou noutra).
async function loadFromDb() {
  const db = getClient();
  const rows = await db.execute(`SELECT key, value FROM kv`);
  for (const row of rows.rows) {
    try {
      data[row.key] = JSON.parse(row.value);
    } catch {}
  }
  ensureDefaults();
}

function ensureDefaults() {
  if (!data._seq) data._seq = {};
  const seqDefaults = { users: 0, boards: 0, tasks: 0, comments: 0, channels: 2, messages: 0, sessions: 0, goals: 0, ideas: 0, task_history: 0, notifications: 0 };
  for (const [k, v] of Object.entries(seqDefaults)) {
    if (!data._seq[k]) data._seq[k] = v;
  }
  if (!data.channels?.length) {
    data.channels = [
      { id: 1, name: 'geral', description: 'Canal geral da equipe', type: 'public', created_by: null, created_at: new Date().toISOString() },
      { id: 2, name: 'avisos', description: 'Avisos e comunicados importantes', type: 'public', created_by: null, created_at: new Date().toISOString() }
    ];
  }
}

async function init() {
  if (initialized) return;
  const db = getClient();

  // Criar tabela KV
  await db.execute(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await loadFromDb();

  initialized = true;
  console.log('[DB-Turso] Conectado. users:', data.users.length, 'boards:', data.boards.length, 'tasks:', data.tasks.length);
}

// Garante que escritas pendentes foram persistidas no Turso.
// Em serverless, deve ser aguardado ANTES de responder — senão o Vercel pode
// congelar a instância antes do write terminar, perdendo a alteração.
async function flush() {
  try { await saveQueue; } catch {}
}

// Recarrega o estado mais recente do Turso. Aguarda writes pendentes primeiro
// para nunca descartar uma alteração local ainda não persistida.
async function refresh() {
  if (!initialized) return init();
  try {
    await saveQueue;
    await loadFromDb();
  } catch (err) {
    console.error('[DB-Turso] Refresh error:', err.message);
  }
}

// Fila de writes para evitar race conditions
let saveQueue = Promise.resolve();

async function saveKey(key) {
  const db = getClient();
  const value = JSON.stringify(data[key]);
  await db.execute({
    sql: `INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`,
    args: [key, value]
  });
}

function save(keys) {
  const toSave = keys || ['users', 'boards', 'tasks', 'comments', 'channels', 'messages', 'sessions', 'goals', 'ideas', 'task_history', 'notifications', '_seq'];
  saveQueue = saveQueue.then(async () => {
    try {
      await Promise.all(toSave.map(k => saveKey(k)));
    } catch (err) {
      console.error('[DB-Turso] Save error:', err.message);
    }
  });
}

function nextId(table) {
  data._seq[table] = (data._seq[table] || 0) + 1;
  save(['_seq']);
  return data._seq[table];
}

const now = () => new Date().toISOString();

// ── Users ──────────────────────────────────────
const users = {
  all: () => data.users,
  find: (id) => data.users.find(u => u.id === id),
  findByEmail: (email) => data.users.find(u => u.email === email),
  count: () => data.users.length,
  create: (fields) => {
    const user = { id: nextId('users'), created_at: now(), ...fields };
    data.users.push(user);
    save(['users']);
    return user;
  },
  update: (id, fields) => {
    const i = data.users.findIndex(u => u.id === id);
    if (i === -1) return null;
    data.users[i] = { ...data.users[i], ...fields };
    save(['users']);
    return data.users[i];
  },
  remove: (id) => {
    data.users = data.users.filter(u => u.id !== id);
    save(['users']);
  }
};

// ── Boards ─────────────────────────────────────
const boards = {
  all: () => data.boards.map(b => ({
    ...b,
    creator_name: data.users.find(u => u.id === b.created_by)?.name || null,
    task_count: data.tasks.filter(t => t.board_id === b.id).length,
    done_count: data.tasks.filter(t => t.board_id === b.id && t.status === 'done').length
  })),
  find: (id) => data.boards.find(b => b.id === id),
  create: (fields) => {
    const board = { id: nextId('boards'), created_at: now(), ...fields };
    data.boards.push(board);
    save(['boards']);
    return board;
  },
  update: (id, fields) => {
    const i = data.boards.findIndex(b => b.id === id);
    if (i === -1) return null;
    data.boards[i] = { ...data.boards[i], ...fields };
    save(['boards']);
    return data.boards[i];
  },
  remove: (id) => {
    data.boards = data.boards.filter(b => b.id !== id);
    save(['boards']);
  }
};

// ── Tasks ──────────────────────────────────────
function enrichTask(t) {
  const assignee = data.users.find(u => u.id === t.assignee_id);
  const creator = data.users.find(u => u.id === t.creator_id);
  const board = data.boards.find(b => b.id === t.board_id);
  const subtask_count = data.tasks.filter(x => x.parent_id === t.id).length;
  const comment_count = (data.comments || []).filter(c => c.task_id === t.id).length;
  return {
    ...t,
    priority: t.priority || 'medium',
    status: t.status || 'todo',
    assignee_name: assignee?.name || null,
    assignee_color: assignee?.avatar_color || null,
    creator_name: creator?.name || null,
    board_name: board?.name || null,
    board_color: board?.color || null,
    subtask_count,
    comment_count,
  };
}

const tasks = {
  all: (filter = {}) => {
    let list = data.tasks;
    if (filter.board_id) list = list.filter(t => t.board_id === filter.board_id);
    if (filter.assignee_id) list = list.filter(t => t.assignee_id === filter.assignee_id);
    if (filter.status) list = list.filter(t => t.status === filter.status);
    if (filter.parent_id !== undefined) list = list.filter(t => t.parent_id === filter.parent_id);
    if (filter.top_level) list = list.filter(t => !t.parent_id);
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(enrichTask);
  },
  find: (id) => {
    const t = data.tasks.find(t => t.id === id);
    return t ? enrichTask(t) : null;
  },
  findRaw: (id) => data.tasks.find(t => t.id === id),
  create: (fields) => {
    const task = { id: nextId('tasks'), created_at: now(), updated_at: now(), ...fields };
    data.tasks.push(task);
    save(['tasks']);
    return enrichTask(task);
  },
  update: (id, fields) => {
    const i = data.tasks.findIndex(t => t.id === id);
    if (i === -1) return null;
    const prev = data.tasks[i];
    const extra = {};
    if (fields.status === 'done' && prev.status !== 'done') extra.completed_at = now();
    if (fields.status && fields.status !== 'done' && prev.status === 'done') extra.completed_at = null;
    data.tasks[i] = { ...prev, ...fields, ...extra, updated_at: now() };
    save(['tasks']);
    return enrichTask(data.tasks[i]);
  },
  remove: (id) => {
    data.tasks = data.tasks.filter(t => t.id !== id);
    save(['tasks']);
  },
  removeByBoard: (boardId) => {
    data.tasks = data.tasks.filter(t => t.board_id !== boardId);
    save(['tasks']);
  },
  clearAssignee: (userId) => {
    data.tasks = data.tasks.map(t => t.assignee_id === userId ? { ...t, assignee_id: null } : t);
    save(['tasks']);
  }
};

// ── Comments ───────────────────────────────────
const comments = {
  byTask: (taskId) => {
    if (!data.comments) data.comments = [];
    return data.comments.filter(c => c.task_id === taskId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(c => {
        const u = data.users.find(u => u.id === c.user_id);
        return { ...c, user_name: u?.name || 'Desconhecido', avatar_color: u?.avatar_color || '#666' };
      });
  },
  create: (fields) => {
    if (!data.comments) data.comments = [];
    const comment = { id: nextId('comments'), created_at: now(), ...fields };
    data.comments.push(comment);
    save(['comments']);
    return comment;
  },
  remove: (id) => {
    data.comments = (data.comments || []).filter(c => c.id !== id);
    save(['comments']);
  },
  removeByTask: (taskId) => {
    data.comments = (data.comments || []).filter(c => c.task_id !== taskId);
    save(['comments']);
  },
  addReaction: (commentId, userId, emoji) => {
    if (!data.comments) return null;
    const i = data.comments.findIndex(c => c.id === commentId);
    if (i === -1) return null;
    if (!data.comments[i].reactions) data.comments[i].reactions = [];
    const existing = data.comments[i].reactions.findIndex(r => r.user_id === userId && r.emoji === emoji);
    if (existing !== -1) data.comments[i].reactions.splice(existing, 1);
    else data.comments[i].reactions.push({ user_id: userId, emoji });
    save(['comments']);
    return data.comments[i];
  },
  find: (id) => data.comments?.find(c => c.id === id) || null,
};

// ── Channels ───────────────────────────────────
const channels = {
  all: () => data.channels,
  find: (id) => data.channels.find(c => c.id === id),
  findByName: (name) => data.channels.find(c => c.name === name),
  create: (fields) => {
    const ch = { id: nextId('channels'), created_at: now(), ...fields };
    data.channels.push(ch);
    save(['channels']);
    return ch;
  },
  remove: (id) => {
    data.channels = data.channels.filter(c => c.id !== id);
    save(['channels']);
  }
};

// ── Messages ───────────────────────────────────
function enrichMsg(m) {
  const u = data.users.find(u => u.id === m.user_id);
  return { ...m, user_name: u?.name || 'Desconhecido', avatar_color: u?.avatar_color || '#666', user_role: u?.role || 'operational' };
}

const messages = {
  byChannel: (channel) => data.messages.filter(m => m.channel === channel)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-150).map(enrichMsg),
  create: (fields) => {
    const msg = { id: nextId('messages'), created_at: now(), ...fields };
    data.messages.push(msg);
    const ch = fields.channel;
    const chMsgs = data.messages.filter(m => m.channel === ch);
    if (chMsgs.length > 2000) {
      const oldest = chMsgs.slice(0, chMsgs.length - 2000).map(m => m.id);
      data.messages = data.messages.filter(m => !oldest.includes(m.id));
    }
    save(['messages']);
    return enrichMsg(msg);
  },
  removeByChannel: (channel) => {
    data.messages = data.messages.filter(m => m.channel !== channel);
    save(['messages']);
  },
  removeByUser: (userId) => {
    data.messages = data.messages.filter(m => m.user_id !== userId);
    save(['messages']);
  }
};

// ── Sessions ───────────────────────────────────
const sessions = {
  create: (fields) => {
    const session = { id: nextId('sessions'), ...fields };
    data.sessions.push(session);
    save(['sessions']);
    return session;
  },
  heartbeat: (id) => {
    const i = data.sessions.findIndex(s => s.id === id);
    if (i === -1) return null;
    const s = data.sessions[i];
    const minutes = Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000);
    data.sessions[i] = { ...s, last_seen_at: now(), duration_minutes: minutes };
    save(['sessions']);
    return data.sessions[i];
  },
  today: () => {
    const today = new Date().toISOString().slice(0, 10);
    return (data.sessions || []).filter(s => s.date === today);
  },
  byUser: (userId) => (data.sessions || []).filter(s => s.user_id === userId),
};

// ── Goals ──────────────────────────────────────
const goals = {
  all: () => data.goals || [],
  find: (userId) => (data.goals || []).find(g => g.user_id === userId),
  set: (userId, fields) => {
    if (!data.goals) data.goals = [];
    const i = data.goals.findIndex(g => g.user_id === userId);
    if (i === -1) data.goals.push({ user_id: userId, ...fields });
    else data.goals[i] = { ...data.goals[i], ...fields };
    save(['goals']);
    return (data.goals || []).find(g => g.user_id === userId);
  }
};

// ── Ideas ──────────────────────────────────────
const ideas = {
  all: () => data.ideas || [],
  find: (id) => (data.ideas || []).find(i => i.id === id),
  create: (fields) => {
    if (!data.ideas) data.ideas = [];
    const idea = { id: nextId('ideas'), created_at: now(), ...fields };
    data.ideas.push(idea);
    save(['ideas']);
    return idea;
  },
  update: (id, fields) => {
    const i = (data.ideas || []).findIndex(x => x.id === id);
    if (i === -1) return null;
    data.ideas[i] = { ...data.ideas[i], ...fields, updated_at: now() };
    save(['ideas']);
    return data.ideas[i];
  },
  remove: (id) => {
    data.ideas = (data.ideas || []).filter(i => i.id !== id);
    save(['ideas']);
  }
};

// ── Task History ───────────────────────────────
const taskHistory = {
  byTask: (taskId) => (data.task_history || []).filter(h => h.task_id === taskId)
    .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at)),
  create: (fields) => {
    if (!data.task_history) data.task_history = [];
    const entry = { id: nextId('task_history'), changed_at: now(), ...fields };
    data.task_history.push(entry);
    const taskEntries = data.task_history.filter(h => h.task_id === fields.task_id);
    if (taskEntries.length > 500) {
      const oldest = taskEntries.slice(0, taskEntries.length - 500).map(h => h.id);
      data.task_history = data.task_history.filter(h => !oldest.includes(h.id));
    }
    save(['task_history']);
    return entry;
  }
};

// ── Notifications ──────────────────────────────
const notifications = {
  forUser: (userId) => (data.notifications || []).filter(n => n.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50),
  create: (fields) => {
    if (!data.notifications) data.notifications = [];
    const n = { id: nextId('notifications'), created_at: now(), read: false, ...fields };
    data.notifications.push(n);
    if (data.notifications.length > 200) data.notifications = data.notifications.slice(-200);
    save(['notifications']);
    return n;
  },
  markRead: (id) => {
    const n = data.notifications?.find(n => n.id === id);
    if (n) { n.read = true; save(['notifications']); }
  },
  markAllRead: (userId) => {
    (data.notifications || []).filter(n => n.user_id === userId && !n.read).forEach(n => n.read = true);
    save(['notifications']);
  }
};

// Exporta init para ser chamado antes de usar o DB
module.exports = {
  init, refresh, flush,
  users, boards, tasks, comments, channels, messages,
  sessions, goals, ideas, taskHistory, notifications
};
