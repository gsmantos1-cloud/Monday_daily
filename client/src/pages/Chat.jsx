import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useApi } from '../contexts/ApiContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { PlusIcon, HashtagIcon, PaperAirplaneIcon, TrashIcon, ChatBubbleOvalLeftEllipsisIcon, FaceSmileIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

const EMOJI_CATEGORIES = [
  { label: '😀', emojis: ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','🥳','🤩','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤭','🤫','🤔','😐','😑','😶','🙄','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','😈','💀','💩','🤡','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'] },
  { label: '👍', emojis: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','🤜','🤛','👏','🙌','👐','🤲','🙏','✍️','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👅','💋','🫦'] },
  { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','❤️‍🩹','💔','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'] },
  { label: '🎉', emojis: ['🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🎖️','🏆','🥇','🥈','🥉','🏅','🎯','🎮','🕹️','🎲','🧩','🎭','🎨','🖼️','🎪','🎠','🎡','🎢','💫','⭐','🌟','✨','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌊','💧','💦','🔥'] },
  { label: '🍕', emojis: ['🍕','🍔','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍟','🧀','🥪','🥨','🥐','🥖','🍞','🥜','🫘','🌰','🍫','🍬','🍭','🍮','🍯','🍰','🎂','🧁','🍩','🍪','🍦','🍧','🍨','🫧','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹'] },
  { label: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦗','🪳','🕷️','🦂','🐢','🐍','🦎','🐊','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐟','🐠','🐬','🐳','🐋','🦈','🐊','🐅','🐆'] },
];

function EmojiPicker({ onSelect, onClose }) {
  const [cat, setCat] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 overflow-hidden">
      {/* Category tabs */}
      <div className="flex border-b border-gray-800">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={i}
            onClick={() => setCat(i)}
            className={`flex-1 py-2 text-base hover:bg-gray-800 transition ${cat === i ? 'bg-gray-800' : ''}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {/* Emoji grid */}
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-52 overflow-y-auto">
        {EMOJI_CATEGORIES[cat].emojis.map((e, i) => (
          <button
            key={i}
            onClick={() => { onSelect(e); }}
            className="text-xl p-1 rounded hover:bg-gray-700 transition hover:scale-125"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// @mention autocomplete input
function MentionInput({ value, onChange, onKeyDown, users, placeholder }) {
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const ref = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1 && !val.slice(lastAt + 1).includes(' ')) {
      setShowMentions(true);
      setMentionSearch(val.slice(lastAt + 1));
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name) => {
    const lastAt = value.lastIndexOf('@');
    const newVal = value.slice(0, lastAt) + '@' + name.split(' ')[0] + ' ';
    onChange(newVal);
    setShowMentions(false);
    ref.current?.focus();
  };

  const filtered = users.filter(u => u.name.toLowerCase().includes(mentionSearch.toLowerCase()));

  return (
    <div className="relative flex-1">
      <input
        ref={ref}
        className="input w-full"
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

export function Chat() {
  const { user } = useAuth();
  const api = useApi();
  const { on, emit, onlineUsers, connected } = useSocket();
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState('geral');
  const [activeDmWith, setActiveDmWith] = useState(null); // { id, name, avatar_color } for DMs
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', description: '' });
  const [users, setUsers] = useState([]);
  const [chatMentionAlerts, setChatMentionAlerts] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const bottomRef = useRef(null);
  const canManage = ['owner', 'manager'].includes(user?.role);

  useEffect(() => {
    Promise.all([api.get('/api/channels'), api.get('/api/users')]).then(([c, u]) => {
      setChannels(c);
      setUsers(u);
    });
  }, []);

  useEffect(() => {
    api.get(`/api/messages/${activeChannel}`).then(setMessages);
  }, [activeChannel]);

  // Polling de mensagens quando não há WebSocket (modo serverless/nuvem)
  useEffect(() => {
    if (connected) return; // socket cuida do tempo real
    const interval = setInterval(() => {
      api.get(`/api/messages/${activeChannel}`).then(setMessages).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [connected, activeChannel]);

  // Recarrega canais periodicamente em modo polling (para ver novos canais/DMs)
  useEffect(() => {
    if (connected) return;
    const interval = setInterval(() => {
      api.get('/api/channels').then(setChannels).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [connected]);

  useEffect(() => {
    const handler = (msg) => {
      if (msg.channel === activeChannel) setMessages(p => [...p, msg]);
    };
    const off = on(`message:${activeChannel}`, handler);
    const offCreate = on('channel:created', c => setChannels(p => [...p, c]));
    const offDelete = on('channel:deleted', ({ id }) => {
      setChannels(p => p.filter(c => c.id !== id));
    });
    return () => { off?.(); offCreate?.(); offDelete?.(); };
  }, [on, activeChannel]);

  // Listen for chat @mention notifications
  useEffect(() => {
    if (!user?.id || !on) return;
    const off = on(`chat:mention:${user.id}`, (data) => {
      const alert = {
        id: `chatmention_${Date.now()}`,
        from: data.from,
        from_id: data.from_id,
        content: data.content,
        channel: data.channel,
        dm_channel: data.dm_channel,
        avatar_color: data.avatar_color,
      };
      setChatMentionAlerts(prev => [...prev, alert]);
      setTimeout(() => {
        setChatMentionAlerts(prev => prev.filter(a => a.id !== alert.id));
      }, 10000);
    });
    return () => off?.();
  }, [user?.id, on]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openDM = async (targetUser) => {
    const ch = await api.get(`/api/dm/${targetUser.id}`);
    setActiveDmWith(targetUser);
    setActiveChannel(ch.name);
    if (!channels.find(c => c.name === ch.name)) {
      setChannels(p => [...p, ch]);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input.trim();
    setInput('');
    try {
      const msg = await api.post(`/api/messages/${activeChannel}`, { content });
      // Se houver WebSocket, o echo do socket adiciona a mensagem.
      // Sem WebSocket (serverless), adiciona localmente na hora.
      if (!connected && msg) setMessages(p => [...p, msg]);
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      setInput(content); // restaura para o usuário tentar de novo
    }
  };

  const createChannel = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/channels', newChannel);
      setShowCreate(false);
      setNewChannel({ name: '', description: '' });
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteChannel = async (channel) => {
    if (!confirm(`Remover o canal #${channel.name}?`)) return;
    try {
      await api.del(`/api/channels/${channel.id}`);
      if (activeChannel === channel.name) setActiveChannel('geral');
    } catch (err) {
      alert(err.message);
    }
  };

  const grouped = messages.reduce((acc, msg) => {
    const date = msg.created_at.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {});

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return 'Hoje';
    if (dateStr === yesterday) return 'Ontem';
    return format(d, 'dd/MM/yyyy');
  };

  const publicChannels = channels.filter(c => !c.name.startsWith('dm_'));
  const activeChannelObj = channels.find(c => c.name === activeChannel);
  const isDM = activeChannel.startsWith('dm_');

  return (
    <div className="flex h-full">
      {/* Channel sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Canais</span>
          {canManage && (
            <button onClick={() => setShowCreate(true)} className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-gray-200 transition">
              <PlusIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {publicChannels.map(channel => (
            <div
              key={channel.id}
              className={`group flex items-center justify-between px-4 py-2 cursor-pointer transition ${activeChannel === channel.name ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
              onClick={() => { setActiveChannel(channel.name); setActiveDmWith(null); }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <HashtagIcon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm truncate">{channel.name}</span>
              </div>
              {canManage && !['geral', 'avisos'].includes(channel.name) && (
                <button
                  onClick={e => { e.stopPropagation(); deleteChannel(channel); }}
                  className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-danger transition"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          {/* Direct Messages section */}
          <div className="mt-4 px-4 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mensagens Diretas</span>
          </div>
          {users.filter(u => u.id !== user.id).map(u => {
            const dmName = `dm_${Math.min(user.id, u.id)}_${Math.max(user.id, u.id)}`;
            const isActive = activeChannel === dmName;
            const isOnline = onlineUsers.includes(u.id);
            return (
              <div
                key={u.id}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer transition ${isActive ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                onClick={() => openDM(u)}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-black" style={{ backgroundColor: u.avatar_color || '#D4AF37' }}>
                    {u.name[0].toUpperCase()}
                  </div>
                  {isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-success rounded-full border border-gray-950" />}
                </div>
                <span className="text-sm truncate">{u.name.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>

        {/* Online count */}
        <div className="border-t border-gray-800 p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Online — {onlineUsers.length}</p>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel/DM header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
          {isDM && activeDmWith ? (
            <>
              <div className="relative">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-black" style={{ backgroundColor: activeDmWith.avatar_color || '#D4AF37' }}>
                  {activeDmWith.name[0].toUpperCase()}
                </div>
                {onlineUsers.includes(activeDmWith.id) && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border border-gray-900" />
                )}
              </div>
              <div>
                <h2 className="font-semibold text-gray-100">{activeDmWith.name}</h2>
                <p className="text-xs text-gray-500">Mensagem direta</p>
              </div>
            </>
          ) : (
            <>
              <HashtagIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <h2 className="font-semibold text-gray-100">{activeChannel}</h2>
                {activeChannelObj?.description && (
                  <p className="text-xs text-gray-500">{activeChannelObj.description}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {Object.entries(grouped).map(([date, msgs]) => (
            <div key={date}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-500 bg-gray-950 px-2">{formatDate(date)}</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <div className="space-y-3">
                {msgs.map((msg, i) => {
                  const isOwn = msg.user_id === user.id;
                  const sender = users.find(u => u.id === msg.user_id) || { name: msg.user_name, avatar_color: msg.avatar_color };
                  const showAvatar = i === 0 || msgs[i - 1]?.user_id !== msg.user_id;
                  // Highlight @mentions of current user
                  const content = msg.content || '';
                  const userName = user.name.split(' ')[0];
                  const isMentioned = content.toLowerCase().includes(`@${userName.toLowerCase()}`);
                  return (
                    <div key={msg.id} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : ''} ${isMentioned && !isOwn ? 'bg-yellow-500/5 rounded-lg -mx-2 px-2 py-1' : ''}`}>
                      <div className={`w-8 flex-shrink-0 ${showAvatar ? '' : 'invisible'}`}>
                        <Avatar user={sender} size="sm" />
                      </div>
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        {showAvatar && (
                          <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                            <span className="text-xs font-semibold text-gray-300">{msg.user_name || sender.name}</span>
                            <span className="text-xs text-gray-600">{format(new Date(msg.created_at), 'HH:mm')}</span>
                          </div>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isOwn ? 'bg-primary text-white rounded-br-sm' : 'bg-gray-800 text-gray-200 rounded-bl-sm'} ${isMentioned && !isOwn ? 'ring-1 ring-yellow-500/30' : ''}`}>
                          {content}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-20 text-gray-600">
              {isDM ? <ChatBubbleOvalLeftEllipsisIcon className="w-12 h-12 mb-3" /> : <HashtagIcon className="w-12 h-12 mb-3" />}
              <p className="text-sm">Nenhuma mensagem ainda.</p>
              <p className="text-xs mt-1">Seja o primeiro a falar!</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="flex items-center gap-3 px-6 py-4 border-t border-gray-800">
          <Avatar user={user} size="sm" />
          <MentionInput
            value={input}
            onChange={setInput}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
            users={users.filter(u => u.id !== user.id)}
            placeholder={isDM && activeDmWith ? `Mensagem para ${activeDmWith.name}…` : `Mensagem em #${activeChannel}…`}
          />
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(p => !p)}
              className="p-2.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition"
              title="Emojis"
            >
              <FaceSmileIcon className="w-5 h-5" />
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={emoji => { setInput(p => p + emoji); setShowEmojiPicker(false); }}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>
          <button type="submit" disabled={!input.trim()} className="btn-primary p-2.5 disabled:opacity-40">
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* DM mention notification overlay */}
      {chatMentionAlerts.length > 0 && (
        <div className="fixed bottom-24 right-4 z-50 space-y-2 max-w-sm">
          {chatMentionAlerts.map(alert => (
            <div
              key={alert.id}
              className="flex items-start gap-3 bg-blue-950 border border-blue-500/50 rounded-xl p-4 shadow-2xl animate-slide-in cursor-pointer hover:bg-blue-900/60 transition"
              onClick={() => {
                setActiveChannel(alert.channel);
                setActiveDmWith(null);
                setChatMentionAlerts(prev => prev.filter(a => a.id !== alert.id));
              }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-black flex-shrink-0" style={{ backgroundColor: alert.avatar_color || '#D4AF37' }}>
                {alert.from?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-blue-300">💬 {alert.from} mencionou você!</p>
                <p className="text-xs text-blue-400 mt-0.5 truncate">"{alert.content}"</p>
                <p className="text-xs text-blue-500 mt-0.5 font-semibold">#{alert.channel} — clique para ver</p>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    const fromUser = users.find(u => u.id === alert.from_id);
                    if (fromUser) openDM(fromUser);
                    setChatMentionAlerts(prev => prev.filter(a => a.id !== alert.id));
                  }}
                  className="mt-2 text-xs font-bold text-blue-300 hover:text-white bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded-lg transition"
                >
                  Responder em DM →
                </button>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setChatMentionAlerts(prev => prev.filter(a => a.id !== alert.id)); }}
                className="text-blue-600 hover:text-blue-400 flex-shrink-0"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo Canal">
        <form onSubmit={createChannel} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Nome do canal *</label>
            <input
              className="input"
              placeholder="Ex: projetos, suporte, financeiro…"
              value={newChannel.name}
              onChange={e => setNewChannel(f => ({ ...f, name: e.target.value.toLowerCase().replace(/\s/g, '-') }))}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Letras minúsculas e hífens apenas</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Descrição</label>
            <input className="input" placeholder="Propósito do canal" value={newChannel.description} onChange={e => setNewChannel(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Criar Canal</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
