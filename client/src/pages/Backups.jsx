import React, { useState, useEffect } from 'react';
import { useApi } from '../contexts/ApiContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { ArrowDownTrayIcon, TrashIcon, PlusIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR');
  } catch { return iso; }
}

const KIND_META = {
  hourly: { label: 'Horário', color: '#0073ea', icon: '🕒' },
  daily:  { label: 'Diário',  color: '#00c875', icon: '📅' },
  manual: { label: 'Manual',  color: '#D4AF37', icon: '👤' },
};

export function Backups() {
  const api = useApi();
  const { user, token } = useAuth();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const isOwner = user?.role === 'owner';

  const load = () => {
    api.get('/api/admin/backups')
      .then(setBackups)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOwner) load();
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      await api.post('/api/admin/backups', {});
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const download = async (filename) => {
    try {
      const res = await fetch(`/api/admin/backups/${filename}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) throw new Error('Falha ao baixar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  };

  const remove = async (filename) => {
    if (!confirm(`Remover backup ${filename}?`)) return;
    try {
      await api.del(`/api/admin/backups/${filename}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-lg font-black text-white mb-1">Acesso restrito</h1>
          <p className="text-sm text-gray-500">Apenas o dono pode gerenciar backups.</p>
        </div>
      </div>
    );
  }

  // Group by kind
  const grouped = { hourly: [], daily: [], manual: [] };
  backups.forEach(b => {
    const kind = b.filename.split('_')[0];
    if (grouped[kind]) grouped[kind].push(b);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: '#1f1f1f' }}>
        <div>
          <h1 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-yellow-400" />
            Backups
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {backups.length} backup{backups.length !== 1 ? 's' : ''} · automáticos a cada hora + diários à meia-noite
          </p>
        </div>
        <button onClick={create} disabled={creating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-50 transition"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)' }}>
          <PlusIcon className="w-4 h-4" />
          {creating ? 'Criando…' : 'Criar backup agora'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: '#0a0a0a' }}>
        {loading ? (
          <div className="text-center text-gray-500 py-12">Carregando…</div>
        ) : error ? (
          <div className="text-center text-red-400 py-12">{error}</div>
        ) : backups.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p className="mb-2">Nenhum backup ainda.</p>
            <p className="text-xs">O primeiro backup automático será criado em até 1 hora.</p>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl">
            {['manual', 'daily', 'hourly'].map(kind => {
              const items = grouped[kind] || [];
              const meta = KIND_META[kind];
              if (items.length === 0) return null;
              return (
                <div key={kind} className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#161616', borderColor: '#2a2a2a' }}>
                  <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: '#2a2a2a', backgroundColor: '#1a1a1a' }}>
                    <span className="text-lg">{meta.icon}</span>
                    <h3 className="text-sm font-black text-white">{meta.label}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-gray-300" style={{ backgroundColor: meta.color + '30', color: meta.color }}>
                      {items.length}
                    </span>
                  </div>
                  <div className="divide-y" style={{ borderColor: '#2a2a2a' }}>
                    {items.map(b => (
                      <div key={b.filename} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-gray-300 truncate">{b.filename}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">{fmtDate(b.created_at)} · {fmtSize(b.size)}</div>
                        </div>
                        <button onClick={() => download(b.filename)}
                          title="Baixar"
                          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-yellow-400 transition">
                          <ArrowDownTrayIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(b.filename)}
                          title="Remover"
                          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-danger transition">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="max-w-4xl mt-6 rounded-xl border p-4 text-xs text-gray-500" style={{ backgroundColor: '#0d0d0d', borderColor: '#1f1f1f' }}>
          <p className="font-bold text-gray-300 mb-2">💡 Como funciona</p>
          <ul className="space-y-1 list-disc list-inside">
            <li><strong>Horário:</strong> backup automático a cada 1h (mantém os 24 mais recentes)</li>
            <li><strong>Diário:</strong> backup automático à meia-noite (mantém os 30 mais recentes)</li>
            <li><strong>Manual:</strong> você cria sob demanda (mantém os 50 mais recentes)</li>
            <li>Arquivos salvos em <code className="bg-gray-900 px-1 py-0.5 rounded">team-hub/server/backups/</code></li>
            <li>Em caso de corrupção, basta substituir <code className="bg-gray-900 px-1 py-0.5 rounded">team-hub.json</code> por um backup baixado</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
