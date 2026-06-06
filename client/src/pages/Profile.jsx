import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useApi } from '../contexts/ApiContext.jsx';
import { Avatar, RoleBadge } from '../components/Avatar.jsx';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const COLORS = ['#D4AF37', '#e2445c', '#00c875', '#fdab3d', '#784bd1', '#00cec9', '#ff7675', '#a29bfe', '#fd79a8', '#6c5ce7'];

export function Profile() {
  const { user, logout, updateUser } = useAuth();
  const api = useApi();
  const [name, setName] = useState(user?.name || '');
  const [color, setColor] = useState(user?.avatar_color || '#D4AF37');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.put(`/api/users/${user.id}`, { name, avatar_color: color });
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-black text-gray-100 mb-6 tracking-wide">Meu Perfil</h1>

      <div className="card p-6 space-y-6">
        {/* Avatar preview */}
        <div className="flex items-center gap-4">
          <Avatar user={{ ...user, name, avatar_color: color }} size="xl" />
          <div>
            <p className="font-bold text-gray-100">{name}</p>
            <p className="text-sm text-gray-400">{user?.email}</p>
            <div className="mt-1"><RoleBadge role={user?.role} /></div>
          </div>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#888' }}>Nome</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#888' }}>Cor do avatar</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition ${color === c ? 'scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c, borderColor: color === c ? '#fff' : 'transparent' }}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg font-black text-sm tracking-wider uppercase transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)', color: '#000' }}
          >
            {saving ? 'Salvando…' : saved ? '✓ Salvo!' : 'Salvar Alterações'}
          </button>
        </form>

        <div className="border-t pt-4" style={{ borderColor: '#222' }}>
          <button onClick={logout} className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-400 transition">
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
