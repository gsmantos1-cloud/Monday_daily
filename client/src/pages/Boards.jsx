import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useApi } from '../contexts/ApiContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { PlusIcon, TrashIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';

const BOARD_COLORS = ['#0073ea', '#e2445c', '#00c875', '#fdab3d', '#784bd1', '#00cec9', '#ff7675', '#a29bfe', '#fd79a8'];

export function Boards() {
  const { user } = useAuth();
  const api = useApi();
  const { on } = useSocket();
  const [boards, setBoards] = useState([]);
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#0073ea', member_ids: [] });
  const [loading, setLoading] = useState(false);
  const [editMembersBoard, setEditMembersBoard] = useState(null);
  const canManage = ['owner', 'manager'].includes(user?.role);
  const isOwner = user?.role === 'owner';

  useEffect(() => {
    api.get('/api/boards').then(setBoards);
    api.get('/api/users').then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    const offs = [
      on('board:created', b => setBoards(p => [b, ...p])),
      on('board:updated', b => setBoards(p => p.map(x => x.id === b.id ? { ...x, ...b } : x))),
      on('board:deleted', ({ id }) => setBoards(p => p.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(f => f?.());
  }, [on]);

  const createBoard = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/boards', { ...form, member_ids: form.member_ids });
      setShowCreate(false);
      setForm({ name: '', description: '', color: '#0073ea', member_ids: [] });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (uid) => {
    setForm(f => {
      const has = f.member_ids.includes(uid);
      return { ...f, member_ids: has ? f.member_ids.filter(x => x !== uid) : [...f.member_ids, uid] };
    });
  };

  const saveBoardMembers = async (boardId, member_ids) => {
    try {
      await api.put(`/api/boards/${boardId}/members`, { member_ids });
      setEditMembersBoard(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteBoard = async (id) => {
    if (!confirm('Remover este board e todas as suas tarefas?')) return;
    await api.del(`/api/boards/${id}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: '#1f1f1f' }}>
        <div>
          <h1 className="text-lg font-bold text-gray-100">Boards</h1>
          <p className="text-xs text-gray-500 mt-0.5">{boards.length} board{boards.length !== 1 ? 's' : ''} · Organize o trabalho da equipe</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> Novo Board
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {boards.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardDocumentListIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-400 mb-2">Nenhum board ainda</h2>
            <p className="text-gray-500 text-sm mb-6">Crie o primeiro board para organizar as tarefas da equipe.</p>
            {canManage && (
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                Criar primeiro board
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
            {boards.map(board => {
              const progress = board.task_count > 0 ? Math.round((board.done_count / board.task_count) * 100) : 0;
              const locked = !!board.locked;
              const memberCount = (board.member_ids || []).length;
              return (
                <div
                  key={board.id}
                  className={`card p-5 transition group relative ${locked ? 'opacity-60' : 'hover:border-gray-600'}`}
                  style={locked ? { background: 'repeating-linear-gradient(45deg, #141414, #141414 10px, #181818 10px, #181818 20px)' } : {}}
                  title={locked ? 'Você não tem acesso a este board' : ''}
                >
                  <div className="h-1 rounded-full mb-4 overflow-hidden bg-gray-800">
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: board.color }} />
                  </div>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative" style={{ backgroundColor: board.color + '20' }}>
                      <ClipboardDocumentListIcon className="w-5 h-5" style={{ color: board.color }} />
                      {locked && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-[10px]">🔒</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className={`font-semibold truncate ${locked ? 'text-gray-400' : 'text-gray-100'}`}>{board.name}</h3>
                        {board.is_private && !locked && <span title="Board privado" className="text-xs">🔒</span>}
                      </div>
                      {board.description && <p className="text-xs text-gray-500 truncate mt-0.5">{board.description}</p>}
                      {board.is_private && memberCount > 0 && (
                        <p className="text-[10px] text-gray-600 mt-1">{memberCount} membro{memberCount !== 1 ? 's' : ''} {locked ? '(você não está)' : ''}</p>
                      )}
                    </div>
                    {canManage && !locked && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition relative z-10">
                        {isOwner && (
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setEditMembersBoard(board); }}
                            title="Gerenciar membros"
                            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-200 transition"
                          >
                            👥
                          </button>
                        )}
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); deleteBoard(board.id); }}
                          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-danger transition"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{board.task_count} tarefa{board.task_count !== 1 ? 's' : ''}</span>
                    {locked ? (
                      <span className="text-gray-600 font-semibold">SEM ACESSO</span>
                    ) : (
                      <span className="text-success">{progress}% concluído</span>
                    )}
                  </div>
                  {!locked && <Link to={`/boards/${board.id}`} className="absolute inset-0 rounded-xl" />}
                  {locked && (
                    <button
                      onClick={() => alert(`Você não tem acesso ao board "${board.name}". Peça ao dono para te adicionar como membro.`)}
                      className="absolute inset-0 rounded-xl cursor-not-allowed"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo Board">
        <form onSubmit={createBoard} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Nome *</label>
            <input className="input" placeholder="Ex: Sprint Q1, Marketing, Operações…" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Descrição</label>
            <input className="input" placeholder="Opcional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {BOARD_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-7 h-7 rounded-full border-2 transition ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {isOwner && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                👥 Membros (deixe vazio para público)
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border" style={{ backgroundColor: '#0a0a0a', borderColor: '#2a2a2a' }}>
                {users.map(u => {
                  const selected = form.member_ids.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleMember(u.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition border ${selected ? 'border-yellow-500 text-black' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                      style={selected ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
                    >
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black text-black"
                        style={{ backgroundColor: u.avatar_color || '#D4AF37' }}>
                        {u.name[0].toUpperCase()}
                      </span>
                      {u.name}
                      {selected && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {form.member_ids.length === 0
                  ? '📂 Board público — todos veem'
                  : `🔒 Privado — ${form.member_ids.length} membro(s) selecionado(s)`}
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Criando…' : 'Criar Board'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit Members Modal */}
      <Modal open={!!editMembersBoard} onClose={() => setEditMembersBoard(null)} title={`Membros — ${editMembersBoard?.name || ''}`}>
        {editMembersBoard && (
          <EditMembersForm
            board={editMembersBoard}
            users={users}
            onSave={(ids) => saveBoardMembers(editMembersBoard.id, ids)}
            onCancel={() => setEditMembersBoard(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function EditMembersForm({ board, users, onSave, onCancel }) {
  const [selected, setSelected] = useState(board.member_ids || []);
  const toggle = (uid) => setSelected(p => p.includes(uid) ? p.filter(x => x !== uid) : [...p, uid]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Deixe vazio para tornar o board público (todos veem). Marque os membros que terão acesso completo.
        Quem não estiver na lista vai apenas <strong>ver o card bloqueado</strong> 🔒.
      </p>
      <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto p-2 rounded-lg border" style={{ backgroundColor: '#0a0a0a', borderColor: '#2a2a2a' }}>
        {users.map(u => {
          const sel = selected.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition border ${sel ? 'border-yellow-500 text-black' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
              style={sel ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
            >
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black text-black"
                style={{ backgroundColor: u.avatar_color || '#D4AF37' }}>
                {u.name[0].toUpperCase()}
              </span>
              {u.name}
              {sel && <span>✓</span>}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-500">
        {selected.length === 0
          ? '📂 Board público — todos veem'
          : `🔒 Privado — ${selected.length} membro(s)`}
      </p>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
        <button type="button" onClick={() => onSave(selected)} className="btn-primary flex-1">Salvar</button>
      </div>
    </div>
  );
}
