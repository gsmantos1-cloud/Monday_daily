const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', credentials: false }
});

app.use(cors({ origin: '*' }));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'team-hub-s3cr3t-k3y-2024';

// ── File uploads (multer) ──────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadsDir));

// ──────────────────────────────────────────────
//  MIDDLEWARE
// ──────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token obrigatório' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Always fetch fresh role from DB so role changes take effect without re-login
    const freshUser = db.users.find(payload.id);
    if (!freshUser) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = { ...payload, role: freshUser.role };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });
  next();
};

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Autenticação necessária'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Token inválido'));
  }
});

// ──────────────────────────────────────────────
//  AUTH
// ──────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
  if (db.users.findByEmail(email.toLowerCase().trim())) return res.status(400).json({ error: 'Email já cadastrado' });

  const role = db.users.count() === 0 ? 'owner' : 'operational';
  const colors = ['#0073ea', '#e2445c', '#00c875', '#fdab3d', '#784bd1', '#00cec9', '#ff7675', '#a29bfe'];
  const avatar_color = colors[Math.floor(Math.random() * colors.length)];
  const password_hash = bcrypt.hashSync(password, 10);

  const user = db.users.create({ name: name.trim(), email: email.toLowerCase().trim(), password_hash, role, avatar_color });
  const { password_hash: _, ...safe } = user;
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ user: safe, token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
  const user = db.users.findByEmail(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  }
  const { password_hash, ...safe } = user;
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ user: safe, token });
});

// Reset de senha sem email — verifica email + nome (case-insensitive) e gera senha temporária.
// Resposta retorna a senha temporária em tela (já que não há infra de email).
app.post('/api/auth/reset-password', (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Email e nome são obrigatórios' });
  const user = db.users.findByEmail(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  // Match user-supplied name against stored name (case-insensitive, trimmed)
  if (user.name.toLowerCase().trim() !== name.toLowerCase().trim()) {
    return res.status(403).json({ error: 'Nome não confere com o email informado' });
  }
  // Generate a random 8-char temporary password
  const tempPassword = Math.random().toString(36).slice(2, 10);
  db.users.update(user.id, { password_hash: bcrypt.hashSync(tempPassword, 10) });
  res.json({
    success: true,
    temp_password: tempPassword,
    message: 'Senha temporária gerada. Faça login e altere em seu perfil.'
  });
});

// Trocar senha (usuário autenticado)
app.put('/api/auth/change-password', auth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Senha atual e nova são obrigatórias' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Nova senha deve ter ao menos 6 caracteres' });
  const user = db.users.find(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }
  db.users.update(user.id, { password_hash: bcrypt.hashSync(new_password, 10) });
  res.json({ success: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.users.find(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  const { password_hash, ...safe } = user;
  res.json(safe);
});

// ──────────────────────────────────────────────
//  SESSIONS (time tracking)
// ──────────────────────────────────────────────
app.post('/api/sessions', auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const session = db.sessions.create({
    user_id: req.user.id,
    date: today,
    started_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    duration_minutes: 0,
  });
  res.json(session);
});

app.put('/api/sessions/:id/heartbeat', auth, (req, res) => {
  const session = db.sessions.heartbeat(parseInt(req.params.id));
  res.json(session || { ok: false });
});

app.get('/api/sessions/today', auth, requireRole('owner', 'manager'), (req, res) => {
  const today = db.sessions.today();
  const users = db.users.all().map(({ password_hash, ...u }) => u);
  // Aggregate duration per user for today
  const byUser = {};
  today.forEach(s => {
    if (!byUser[s.user_id]) byUser[s.user_id] = { sessions: [], total_minutes: 0 };
    byUser[s.user_id].sessions.push(s);
    byUser[s.user_id].total_minutes += (s.duration_minutes || 0);
  });
  const result = users.map(u => ({
    user: u,
    total_minutes: byUser[u.id]?.total_minutes || 0,
    sessions: byUser[u.id]?.sessions || [],
    last_seen: byUser[u.id]?.sessions?.reduce((latest, s) => !latest || s.last_seen_at > latest ? s.last_seen_at : latest, null) || null,
  }));
  res.json(result);
});

// ──────────────────────────────────────────────
//  GOALS
// ──────────────────────────────────────────────
app.get('/api/goals', auth, (req, res) => {
  res.json(db.goals.all());
});

app.put('/api/goals/:userId', auth, requireRole('owner', 'manager'), (req, res) => {
  const { weekly_tasks } = req.body;
  const goal = db.goals.set(parseInt(req.params.userId), { weekly_tasks: parseInt(weekly_tasks) || 0 });
  res.json(goal);
});

// ──────────────────────────────────────────────
//  USERS
// ──────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  res.json(db.users.all().map(({ password_hash, ...u }) => u));
});

app.put('/api/users/:id/role', auth, requireRole('owner'), (req, res) => {
  const { role } = req.body;
  if (!['owner', 'manager', 'operational'].includes(role)) return res.status(400).json({ error: 'Role inválido' });
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Não pode alterar seu próprio role' });
  const user = db.users.update(targetId, { role });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  const { password_hash, ...safe } = user;
  io.emit('user:updated', safe);
  res.json(safe);
});

app.put('/api/users/:id', auth, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.id !== targetId && req.user.role !== 'owner') return res.status(403).json({ error: 'Sem permissão' });
  const { name, avatar_color } = req.body;
  const user = db.users.update(targetId, { name, avatar_color });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  const { password_hash, ...safe } = user;
  io.emit('user:updated', safe);
  res.json(safe);
});

app.delete('/api/users/:id', auth, requireRole('owner'), (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Não pode remover a si mesmo' });
  db.messages.removeByUser(targetId);
  db.tasks.clearAssignee(targetId);
  db.users.remove(targetId);
  io.emit('user:deleted', { id: targetId });
  res.json({ success: true });
});

// ──────────────────────────────────────────────
//  BOARDS
// ──────────────────────────────────────────────
// Board access model:
// - Public board: no member_ids OR empty array → everyone can access.
// - Restricted board: member_ids has user IDs → only those members + owners can access.
// - All users CAN SEE all boards in the list (locked badge shown if no access).
// - Cross-board tasks: a user can access a single task assigned to them even on a board they don't belong to.

function boardMembers(board) {
  if (Array.isArray(board.member_ids)) return board.member_ids;
  // Backward compat with private_to
  if (board.private_to) return [board.private_to];
  return [];
}

// Privacy applies to everyone, including owners.
// A user only sees a private board if they're a member of it.
// Owners can still CREATE/EDIT boards (they have role permission), but they don't auto-see private ones.
function canAccessBoard(board, user) {
  const members = boardMembers(board);
  if (members.length === 0) return true; // public
  return members.includes(user.id);
}

