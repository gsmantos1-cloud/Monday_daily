import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

export function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotForm, setForgotForm] = useState({ email: '', name: '' });
  const [forgotResult, setForgotResult] = useState(null); // { temp_password } | { error }
  const [forgotLoading, setForgotLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const submitForgot = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotResult(null);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgotForm),
      });
      const data = await r.json();
      if (!r.ok) { setForgotResult({ error: data.error || 'Erro ao resetar' }); return; }
      setForgotResult(data);
    } catch (err) {
      setForgotResult({ error: err.message });
    } finally {
      setForgotLoading(false);
    }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#080808' }}>

      {/* Left — brand panel */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)' }}>

        {/* Gold border right edge */}
        <div className="absolute right-0 top-0 bottom-0 w-px" style={{ background: 'linear-gradient(to bottom, transparent, #D4AF37, transparent)' }} />

        {/* Subtle grid bg */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'linear-gradient(#D4AF37 1px, transparent 1px), linear-gradient(90deg, #D4AF37 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 flex flex-col items-center text-center px-12 max-w-md">
          {/* Logo */}
          <div className="w-40 h-40 mb-8 drop-shadow-2xl">
            <img src="/logo.png" alt="GS MANTOS" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-5xl font-black tracking-widest text-white mb-2">GS MANTOS</h1>
          <div className="w-24 h-0.5 mb-4" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />
          <p className="text-sm font-medium tracking-widest uppercase mb-12" style={{ color: '#D4AF37' }}>
            Sistema de Gestão
          </p>

          <div className="grid grid-cols-2 gap-4 w-full">
            {[
              { label: 'Tarefas em Tempo Real', icon: '⚡' },
              { label: 'Chat Interno',          icon: '💬' },
              { label: 'Hierarquia de Equipe',  icon: '👥' },
              { label: 'IA para Tarefas',       icon: '🤖' },
            ].map(f => (
              <div key={f.label}
                className="rounded-xl p-4 border text-left"
                style={{ backgroundColor: '#111', borderColor: '#2a2a2a' }}>
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="text-xs font-semibold text-gray-300">{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: '#0d0d0d' }}>
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <img src="/logo.png" alt="GS MANTOS" className="w-24 h-24 object-contain mb-3" />
            <h1 className="text-2xl font-black tracking-widest text-white">GS MANTOS</h1>
            <p className="text-xs tracking-widest uppercase mt-1" style={{ color: '#D4AF37' }}>Sistema de Gestão</p>
          </div>

          {/* Gold accent line */}
          <div className="w-12 h-1 rounded-full mb-6" style={{ background: 'linear-gradient(90deg, #D4AF37, #f0d060)' }} />

          <h2 className="text-2xl font-black text-white mb-1">
            {mode === 'login' ? 'Bem-vindo' : 'Criar Conta'}
          </h2>
          <p className="text-sm mb-8" style={{ color: '#888' }}>
            {mode === 'login' ? 'Acesse o sistema da equipe' : 'Junte-se ao time GS MANTOS'}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#888' }}>Nome completo</label>
                <input className="input" placeholder="Seu nome" value={form.name} onChange={set('name')} required />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#888' }}>Email</label>
              <input className="input" type="email" placeholder="seu@email.com" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#888' }}>Senha</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPass ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                  value={form.password}
                  onChange={set('password')}
                  required
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm text-red-400 border"
                style={{ backgroundColor: '#2a0a0a', borderColor: '#4a1a1a' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-black text-sm tracking-wider uppercase transition-all disabled:opacity-50"
              style={{ background: loading ? '#555' : 'linear-gradient(135deg, #D4AF37, #f0d060)', color: '#000' }}
            >
              {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar Conta'}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => { setShowForgot(true); setForgotForm({ email: form.email, name: '' }); setForgotResult(null); }}
                className="block w-full text-center text-xs font-medium transition hover:opacity-80 mt-2"
                style={{ color: '#888' }}
              >
                Esqueci minha senha
              </button>
            )}
          </form>

          {/* Forgot password modal */}
          {showForgot && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
              onClick={() => setShowForgot(false)}>
              <div className="w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
                style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
                onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-black text-white mb-1">Redefinir senha</h3>
                <p className="text-xs text-gray-500 mb-4">Informe seu email e nome cadastrado. Vamos gerar uma senha temporária.</p>
                {!forgotResult?.temp_password ? (
                  <form onSubmit={submitForgot} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#888' }}>Email</label>
                      <input className="input" type="email" placeholder="seu@email.com"
                        value={forgotForm.email}
                        onChange={e => setForgotForm(f => ({ ...f, email: e.target.value }))}
                        required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#888' }}>Seu nome cadastrado</label>
                      <input className="input" placeholder="Nome completo"
                        value={forgotForm.name}
                        onChange={e => setForgotForm(f => ({ ...f, name: e.target.value }))}
                        required />
                    </div>
                    {forgotResult?.error && (
                      <div className="rounded-lg px-3 py-2 text-xs text-red-400 border"
                        style={{ backgroundColor: '#2a0a0a', borderColor: '#4a1a1a' }}>
                        {forgotResult.error}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setShowForgot(false)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium transition"
                        style={{ backgroundColor: '#1f1f1f', color: '#aaa' }}>Cancelar</button>
                      <button type="submit" disabled={forgotLoading}
                        className="flex-1 py-2 rounded-lg font-black text-sm transition disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)', color: '#000' }}>
                        {forgotLoading ? 'Gerando…' : 'Gerar senha'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <div className="rounded-lg p-4 border mb-3" style={{ backgroundColor: '#0d2818', borderColor: '#1f5234' }}>
                      <p className="text-xs text-gray-400 mb-2">Sua nova senha temporária:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-lg font-mono font-black flex-1 px-3 py-2 rounded text-yellow-300"
                          style={{ backgroundColor: '#0a0a0a', letterSpacing: '0.1em' }}>
                          {forgotResult.temp_password}
                        </code>
                        <button onClick={() => navigator.clipboard.writeText(forgotResult.temp_password)}
                          className="text-xs px-3 py-2 rounded font-bold transition"
                          style={{ backgroundColor: '#D4AF37', color: '#000' }}>
                          Copiar
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">⚠️ Faça login agora e altere em seu perfil.</p>
                    </div>
                    <button onClick={() => { setShowForgot(false); setForm(f => ({ ...f, email: forgotForm.email, password: forgotResult.temp_password })); }}
                      className="w-full py-2 rounded-lg font-black text-sm transition"
                      style={{ background: 'linear-gradient(135deg, #D4AF37, #f0d060)', color: '#000' }}>
                      Preencher e fechar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ backgroundColor: '#222' }} />
            <span className="text-xs" style={{ color: '#555' }}>ou</span>
            <div className="flex-1 h-px" style={{ backgroundColor: '#222' }} />
          </div>

          <p className="text-center text-sm" style={{ color: '#555' }}>
            {mode === 'login' ? 'Não tem conta?' : 'Já tem uma conta?'}{' '}
            <button
              onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
              className="font-bold transition hover:opacity-80"
              style={{ color: '#D4AF37' }}
            >
              {mode === 'login' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>

          {mode === 'register' && (
            <p className="text-center text-xs mt-4" style={{ color: '#444' }}>
              O primeiro usuário registrado se tornará automaticamente o Dono.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
