import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useApi } from '../contexts/ApiContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { Modal } from '../components/Modal.jsx';
import {
  HashtagIcon, PlusIcon, TrashIcon, KeyIcon,
  CircleStackIcon, ArrowDownTrayIcon, ShieldCheckIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export function Settings() {
  const { user } = useAuth();
  const api = useApi();
  const { on } = useSocket();
  const [channels, setChannels] = useState([]);
  const [stats, setStats] = useState({ users: 0, boards: 0, tasks: 0, messages: 0 });
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', description: '' });
  const [apiKey, setApiKey] = useState('');
  const [apiSaved, setApiSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/channels').then(setChannels);
    Promise.all([
      api.get('/api/users'),
      api.get('/api/boards'),
      api.get('/api/tasks'),
    ]).then(([u, b, t]) => setStats({ users: u.length, boards: b.length, tasks: t.length }));
  }, []);

  useEffect(() => {
    const offs = [
      on('channel:created', c => setChannels(p => [...p, c])),
      on('channel:deleted', ({ id }) => setChannels(p => p.filter(c => c.id !== id))),
    ];
    return () => offs.forEach(f => f?.());
  }, [on]);

  const createChannel = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/channels', newChannel);
      setShowNewChannel(false);
      setNewChannel({ name: '', description: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteChannel = async (ch) => {
    if (!confirm(`Remover canal #${ch.name} e todas as mensagens?`)) return;
    try { await api.del(`/api/channels/${ch.id}`); } catch (err) { alert(err.message); }
  };

  const saveApiKey = () => {
    localStorage.setItem('anthropic_api_key_hint', apiKey ? '****' : '');
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
    alert('Para definir a chave de IA, reinicie o servidor com:\n\nset ANTHROPIC_API_KEY=' + apiKey + '\nnode index.js\n\n(no diretório server/)');
  };

  const exportData = async () => {
    const [users, boards, tasks] = await Promise.all([
      api.get('/api/users'),
      api.get('/api/boards'),
      api.get('/api/tasks'),
    ]);
    const data = { exportedAt: new Date().toISOString(), users: users.map(({ email, ...u }) => u), boards, tasks };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-hub-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!['owner', 'manager'].includes(user?.role)) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <ShieldCheckIcon className="w-16 h-16 mx-auto mb-3 text-gray-700" />
          <p>Apenas Donos e Gerentes podem acessar as configurações.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Configurações</h1>
        <p className="text-sm text-gray-400 mt-0.5">Gerencie o sistema e os recursos da equipe</p>
      </div>

      {/* Stats */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <CircleStackIcon className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-100">Estatísticas do Sistema</h2>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Membros', value: stats.users },
            { label: 'Boards', value: stats.boards },
            { label: 'Tarefas', value: stats.tasks },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-100">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Channels */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <HashtagIcon className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-gray-100">Canais de Chat</h2>
          </div>
          <button onClick={() => setShowNewChannel(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <PlusIcon className="w-4 h-4" /> Novo Canal
          </button>
        </div>
        <div className="space-y-2">
          {channels.map(ch => (
            <div key={ch.id} className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded-xl group">
              <div className="flex items-center gap-3">
                <HashtagIcon className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-200">{ch.name}</p>
                  {ch.description && <p className="text-xs text-gray-500">{ch.description}</p>}
                </div>
              </div>
              {!['geral', 'avisos'].includes(ch.name) && (
                <button
                  onClick={() => deleteChannel(ch)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-700 text-gray-500 hover:text-danger transition"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
              {['geral', 'avisos'].includes(ch.name) && (
                <span className="text-xs text-gray-600 italic">padrão</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* AI Configuration */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <KeyIcon className="w-5 h-5 text-purple-400" />
          <h2 className="font-semibold text-gray-100">Configuração de IA</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Para usar a geração de tarefas com IA real (Claude), configure a chave da API Anthropic no servidor.
          Sem a chave, o sistema usa templates pré-definidos por setor.
        </p>
        <div className="bg-gray-800 rounded-xl p-4 font-mono text-xs text-gray-300 mb-4 space-y-1">
          <p className="text-gray-500"># No terminal, dentro da pasta server/:</p>
          <p><span className="text-success">set</span> ANTHROPIC_API_KEY=<span className="text-warning">sua-chave-aqui</span></p>
          <p><span className="text-primary">node</span> index.js</p>
        </div>
        <a
          href="https://console.anthropic.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          Obter chave em console.anthropic.com →
        </a>
      </div>

      {/* Export */}
      {user?.role === 'owner' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDownTrayIcon className="w-5 h-5 text-success" />
            <h2 className="font-semibold text-gray-100">Exportar Dados</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Baixe um arquivo JSON com todos os boards, tarefas e membros do sistema (senhas não são exportadas).
          </p>
          <button onClick={exportData} className="flex items-center gap-2 btn-ghost border border-gray-700 text-sm">
            <ArrowDownTrayIcon className="w-4 h-4" />
            Baixar backup JSON
          </button>
        </div>
      )}

      {/* Database location */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-100 mb-3">Banco de Dados</h2>
        <p className="text-xs text-gray-400 mb-2">Arquivo local (salvo automaticamente a cada alteração):</p>
        <div className="bg-gray-800 rounded-lg px-4 py-3 font-mono text-xs text-gray-300">
          C:\Users\User\team-hub\server\team-hub.json
        </div>
        <p className="text-xs text-gray-600 mt-2">Faça backup deste arquivo para preservar todos os dados.</p>
      </div>

      {/* New Channel Modal */}
      <Modal open={showNewChannel} onClose={() => setShowNewChannel(false)} title="Novo Canal" size="sm">
        <form onSubmit={createChannel} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Nome *</label>
            <input
              className="input"
              placeholder="Ex: projetos, suporte, financeiro…"
              value={newChannel.name}
              onChange={e => setNewChannel(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') }))}
              required
            />
            <p className="text-xs text-gray-600 mt-1">Apenas letras minúsculas, números e hífens</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Descrição</label>
            <input className="input" placeholder="Propósito do canal" value={newChannel.description} onChange={e => setNewChannel(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowNewChannel(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Criando…' : 'Criar Canal'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