function enrichBoardForUser(board, user) {
  const members = boardMembers(board);
  const isPrivate = members.length > 0;
  const isMember = !isPrivate || members.includes(user.id);
  return { ...board, member_ids: members, is_private: isPrivate, is_member: isMember, locked: !isMember };
}

app.get('/api/boards', auth, (req, res) => {
  const all = db.boards.all();
  // Return ALL boards so users can see locked ones too, marked with `locked: true`
  res.json(all.map(b => enrichBoardForUser(b, req.user)));
});

app.post('/api/boards', auth, requireRole('owner', 'manager'), (req, res) => {
  const { name, description, color, member_ids, private_to } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  // Accept either explicit member_ids array or legacy private_to (single user)
  let members = [];
  if (Array.isArray(member_ids)) members = member_ids.map(Number).filter(Boolean);
  else if (private_to) members = [parseInt(private_to)];
  const board = db.boards.create({
    name: name.trim(),
    description: description || '',
    color: color || '#0073ea',
    created_by: req.user.id,
    member_ids: members,
  });
  // Broadcast: send to everyone (they all see locked cards), but mark accordingly
  io.sockets.sockets.forEach(s => {
    if (s.user) s.emit('board:created', enrichBoardForUser(board, s.user));
  });
  res.json(enrichBoardForUser(board, req.user));
});

app.put('/api/boards/:id', auth, requireRole('owner', 'manager'), (req, res) => {
  const { name, description, color, member_ids, private_to } = req.body;
  const patch = { name, description, color };
  if (member_ids !== undefined) patch.member_ids = Array.isArray(member_ids) ? member_ids.map(Number).filter(Boolean) : [];
  if (private_to !== undefined && member_ids === undefined) patch.member_ids = private_to ? [parseInt(private_to)] : [];
  const board = db.boards.update(parseInt(req.params.id), patch);
  if (!board) return res.status(404).json({ error: 'Board não encontrado' });
  io.sockets.sockets.forEach(s => {
    if (s.user) s.emit('board:updated', enrichBoardForUser(board, s.user));
  });
  res.json(enrichBoardForUser(board, req.user));
});

// Manage members directly: PUT /api/boards/:id/members
app.put('/api/boards/:id/members', auth, requireRole('owner', 'manager'), (req, res) => {
  const { member_ids } = req.body;
  const members = Array.isArray(member_ids) ? member_ids.map(Number).filter(Boolean) : [];
  const board = db.boards.update(parseInt(req.params.id), { member_ids: members });
  if (!board) return res.status(404).json({ error: 'Board não encontrado' });
  io.sockets.sockets.forEach(s => {
    if (s.user) s.emit('board:updated', enrichBoardForUser(board, s.user));
  });
  res.json(enrichBoardForUser(board, req.user));
});

app.delete('/api/boards/:id', auth, requireRole('owner', 'manager'), (req, res) => {
  const id = parseInt(req.params.id);
  db.tasks.removeByBoard(id);
  db.boards.remove(id);
  io.emit('board:deleted', { id });
  res.json({ success: true });
});

// ──────────────────────────────────────────────
//  TASKS
// ──────────────────────────────────────────────
app.get('/api/tasks', auth, (req, res) => {
  const filter = {};
  if (req.query.board_id) filter.board_id = parseInt(req.query.board_id);
  if (req.query.assignee_id) filter.assignee_id = parseInt(req.query.assignee_id);
  if (req.query.status) filter.status = req.query.status;

  const allowedBoardIds = new Set(db.boards.all().filter(b => canAccessBoard(b, req.user)).map(b => b.id));

  // Specific board requested: enforce membership unless owner.
  // If user isn't a member but has tasks assigned in that board, return ONLY their tasks (cross-board task access).
  if (filter.board_id) {
    if (!allowedBoardIds.has(filter.board_id)) {
      const myTasks = db.tasks.all(filter).filter(t => t.assignee_id === req.user.id || t.creator_id === req.user.id);
      return res.json(myTasks);
    }
    return res.json(db.tasks.all(filter));
  }

  // No board filter: return tasks from accessible boards + any task assigned to/created by the user
  const tasks = db.tasks.all(filter).filter(t =>
    !t.board_id || allowedBoardIds.has(t.board_id) || t.assignee_id === req.user.id || t.creator_id === req.user.id
  );
  res.json(tasks);
});

app.post('/api/tasks', auth, (req, res) => {
  const { title, description, status, priority, board_id, assignee_id, sector, deadline, start_date, recurring, recurrence, published_url, fixed, estimated_hours, actual_hours, parent_id, turno } = req.body;
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  const task = db.tasks.create({
    title: title.trim(), description: description || '', status: status || 'todo',
    priority: priority || 'medium', board_id: board_id ? parseInt(board_id) : null,
    assignee_id: assignee_id ? parseInt(assignee_id) : null,
    creator_id: req.user.id, sector: sector || '', deadline: deadline || null,
    start_date: start_date || null,
    recurring: recurring || 'none', recurrence: recurrence || 'none',
    published_url: published_url || null,
    fixed: fixed || false,
    estimated_hours: estimated_hours ? parseFloat(estimated_hours) : null,
    actual_hours: actual_hours ? parseFloat(actual_hours) : null,
    parent_id: parent_id ? parseInt(parent_id) : null,
    turno: turno || null,
  });
  io.emit('task:created', task);
  // Also emit a parent update so subtask_count refreshes
  if (task.parent_id) {
    const parent = db.tasks.find(task.parent_id);
    if (parent) io.emit('task:updated', parent);
  }
  res.json(task);
});

// Get subtasks of a task
app.get('/api/tasks/:id/subtasks', auth, (req, res) => {
  const parentId = parseInt(req.params.id);
  res.json(db.tasks.all({ parent_id: parentId }));
});

// ── Timer: start/stop/state ─────────────────────
app.post('/api/tasks/:id/timer/start', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const raw = db.tasks.findRaw(id);
  if (!raw) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const startedAt = new Date().toISOString();
  const task = db.tasks.update(id, {
    timer_started_at: startedAt,
    timer_user_id: req.user.id,
  });
  io.emit('task:updated', task);
  res.json(task);
});

app.post('/api/tasks/:id/timer/stop', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const raw = db.tasks.findRaw(id);
  if (!raw) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!raw.timer_started_at) return res.status(400).json({ error: 'Timer não está rodando' });
  const elapsedSec = Math.floor((Date.now() - new Date(raw.timer_started_at).getTime()) / 1000);
  const accSec = (raw.tracked_seconds || 0) + elapsedSec;
  const task = db.tasks.update(id, {
    timer_started_at: null,
    timer_user_id: null,
    tracked_seconds: accSec,
  });
  io.emit('task:updated', task);
  res.json(task);
});

