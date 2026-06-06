import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useApi } from '../contexts/ApiContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { Avatar, RoleBadge } from '../components/Avatar.jsx';
import { TrashIcon, PencilIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

const ROLES = [
  { value: 'owner', label: 'Dono', desc: 'Acesso total — gerencia equipe, boards e configurações' },
  { value: 'manager', label: 'Gerente', desc: 'Cria boards, gerencia tarefas e canais' },
  { value: 'operational', label: 'Operacional', desc: 'Executa tarefas e participa do chat' },
];

export function Team() {
  const { user } = useAuth();
  const api = useApi();
  const { on, onlineUsers } = useSocket();
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [roleUser, setRoleUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const isOwner = user?.role === 'owner';

  useEffect(() => {
    Promise.all([api.get('/api/users'), api.get('/api/tasks')]).then(([u, t]) => {
      setUsers(u);
      setTasks(t);
    });
  }, []);

  useEffect(() => {
    const offs = [
      on('user:updated', u => setUsers(p => p.map(x => x.id === u.id ? { ...x, ...u } : x))),
      on('user:deleted', ({ id }) => setUsers(p => p.filter(x => x.id !== id))),
    ];
    return () => offs.forEach(f => f?.());
  }, [on]);

  const changeRole = async () => {
    try {
      await api.put(`/api/users/${roleUser.id}/role`, { role: selectedRole });
      setRoleUser(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Remover este membro da equipe?')) return;
    try {
      await api.del(`/api/users/${id}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const getUserTasks = (uid) => tasks.filter(t => t.assignee_id === uid);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Equipe</h1>
          <p className="text-sm text-gray-400 mt-0.5">{users.length} membro{users.length !== 1 ? 's' : ''} · {onlineUsers.length} online</p>
        </div>
      </div>

      {/* Role legend */}
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        {ROLES.map(r => (
          <div key={r.value} className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <RoleBadge role={r.value} />
            </div>
            <p className="text-xs text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Members table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Membro</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Função</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tarefas</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Desde</th>
                {isOwner && <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((member, i) => {
                const memberTasks = getUserTasks(member.id);
                const done = memberTasks.filter(t => t.status === 'done').length;
                const isOnline = onlineUsers.includes(member.id);
                const isMe = member.id === user.id;

                return (
                  <tr key={member.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition ${isMe ? 'bg-primary/5' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar user={member} size="md" online={isOnline} />
                        <div>
                          <p className="font-medium text-gray-200">{member.name} {isMe && <span className="text-xs text-gray-500">(você)</span>}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <RoleBadge role={member.role} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs text-gray-400">
                        <span className="font-medium text-gray-200">{memberTasks.length}</span> total ·{' '}
                        <span className="text-success">{done}</span> concluídas
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`flex items-center gap-1.5 text-xs ${isOnline ? 'text-success' : 'text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-success' : 'bg-gray-600'}`} />
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-500">
                      {format(new Date(member.created_at), 'dd/MM/yyyy')}
                    </td>
                    {isOwner && (
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {!isMe && (
                            <>
                              <button
                                onClick={() => { setRoleUser(member); setSelectedRole(member.role); }}
                                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-primary transition"
                                title="Alterar função"
                              >
                                <ShieldCheckIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteUser(member.id)}
                                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-danger transition"
                                title="Remover membro"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Change Role Modal */}
      <Modal open={!!roleUser} onClose={() => setRoleUser(null)} title={`Alterar Função — ${roleUser?.name}`} size="sm">
        <div className="space-y-3">
          {ROLES.map(r => (
            <label key={r.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedRole === r.value ? 'border-primary bg-primary/10' : 'border-gray-700 hover:border-gray-600'}`}>
              <input type="radio" name="role" value={r.value} checked={selectedRole === r.value} onChange={() => setSelectedRole(r.value)} className="mt-0.5 accent-primary" />
              <div>
                <p className="text-sm font-medium text-gray-200">{r.label}</p>
                <p className="text-xs text-gray-500">{r.desc}</p>
              </div>
            </label>
          ))}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setRoleUser(null)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={changeRole} className="btn-primary flex-1">Salvar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
