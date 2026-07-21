import React, { useState, useEffect } from 'react';
import { useApi } from '../contexts/ApiContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { PlusIcon, TrashIcon, PencilIcon, LightBulbIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CATEGORIES = [
  { value: 'geral', label: 'Geral', color: '#6b7280' },
  { value: 'stories', label: 'Stories', color: '#D4AF37' },
  { value: 'campanha', label: 'Campanha', color: '#0073ea' },
  { value: 'produto', label: 'Produto', color: '#00c875' },
  { value: 'engajamento', label: 'Engajamento', color: '#784bd1' },
];

const emptyForm = { title: '', description: '', tags: '', category: 'stories' };

export function Ideas() {
  const api = useApi();
  const { user } = useAuth();

  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/ideas').then(setIdeas).finally(() => setLoading(false));
  }, []);

  const openAdd = () => { setEditingIdea(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (idea) => {
    setEditingIdea(idea);
    setForm({ title: idea.title, description: idea.description || '', tags: (idea.tags || []).join(', '), category: idea.category || 'geral' });
    setShowModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [] };
      if (editingIdea) {
        const updated = await api.put(`/api/ideas/${editingIdea.id}`, payload);
        setIdeas(p => p.map(i => i.id === updated.id ? updated : i));
      } else {
        const created = await api.post('/api/ideas', payload);
        setIdeas(p => [created, ...p]);
      }
      setShowModal(false);
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Remover esta ideia?')) return;
    await api.del(`/api/ideas/${id}`);
    setIdeas(p => p.filter(i => i.id !== id));
  };

  const filtered = ideas.filter(i => {
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) && !(i.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter && i.category !== catFilter) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <LightBulbIcon className="w-6 h-6" style={{ color: '#D4AF37' }} />
            Banco de Ideias
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Salve ideias de conteúdo para usar quando precisar</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
          <PlusIcon className="w-4 h-4" /> Nova Ideia
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-primary w-44"
            placeholder="Buscar ideias..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setCatFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${!catFilter ? 'text-black font-bold' : 'text-gray-400 hover:text-gray-200 bg-gray-900'}`}
            style={!catFilter ? { background: 'linear-gradient(135deg, #D4AF37, #f0d060)' } : {}}
          >
            Todas
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCatFilter(c.value === catFilter ? '' : c.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${catFilter === c.value ? 'text-white' : 'text-gray-400 hover:text-gray-200 bg-gray-900'}`}
              style={catFilter === c.value ? { backgroundColor: c.color } : {}}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-600 ml-auto">{filtered.length} ideia{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Ideas grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#D4AF37' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <LightBulbIcon className="w-14 h-14 mx-auto mb-3 text-gray-700" />
          <p className="font-medium">Nenhuma ideia ainda.</p>
          <p className="text-sm mt-1">Clique em "Nova Ideia" para começar.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(idea => {
            const cat = CATEGORIES.find(c => c.value === idea.category) || CATEGORIES[0];
            return (
              <div key={idea.id} className="card p-4 flex flex-col gap-3 group hover:border-gray-600 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: cat.color + '22', color: cat.color }}>
                      {cat.label}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-200 mt-2 leading-snug">{idea.title}</h3>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                    <button onClick={() => openEdit(idea)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-200 transition">
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(idea.id)} className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-danger transition">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {idea.description && (
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{idea.description}</p>
                )}
                {idea.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {idea.tags.map(tag => (
                      <span key={tag} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">#{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-2 border-t flex items-center justify-between" style={{ borderColor: '#1a1a1a' }}>
                  <span className="text-[10px] text-gray-600">
                    {format(new Date(idea.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingIdea ? 'Editar Ideia' : 'Nova Ideia'} size="md">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Título *</label>
            <input
              className="input"
              placeholder="Qual a ideia?"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Descrição</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Descreva a ideia com detalhes..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Categoria</label>
              <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tags (separadas por vírgula)</label>
              <input
                className="input"
                placeholder="ex: copa, reels, promoção"
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando...' : editingIdea ? 'Salvar' : 'Criar Ideia'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