app.post('/api/tasks/:id/timer/reset', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const raw = db.tasks.findRaw(id);
  if (!raw) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const task = db.tasks.update(id, {
    timer_started_at: null,
    timer_user_id: null,
    tracked_seconds: 0,
  });
  io.emit('task:updated', task);
  res.json(task);
});

app.put('/api/tasks/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const raw = db.tasks.findRaw(id);
  if (!raw) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (raw.creator_id !== req.user.id && !['owner', 'manager'].includes(req.user.role) && raw.assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  // PATCH-style: only update fields explicitly provided in body.
  // This prevents inline cell edits (which send a single field like { assignee_id: X })
  // from wiping out title, board_id, etc. with undefined.
  const patch = {};
  const setIf = (key, transform = (v) => v) => {
    if (req.body[key] !== undefined) patch[key] = transform(req.body[key]);
  };
  setIf('title', v => (typeof v === 'string' && v.trim()) ? v.trim() : raw.title);
  setIf('description', v => v == null ? '' : v);
  setIf('status');
  setIf('priority');
  setIf('assignee_id', v => v ? parseInt(v) : null);
  setIf('sector', v => v == null ? '' : v);
  setIf('deadline', v => v || null);
  setIf('start_date', v => v || null);
  setIf('board_id', v => v ? parseInt(v) : null);
  setIf('checklist');
  setIf('recurring');
  setIf('recurrence');
  setIf('published_url');
  setIf('depends_on');
  setIf('fixed', v => !!v);
  setIf('estimated_hours', v => v ? parseFloat(v) : null);
  setIf('actual_hours', v => v ? parseFloat(v) : null);
  setIf('parent_id', v => v ? parseInt(v) : null);
  setIf('turno', v => v || null);
  const task = db.tasks.update(id, patch);

  // Log history
  const FIELD_LABELS = {
    title: 'Título', description: 'Descrição', status: 'Status', priority: 'Prioridade',
    assignee_id: 'Responsável', deadline: 'Prazo', sector: 'Setor',
    recurring: 'Recorrência', published_url: 'Link de Publicação',
    approval_status: 'Aprovação', fixed: 'Tarefa Fixa',
    estimated_hours: 'Horas Estimadas', actual_hours: 'Horas Reais'
  };
  const STATUS_LABELS = { todo: 'A Fazer', in_progress: 'Em Andamento', review: 'Em Revisão', done: 'Concluído', stuck: 'Parado' };
  const PRIORITY_LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
  const userName = db.users.find(req.user.id)?.name || 'Desconhecido';
  const fieldsToTrack = ['title', 'status', 'priority', 'assignee_id', 'deadline', 'sector', 'approval_status', 'fixed', 'estimated_hours', 'actual_hours'];
  fieldsToTrack.forEach(field => {
    const newVal = req.body[field];
    if (newVal === undefined) return;
    const oldVal = raw[field];
    const normalizeVal = (v) => (v === null || v === undefined || v === '') ? '' : String(v);
    if (normalizeVal(newVal) === normalizeVal(oldVal)) return;
    let oldDisplay = oldVal, newDisplay = newVal;
    if (field === 'status') { oldDisplay = STATUS_LABELS[oldVal] || oldVal; newDisplay = STATUS_LABELS[newVal] || newVal; }
    if (field === 'priority') { oldDisplay = PRIORITY_LABELS[oldVal] || oldVal; newDisplay = PRIORITY_LABELS[newVal] || newVal; }
    if (field === 'assignee_id') {
      oldDisplay = db.users.find(parseInt(oldVal))?.name || 'Ninguém';
      newDisplay = db.users.find(parseInt(newVal))?.name || 'Ninguém';
    }
    if (field === 'fixed') { oldDisplay = oldVal ? 'Sim' : 'Não'; newDisplay = newVal ? 'Sim' : 'Não'; }
    db.taskHistory.create({
      task_id: id, user_id: req.user.id, user_name: userName,
      field: FIELD_LABELS[field] || field,
      old_value: oldDisplay == null ? '' : String(oldDisplay),
      new_value: newDisplay == null ? '' : String(newDisplay),
    });
  });

  io.emit('task:updated', task);
  res.json(task);
});

app.put('/api/tasks/:id/approve', auth, requireRole('owner', 'manager'), (req, res) => {
  const { approval_status } = req.body; // 'approved' | 'rejected'
  const task = db.tasks.update(parseInt(req.params.id), { approval_status });
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  io.emit('task:updated', task);
  res.json(task);
});

// ──────────────────────────────────────────────
//  COMMENTS
// ──────────────────────────────────────────────
app.get('/api/tasks/:id/comments', auth, (req, res) => {
  res.json(db.comments.byTask(parseInt(req.params.id)));
});

app.post('/api/tasks/:id/comments', auth, (req, res) => {
  const { content, attachment_url, attachment_name } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });
  const taskId = parseInt(req.params.id);
  const commentFields = { task_id: taskId, user_id: req.user.id, content: content.trim() };
  if (attachment_url) commentFields.attachment_url = attachment_url;
  if (attachment_name) commentFields.attachment_name = attachment_name;
  const comment = db.comments.create(commentFields);
  const u = db.users.find(req.user.id);
  const enriched = { ...comment, user_name: u?.name || 'Desconhecido', avatar_color: u?.avatar_color || '#666' };
  io.emit(`task:comment:${taskId}`, enriched);

  // Detect @mentions and notify mentioned users
  const mentionRegex = /@(\w+)/g;
  const allUsers = db.users.all();
  let m;
  while ((m = mentionRegex.exec(content.trim())) !== null) {
    const mentionedName = m[1].toLowerCase();
    const mentionedUser = allUsers.find(u2 => u2.name.toLowerCase().replace(/\s+/g, '').includes(mentionedName));
    if (mentionedUser && mentionedUser.id !== req.user.id) {
      const rawTask = db.tasks.findRaw(taskId);
      const senderUser = db.users.find(req.user.id);
      io.emit(`mention:${mentionedUser.id}`, {
        from: senderUser?.name,
        task_id: taskId,
        task_title: rawTask?.title,
        board_id: rawTask?.board_id,
        content: content.trim()
      });
      const notif = db.notifications.create({
        user_id: mentionedUser.id,
        type: 'mention',
        message: `${senderUser?.name} mencionou você no chat`,
        link: `/boards/${rawTask?.board_id}`,
        read: false
      });
      io.emit(`notification:new:${mentionedUser.id}`, notif);
    }
  }

  // Refresh comment_count badge on task list
  const updatedTask = db.tasks.find(taskId);
  if (updatedTask) io.emit('task:updated', updatedTask);

  res.status(201).json(enriched);
});

app.post('/api/comments/:id/reactions', auth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji obrigatório' });
  const comment = db.comments.addReaction(parseInt(req.params.id), req.user.id, emoji);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });
  const u = db.users.find(comment.user_id);
  const enriched = { ...comment, user_name: u?.name, avatar_color: u?.avatar_color };
  const taskId = comment.task_id;
  io.emit(`task:comment:${taskId}`, { type: 'reaction_update', comment: enriched });
  res.json(enriched);
});

app.delete('/api/comments/:id', auth, (req, res) => {
  db.comments.remove(parseInt(req.params.id));
  res.json({ ok: true });
});

app.get('/api/tasks/:id/history', auth, (req, res) => {
  res.json(db.taskHistory.byTask(parseInt(req.params.id)));
});

app.patch('/api/tasks/:id/status', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  // Check dependencies before allowing progress past 'todo'
  const rawTask = db.tasks.findRaw(id);
  if (status && status !== 'todo') {
    if (rawTask?.depends_on) {
      try {
        const depIds = JSON.parse(rawTask.depends_on);
        const blocked = depIds.some(depId => {
          const dep = db.tasks.findRaw(depId);
          return dep && dep.status !== 'done';
        });
        if (blocked) return res.status(400).json({ error: 'Esta tarefa depende de outra que ainda não foi concluída.' });
      } catch {}
    }
  }
  const task = db.tasks.update(id, { status });
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const patchUser = db.users.find(req.user.id)?.name || 'Desconhecido';
  const STATUS_LABELS_PATCH = { todo: 'A Fazer', in_progress: 'Em Andamento', review: 'Em Revisão', done: 'Concluído', stuck: 'Parado' };
  db.taskHistory.create({
    task_id: id, user_id: req.user.id, user_name: patchUser,
    field: 'Status',
    old_value: STATUS_LABELS_PATCH[rawTask?.status] || rawTask?.status || '',
    new_value: STATUS_LABELS_PATCH[status] || status,
  });
  io.emit('task:updated', task);
  res.json(task);
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const raw = db.tasks.findRaw(id);
  if (!raw) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (raw.creator_id !== req.user.id && !['owner', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  // Cascade: delete subtasks too
  const subtaskIds = db.tasks.all({ parent_id: id }).map(t => t.id);
  subtaskIds.forEach(sid => {
    db.tasks.remove(sid);
    io.emit('task:deleted', { id: sid });
  });
  const parentId = raw.parent_id;
  db.tasks.remove(id);
  io.emit('task:deleted', { id });
  // Refresh parent subtask_count
  if (parentId) {
    const parent = db.tasks.find(parentId);
    if (parent) io.emit('task:updated', parent);
  }
  res.json({ success: true });
});

// ──────────────────────────────────────────────
//  NOTIFICATIONS
// ──────────────────────────────────────────────
app.get('/api/notifications', auth, (req, res) => {
  res.json(db.notifications.forUser(req.user.id));
});

app.patch('/api/notifications/read-all', auth, (req, res) => {
  db.notifications.markAllRead(req.user.id);
  res.json({ ok: true });
});

app.patch('/api/notifications/:id/read', auth, (req, res) => {
  db.notifications.markRead(parseInt(req.params.id));
  res.json({ ok: true });
});

// ──────────────────────────────────────────────
//  FILE UPLOAD
// ──────────────────────────────────────────────
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, name: req.file.originalname, type: req.file.mimetype });
});

// ──────────────────────────────────────────────
//  CHANNELS & MESSAGES
// ──────────────────────────────────────────────
app.get('/api/channels', auth, (req, res) => res.json(db.channels.all()));

app.post('/api/channels', auth, requireRole('owner', 'manager'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  if (db.channels.findByName(name.toLowerCase().trim())) return res.status(400).json({ error: 'Canal já existe' });
  const ch = db.channels.create({ name: name.toLowerCase().trim(), description: description || '', type: 'public', created_by: req.user.id });
  io.emit('channel:created', ch);
  res.json(ch);
});

app.delete('/api/channels/:id', auth, requireRole('owner', 'manager'), (req, res) => {
  const id = parseInt(req.params.id);
  const ch = db.channels.find(id);
  if (!ch) return res.status(404).json({ error: 'Canal não encontrado' });
  if (['geral', 'avisos'].includes(ch.name)) return res.status(400).json({ error: 'Canal padrão não pode ser removido' });
  db.messages.removeByChannel(ch.name);
  db.channels.remove(id);
  io.emit('channel:deleted', { id, name: ch.name });
  res.json({ success: true });
});

app.get('/api/messages/:channel', auth, (req, res) => {
  res.json(db.messages.byChannel(req.params.channel));
});

// ──────────────────────────────────────────────
//  REPORTS
// ──────────────────────────────────────────────

function getDateRange(period, dateStr) {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  let start, end;
  if (period === 'day') {
    start = new Date(base); start.setHours(0, 0, 0, 0);
    end   = new Date(base); end.setHours(23, 59, 59, 999);
  } else if (period === 'week') {
    const day = base.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1) - day; // Monday
    start = new Date(base); start.setDate(base.getDate() + diff); start.setHours(0, 0, 0, 0);
    end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  } else { // month
    start = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0);
    end   = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return { start, end };
}

function inRange(dateIso, start, end) {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  return d >= start && d <= end;
}

app.get('/api/reports', auth, (req, res) => {
  const { period = 'week', date, user_id } = req.query;
  const { start, end } = getDateRange(period, date);
  const users = db.users.all().map(({ password_hash, ...u }) => u);
  const allTasks = db.tasks.all();
  const now = new Date();

  const targetUsers = user_id ? users.filter(u => u.id === parseInt(user_id)) : users;

  const report = targetUsers.map(user => {
    const created   = allTasks.filter(t => t.creator_id  === user.id && inRange(t.created_at,   start, end));
    const assigned  = allTasks.filter(t => t.assignee_id === user.id && inRange(t.created_at,   start, end));
    const completed = allTasks.filter(t => t.assignee_id === user.id && inRange(t.completed_at, start, end));
    const pending   = allTasks.filter(t => t.assignee_id === user.id && t.status !== 'done');
    const overdue   = pending.filter(t => t.deadline && new Date(t.deadline + 'T23:59:59') < now);

    // Performance: all tasks ever assigned to this user that have a deadline
    const allAssigned = allTasks.filter(t => t.assignee_id === user.id && t.deadline);
    const on_time  = allAssigned.filter(t => t.status === 'done' && t.completed_at &&
      new Date(t.completed_at) <= new Date(t.deadline + 'T23:59:59'));
    const late_done = allAssigned.filter(t => t.status === 'done' && t.completed_at &&
      new Date(t.completed_at) > new Date(t.deadline + 'T23:59:59'));
    const not_done_overdue = allAssigned.filter(t => t.status !== 'done' &&
      new Date(t.deadline + 'T23:59:59') < now);

    const score = (on_time.length * 10) + (late_done.length * 3) - (not_done_overdue.length * 5);
    const total_with_deadline = allAssigned.length;
    const completion_rate = total_with_deadline > 0
      ? Math.round(((on_time.length + late_done.length) / total_with_deadline) * 100)
      : null;

    // Performance tier
    let tier;
    if (total_with_deadline === 0) tier = 'sem_dados';
    else if (completion_rate >= 90 && on_time.length >= late_done.length * 2) tier = 'destaque';
    else if (completion_rate >= 70) tier = 'bom';
    else if (completion_rate >= 50) tier = 'regular';
    else tier = 'critico';

    return {
      user: { id: user.id, name: user.name, avatar_color: user.avatar_color, role: user.role },
      summary: {
        created:   created.length,
        assigned:  assigned.length,
        completed: completed.length,
        pending:   pending.length,
        overdue:   overdue.length,
      },
      performance: {
        score,
        on_time:    on_time.length,
        late_done:  late_done.length,
        overdue_total: not_done_overdue.length,
        completion_rate,
        total_with_deadline,
        tier,
      },
      tasks: { created, assigned, completed }
    };
  });

  // Sort by score descending
  report.sort((a, b) => (b.performance.score ?? -999) - (a.performance.score ?? -999));

  res.json({ period, start: start.toISOString(), end: end.toISOString(), report });
});

// Daily breakdown for a single user
app.get('/api/reports/daily', auth, (req, res) => {
  const { user_id, year, month } = req.query;
  const y = parseInt(year  || new Date().getFullYear());
  const m = parseInt(month || new Date().getMonth() + 1);
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end   = new Date(y, m,     0, 23, 59, 59, 999);

  const allTasks = db.tasks.all();
  const filtered = user_id
    ? allTasks.filter(t => t.creator_id === parseInt(user_id) || t.assignee_id === parseInt(user_id))
    : allTasks;

  const days = {};
  filtered.forEach(t => {
    const dateKey = (t.created_at || '').slice(0, 10);
    if (!dateKey || new Date(dateKey) < start || new Date(dateKey) > end) return;
    if (!days[dateKey]) days[dateKey] = [];
    days[dateKey].push(t);
  });

  res.json({ year: y, month: m, days });
});

// Score history — last 8 weeks
app.get('/api/reports/history', auth, (req, res) => {
  const allTasks = db.tasks.all();
  const users = db.users.all().map(({ password_hash, ...u }) => u);
  const now = new Date();
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const end = new Date(now);
    end.setDate(end.getDate() - w * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const weekLabel = `${start.getDate().toString().padStart(2,'0')}/${(start.getMonth()+1).toString().padStart(2,'0')}`;
    const userScores = {};
    users.forEach(u => {
      const assigned = allTasks.filter(t => t.assignee_id === u.id && t.deadline);
      const on_time = assigned.filter(t => t.status === 'done' && t.completed_at &&
        new Date(t.completed_at) >= start && new Date(t.completed_at) <= end &&
        new Date(t.completed_at) <= new Date(t.deadline + 'T23:59:59')).length;
      const late_done = assigned.filter(t => t.status === 'done' && t.completed_at &&
        new Date(t.completed_at) >= start && new Date(t.completed_at) <= end &&
        new Date(t.completed_at) > new Date(t.deadline + 'T23:59:59')).length;
      userScores[u.id] = { score: on_time * 10 + late_done * 3, on_time, late_done };
    });
    weeks.push({ label: weekLabel, start: start.toISOString(), end: end.toISOString(), scores: userScores });
  }
  res.json({ weeks, users: users.map(u => ({ id: u.id, name: u.name, avatar_color: u.avatar_color })) });
});

// ──────────────────────────────────────────────
//  IDEAS
// ──────────────────────────────────────────────
app.get('/api/ideas', auth, (req, res) => res.json(db.ideas.all()));

app.post('/api/ideas', auth, (req, res) => {
  const { title, description, tags, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  const idea = db.ideas.create({ title, description: description || '', tags: tags || [], category: category || 'geral', creator_id: req.user.id });
  res.status(201).json(idea);
});

app.put('/api/ideas/:id', auth, (req, res) => {
  const idea = db.ideas.update(parseInt(req.params.id), req.body);
  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada' });
  res.json(idea);
});

app.delete('/api/ideas/:id', auth, (req, res) => {
  db.ideas.remove(parseInt(req.params.id));
  res.json({ ok: true });
});

// ──────────────────────────────────────────────
//  AI TASK GENERATION
// ──────────────────────────────────────────────

// Helper: get Mon-Fri dates of current week
function getWeekDates() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Rich fallback templates with variety and randomization
const FALLBACK_POOL = {
  marketing: [
    { title: 'Criar stories do dia para o Instagram', description: 'Produzir 4-6 stories com identidade visual da marca', priority: 'high', estimated_hours: 2 },
    { title: 'Gravar reels de produto para o feed', description: 'Vídeo curto mostrando detalhes e diferencial do produto', priority: 'high', estimated_hours: 3 },
    { title: 'Responder comentários e DMs do Instagram', description: 'Interagir com seguidores, salvar leads e responder dúvidas', priority: 'high', estimated_hours: 1 },
    { title: 'Criar artes para campanha da semana', description: 'Peças para feed, stories e WhatsApp', priority: 'high', estimated_hours: 3 },
    { title: 'Planejar calendário de conteúdo da semana', description: 'Definir temas, formatos e datas de publicação', priority: 'medium', estimated_hours: 1 },
    { title: 'Analisar métricas das últimas publicações', description: 'Alcance, engajamento, salvamentos e conversões', priority: 'medium', estimated_hours: 1 },
    { title: 'Atualizar destaques do Instagram', description: 'Revisar categorias e adicionar conteúdos recentes', priority: 'low', estimated_hours: 1 },
    { title: 'Disparar mensagem no WhatsApp para clientes', description: 'Novidades, promoções ou conteúdo de valor para a base', priority: 'medium', estimated_hours: 1 },
    { title: 'Pesquisar tendências de moda e conteúdo', description: 'Referências para próximas criações da semana', priority: 'low', estimated_hours: 1 },
    { title: 'Fazer collab ou parceria com influencer', description: 'Contato, briefing e envio de produto para divulgação', priority: 'medium', estimated_hours: 2 },
  ],
  atendimento: [
    { title: 'Responder directs e DMs do Instagram', description: 'Atender dúvidas sobre produtos, tamanhos e disponibilidade', priority: 'high', estimated_hours: 2 },
    { title: 'Responder mensagens do WhatsApp de clientes', description: 'Pedidos, reclamações, trocas e acompanhamento de entrega', priority: 'high', estimated_hours: 2 },
    { title: 'Acompanhar pedidos em aberto', description: 'Verificar status de envio e atualizar clientes', priority: 'high', estimated_hours: 1 },
    { title: 'Gerenciar trocas e devoluções da semana', description: 'Processar solicitações e encaminhar para estoque', priority: 'high', estimated_hours: 2 },
    { title: 'Responder avaliações no marketplace', description: 'Agradecer positivas e solucionar negativas', priority: 'medium', estimated_hours: 1 },
    { title: 'Confirmar pagamentos pendentes', description: 'Verificar PIX e transferências não confirmados', priority: 'high', estimated_hours: 1 },
    { title: 'Atualizar clientes sobre prazo de entrega', description: 'Contatar pedidos com mais de 3 dias sem atualização', priority: 'medium', estimated_hours: 1 },
    { title: 'Registrar reclamações recorrentes', description: 'Mapear problemas mais comuns para melhoria de processo', priority: 'low', estimated_hours: 1 },
    { title: 'Coletar feedbacks de clientes pós-entrega', description: 'Perguntar sobre satisfação com o produto e entrega', priority: 'medium', estimated_hours: 1 },
    { title: 'Ligar para clientes com pedidos antigos', description: 'Reativar clientes que não compram há mais de 30 dias', priority: 'medium', estimated_hours: 2 },
  ],
  operacional: [
    { title: 'Verificar estoque e repor itens críticos', description: 'Conferir itens abaixo do mínimo e acionar fornecedor', priority: 'high', estimated_hours: 2 },
    { title: 'Organizar e etiquetar produtos em estoque', description: 'Manter organização física do estoque por tamanho e modelo', priority: 'medium', estimated_hours: 2 },
    { title: 'Preparar pedidos para despacho', description: 'Embalar, etiquetar e separar pedidos do dia', priority: 'high', estimated_hours: 3 },
    { title: 'Conferir recebimento de mercadoria', description: 'Checar quantidade, qualidade e nota fiscal', priority: 'high', estimated_hours: 2 },
    { title: 'Atualizar controle de estoque no sistema', description: 'Lançar entradas e saídas do dia', priority: 'medium', estimated_hours: 1 },
    { title: 'Fotografar novos produtos para o catálogo', description: 'Fotos padronizadas em fundo branco com detalhes', priority: 'medium', estimated_hours: 2 },
    { title: 'Organizar área de trabalho e embalagens', description: 'Repor sacolas, caixas e materiais de embalagem', priority: 'low', estimated_hours: 1 },
    { title: 'Revisar processos de separação de pedidos', description: 'Identificar gargalos e propor melhorias', priority: 'low', estimated_hours: 1 },
    { title: 'Contatar transportadora sobre coletas', description: 'Agendar coleta e confirmar endereços', priority: 'medium', estimated_hours: 1 },
    { title: 'Fazer inventário semanal parcial', description: 'Contagem física dos produtos mais vendidos', priority: 'medium', estimated_hours: 2 },
  ],
  financeiro: [
    { title: 'Conciliar extratos bancários', description: 'Conferir entradas, saídas e pagamentos pendentes', priority: 'high', estimated_hours: 2 },
    { title: 'Emitir notas fiscais da semana', description: 'NF-e para vendas do marketplace e loja própria', priority: 'high', estimated_hours: 1 },
    { title: 'Preparar fluxo de caixa semanal', description: 'Projetar entradas e saídas dos próximos 7 dias', priority: 'high', estimated_hours: 1 },
    { title: 'Revisar contas a pagar', description: 'Verificar vencimentos e programar pagamentos', priority: 'high', estimated_hours: 1 },
    { title: 'Revisar contas a receber', description: 'Cobrar recebíveis em atraso e atualizar planilha', priority: 'high', estimated_hours: 1 },
    { title: 'Consolidar vendas por canal', description: 'Totalizar vendas do Instagram, WhatsApp e marketplace', priority: 'medium', estimated_hours: 1 },
    { title: 'Conferir repasses do marketplace', description: 'Verificar se valores batem com vendas do período', priority: 'medium', estimated_hours: 1 },
    { title: 'Atualizar DRE do mês', description: 'Lançar receitas e despesas na planilha gerencial', priority: 'medium', estimated_hours: 2 },
    { title: 'Analisar custo por produto vendido', description: 'Calcular margem e identificar itens mais rentáveis', priority: 'low', estimated_hours: 2 },
    { title: 'Pagar fornecedores da semana', description: 'Executar transferências programadas e registrar', priority: 'high', estimated_hours: 1 },
  ],
  vendas: [
    { title: 'Follow-up com clientes em negociação', description: 'Contatar leads quentes e avançar conversas abertas', priority: 'high', estimated_hours: 2 },
    { title: 'Prospectar novos clientes no Instagram', description: 'Identificar e abordar perfis com fit para o produto', priority: 'medium', estimated_hours: 2 },
    { title: 'Montar vitrine com produtos da semana', description: 'Destacar lançamentos e mais vendidos no feed/stories', priority: 'high', estimated_hours: 1 },
    { title: 'Criar oferta relâmpago para a semana', description: 'Definir produto, desconto, prazo e divulgar', priority: 'high', estimated_hours: 1 },
    { title: 'Atualizar catálogo de produtos', description: 'Incluir novos itens e retirar esgotados', priority: 'medium', estimated_hours: 1 },
    { title: 'Analisar produtos mais vendidos da semana', description: 'Identificar padrões e replicar o que funcionou', priority: 'medium', estimated_hours: 1 },
    { title: 'Criar lista de transmissão para oferta', description: 'Segmentar clientes e disparar mensagem personalizada', priority: 'medium', estimated_hours: 1 },
    { title: 'Recuperar carrinhos abandonados', description: 'Contatar quem demonstrou interesse mas não finalizou', priority: 'high', estimated_hours: 1 },
    { title: 'Negociar condições com fornecedor', description: 'Buscar desconto em volume ou prazo maior', priority: 'medium', estimated_hours: 1 },
    { title: 'Preparar relatório de vendas da semana', description: 'Total por canal, produto e forma de pagamento', priority: 'low', estimated_hours: 1 },
  ],
  rh: [
    { title: 'Fazer check-in semanal com a equipe', description: 'Reunião rápida de alinhamento e prioridades', priority: 'high', estimated_hours: 1 },
    { title: 'Coletar feedbacks individuais', description: 'Conversa 1:1 para identificar dificuldades e reconhecer entregas', priority: 'medium', estimated_hours: 2 },
    { title: 'Atualizar registro de ponto da equipe', description: 'Conferir horários e ausências da semana', priority: 'medium', estimated_hours: 1 },
    { title: 'Definir metas e KPIs da semana por colaborador', description: 'Alinhar expectativas e indicadores de desempenho', priority: 'high', estimated_hours: 1 },
    { title: 'Planejar treinamento interno', description: 'Conteúdo e data para capacitação da equipe', priority: 'low', estimated_hours: 2 },
    { title: 'Revisar e aprovar férias e folgas', description: 'Verificar calendário e impacto nas operações', priority: 'medium', estimated_hours: 1 },
    { title: 'Reconhecer destaque da semana', description: 'Identificar e valorizar colaborador com melhor performance', priority: 'low', estimated_hours: 0.5 },
    { title: 'Atualizar descrições de cargo', description: 'Revisar responsabilidades conforme evolução da operação', priority: 'low', estimated_hours: 1 },
  ],
};

function getFallbackTasks(sector, count) {
  const weekDates = getWeekDates();
  const priorities = ['high', 'high', 'medium', 'medium', 'low'];
  const key = Object.keys(FALLBACK_POOL).find(k => sector.toLowerCase().includes(k))
    || (sector.toLowerCase().includes('social') || sector.toLowerCase().includes('conteudo') ? 'marketing' : null)
    || (sector.toLowerCase().includes('vendas') || sector.toLowerCase().includes('comercial') ? 'vendas' : null)
    || 'operacional';

  const pool = [...(FALLBACK_POOL[key] || FALLBACK_POOL.operacional)];
  // Shuffle for variety
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((t, i) => ({
    ...t,
    deadline: weekDates[Math.min(i, 4)],
  }));
}

app.post('/api/ai/generate-tasks', auth, requireRole('owner', 'manager'), async (req, res) => {
  const { sector, context, count = 5 } = req.body;
  if (!sector) return res.status(400).json({ error: 'Setor obrigatório' });

  const weekDates = getWeekDates();
  const teamMembers = db.users.all().map(u => `${u.name} (${u.role})`).join(', ');
  const existingTasks = db.tasks.all().slice(0, 20).map(t => t.title).join(', ');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.json({ tasks: getFallbackTasks(sector, count), weekDates });
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const prompt = `Você é um assistente de gestão de equipe para uma empresa de moda/vestuário chamada GS MANTOS.
Gere ${count} tarefas práticas, específicas e acionáveis para o setor de "${sector}" para a semana de ${weekDates[0]} a ${weekDates[4]}.

Equipe disponível: ${teamMembers}
Tarefas já existentes (não repita): ${existingTasks || 'nenhuma'}
${context ? `Contexto especial da semana: ${context}` : ''}

Regras:
- Tarefas devem ser concretas e realizáveis em 1-4 horas
- Distribua os prazos ao longo dos dias úteis: ${weekDates.join(', ')}
- Misture prioridades: pelo menos 2 high, 2 medium, 1 low
- Inclua estimativa de horas realista (0.5 a 4)
- Títulos curtos e objetivos (máx 60 chars)
- Descrições práticas de 1 linha

Retorne SOMENTE JSON válido, sem texto extra:
{"tasks":[{"title":"string","description":"string","priority":"high|medium|low","deadline":"YYYY-MM-DD","estimated_hours":number}]}`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = msg.content[0].text.trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    res.json({ tasks: parsed.tasks, weekDates });
  } catch (err) {
    console.error('AI error:', err.message);
    // Fallback on AI error
    res.json({ tasks: getFallbackTasks(sector, count), weekDates });
  }
});

// ──────────────────────────────────────────────
//  DIRECT MESSAGES
// ──────────────────────────────────────────────
app.get('/api/dm/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId);
  const myId = req.user.id;
  const dmName = `dm_${Math.min(myId, otherId)}_${Math.max(myId, otherId)}`;
  let ch = db.channels.findByName(dmName);
  if (!ch) {
    ch = db.channels.create({ name: dmName, description: '', type: 'dm', created_by: myId });
  }
  const other = db.users.find(otherId);
  res.json({ ...ch, dm_with: other ? { id: other.id, name: other.name, avatar_color: other.avatar_color } : null });
});

// ──────────────────────────────────────────────
//  SOCKET.IO
// ──────────────────────────────────────────────
const onlineUsers = new Map();

io.on('connection', (socket) => {
  onlineUsers.set(socket.user.id, socket.id);
  io.emit('users:online', Array.from(onlineUsers.keys()));

  socket.on('announcement:send', ({ title, message, emoji }) => {
    const freshUser = db.users.find(socket.user.id);
    if (!freshUser || freshUser.role !== 'owner') return;
    if (!message?.trim()) return;
    const announcementTitle = title?.trim() || 'Aviso';
    io.emit('announcement:broadcast', {
      id: Date.now(),
      title: announcementTitle,
      message: message.trim(),
      emoji: emoji || '📢',
      from: freshUser.name,
      sent_at: new Date().toISOString(),
    });
    // Persist notifications for all other users
    db.users.all().forEach(u => {
      if (u.id === socket.user.id) return;
      const notif = db.notifications.create({
        user_id: u.id,
        type: 'announcement',
        message: `${freshUser.name}: ${announcementTitle}`,
        link: null,
        read: false
      });
      io.emit(`notification:new:${u.id}`, notif);
    });
  });

  socket.on('message:send', ({ channel, content }) => {
    if (!content?.trim()) return;
    const msg = db.messages.create({ user_id: socket.user.id, channel, content: content.trim() });
    const sender = db.users.find(socket.user.id);
    const enriched = { ...msg, user_name: sender?.name, avatar_color: sender?.avatar_color };
    io.emit(`message:${channel}`, enriched);

    // Detect @mentions and create DM + notify
    const mentionRegex = /@(\w+)/g;
    const allUsers = db.users.all();
    let m;
    while ((m = mentionRegex.exec(content.trim())) !== null) {
      const mentionedName = m[1].toLowerCase();
      const mentionedUser = allUsers.find(u => u.name.toLowerCase().replace(/\s+/g, '').startsWith(mentionedName));
      if (mentionedUser && mentionedUser.id !== socket.user.id) {
        const myId = socket.user.id;
        const otherId = mentionedUser.id;
        const dmName = `dm_${Math.min(myId, otherId)}_${Math.max(myId, otherId)}`;
        let dmCh = db.channels.findByName(dmName);
        if (!dmCh) {
          dmCh = db.channels.create({ name: dmName, description: '', type: 'dm', created_by: myId });
        }
        io.emit(`chat:mention:${mentionedUser.id}`, {
          from: sender?.name,
          from_id: myId,
          channel,
          dm_channel: dmName,
          content: content.trim(),
          avatar_color: sender?.avatar_color,
        });
        const notif = db.notifications.create({
          user_id: mentionedUser.id,
          type: 'mention',
          message: `${sender?.name} mencionou você no chat`,
          link: `/chat`,
          read: false
        });
        io.emit(`notification:new:${mentionedUser.id}`, notif);
      }
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.user.id);
    io.emit('users:online', Array.from(onlineUsers.keys()));
  });
});

// ──────────────────────────────────────────────
//  START
// ──────────────────────────────────────────────

// ── Recurring task generation on startup ──────
function generateRecurringTasks() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDay = new Date().getDay();
  if (todayDay === 0 || todayDay === 6) return; // skip weekends
  const allTasks = db.tasks.all();
  const templates = allTasks.filter(t => t.recurring && t.recurring !== 'none');
  templates.forEach(t => {
    const alreadyExists = allTasks.some(x => x.recurring_from === t.id && x.deadline === today);
    if (!alreadyExists && t.deadline !== today) {
      db.tasks.create({
        title: t.title, description: t.description, board_id: t.board_id,
        assignee_id: t.assignee_id, creator_id: t.creator_id, sector: t.sector,
        priority: t.priority, status: 'todo', deadline: today,
        recurring: t.recurring, recurring_from: t.id,
      });
    }
  });
}
generateRecurringTasks();

// ── Process recurrence field (deadline auto-advance) ──
function processRecurringTasks() {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = db.tasks.all();
  tasks.forEach(task => {
    if (!task.recurrence || task.recurrence === 'none') return;
    if (!task.deadline || task.deadline >= today) return;
    if (task.status === 'done') return;

    const d = new Date(task.deadline);
    if (task.recurrence === 'daily') d.setDate(d.getDate() + 1);
    else if (task.recurrence === 'weekly') d.setDate(d.getDate() + 7);
    else if (task.recurrence === 'monthly') d.setMonth(d.getMonth() + 1);

    const newDeadline = d.toISOString().slice(0, 10);
    if (newDeadline >= today) {
      const updated = db.tasks.update(task.id, { deadline: newDeadline, status: 'todo' });
      db.taskHistory.create({ task_id: task.id, user_id: null, user_name: 'Sistema', field: 'deadline', old_value: task.deadline, new_value: newDeadline, changed_at: new Date().toISOString() });
      io.emit('task:updated', updated);
    }
  });
}
processRecurringTasks();
setInterval(processRecurringTasks, 60 * 60 * 1000);

// ──────────────────────────────────────────────
//  RESET FIXED TASKS: tarefas fixas ficam "todo" novamente todo dia
// ──────────────────────────────────────────────
function resetFixedTasks() {
  const todayStr = new Date().toISOString().slice(0, 10);
  db.tasks.all().forEach(task => {
    if (!task.fixed) return;
    if (task.status !== 'done') return;
    if (!task.completed_at) return;
    const completedDay = task.completed_at.slice(0, 10);
    // If completed before today, reset to todo for the new day
    if (completedDay < todayStr) {
      const updated = db.tasks.update(task.id, { status: 'todo', completed_at: null });
      if (updated) {
        io.emit('task:updated', updated);
        db.taskHistory.create({
          task_id: task.id,
          user_id: null,
          user_name: 'Sistema',
          field: 'Status',
          old_value: 'Concluído',
          new_value: 'A Fazer (reset automático — tarefa fixa)',
        });
      }
    }
  });
}
resetFixedTasks();
// Run every hour to catch midnight crossings even with system clock drift
setInterval(resetFixedTasks, 60 * 60 * 1000);

// ──────────────────────────────────────────────
//  BACKUPS: rotating snapshots (hourly + daily + manual)
// ──────────────────────────────────────────────
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const full = path.join(BACKUP_DIR, f);
      const st = fs.statSync(full);
      return { filename: f, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function takeBackup(kind = 'manual') {
  try {
    const src = path.join(__dirname, 'team-hub.json');
    if (!fs.existsSync(src)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${kind}_${stamp}.json`;
    const dest = path.join(BACKUP_DIR, filename);
    fs.copyFileSync(src, dest);
    // Rotate: keep last 24 hourly, last 30 daily, last 50 manual
    const limits = { hourly: 24, daily: 30, manual: 50 };
    const limit = limits[kind] || 50;
    const sameKind = listBackups().filter(b => b.filename.startsWith(kind + '_'));
    if (sameKind.length > limit) {
      sameKind.slice(limit).forEach(b => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, b.filename)); } catch {}
      });
    }
    return { filename, size: fs.statSync(dest).size, created_at: new Date().toISOString(), kind };
  } catch (err) {
    console.error('[Backup] failed:', err.message);
    return null;
  }
}

// Schedule: hourly backup every hour, daily backup at next midnight + every 24h
takeBackup('hourly'); // initial on boot
setInterval(() => takeBackup('hourly'), 60 * 60 * 1000);

const msUntilMidnight = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
};
setTimeout(() => {
  takeBackup('daily');
  setInterval(() => takeBackup('daily'), 24 * 60 * 60 * 1000);
}, msUntilMidnight());

// Backup endpoints (owner only)
app.get('/api/admin/backups', auth, requireRole('owner'), (req, res) => {
  res.json(listBackups());
});

app.post('/api/admin/backups', auth, requireRole('owner'), (req, res) => {
  const result = takeBackup('manual');
  if (!result) return res.status(500).json({ error: 'Falha ao criar backup' });
  res.json(result);
});

app.get('/api/admin/backups/:filename', auth, requireRole('owner'), (req, res) => {
  const filename = req.params.filename;
  // Sanity: only allow safe filenames within backup dir
  if (!/^[\w.-]+\.json$/.test(filename)) return res.status(400).json({ error: 'Nome inválido' });
  const full = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Backup não encontrado' });
  res.download(full, filename);
});

app.delete('/api/admin/backups/:filename', auth, requireRole('owner'), (req, res) => {
  const filename = req.params.filename;
  if (!/^[\w.-]+\.json$/.test(filename)) return res.status(400).json({ error: 'Nome inválido' });
  const full = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Backup não encontrado' });
  fs.unlinkSync(full);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIP = addr.address; break; }
    }
    if (localIP !== 'localhost') break;
  }
  console.log(`\n🚀 Team Hub Server rodando em:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Rede:    http://${localIP}:${PORT}`);
  console.log(`   Banco:   ${require('path').join(__dirname, 'team-hub.json')}`);
  console.log(`   IA: ${process.env.ANTHROPIC_API_KEY ? '✅ ANTHROPIC_API_KEY configurada' : '⚠  Sem API key (usando templates)'}\n`);
});
