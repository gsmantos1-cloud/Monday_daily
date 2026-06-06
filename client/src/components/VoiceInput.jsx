import React, { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from '@heroicons/react/24/solid';

// Reusable mic button that appends recognized speech to a text field.
// Uses the browser Web Speech API (Chrome/Edge/Safari).
//
// Requires SECURE CONTEXT: works only on https:// or http://localhost.
// On http://<network-ip>:port it is silently blocked — we detect and warn.
//
// Props:
//   - onTranscript(text): final phrases (appended)
//   - onInterim(text): optional, partial text while user is speaking
//   - lang: BCP-47 (default 'pt-BR')
//   - size: 'sm' | 'md'
//   - title: tooltip
export function VoiceInput({ onTranscript, onInterim, lang = 'pt-BR', size = 'sm', title = 'Falar' }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef(null);
  const wasManuallyStopped = useRef(false);

  const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const isSecure = typeof window !== 'undefined' && (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  useEffect(() => () => {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
  }, []);

  const showError = (msg, ms = 5000) => {
    setError(msg);
    console.warn('[VoiceInput]', msg);
    setTimeout(() => setError(''), ms);
  };

  const start = () => {
    if (!SpeechRecognition) {
      showError('Seu navegador não suporta voz. Use Chrome, Edge ou Safari.');
      return;
    }
    if (!isSecure) {
      showError(`Voz só funciona em https:// ou localhost. Você está em ${location.protocol}//${location.host}. Acesse via http://localhost:5173`, 8000);
      return;
    }
    setError('');
    setInterim('');
    wasManuallyStopped.current = false;

    const r = new SpeechRecognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => { console.log('[VoiceInput] started, lang=', lang); setListening(true); };

    r.onresult = (event) => {
      let final = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) final += res[0].transcript + ' ';
        else interimText += res[0].transcript;
      }
      if (final.trim()) {
        console.log('[VoiceInput] final:', final);
        onTranscript(final.trim());
        setInterim('');
      } else if (interimText) {
        setInterim(interimText);
        onInterim?.(interimText);
      }
    };

    r.onerror = (e) => {
      console.error('[VoiceInput] error:', e.error, e);
      // Hard errors — stop the auto-restart loop
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'network') {
        wasManuallyStopped.current = true;
      }
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        showError('🚫 Microfone bloqueado pelo navegador. Veja instruções abaixo do botão.', 8000);
      } else if (e.error === 'no-speech') {
        // silent — auto-restart is fine
      } else if (e.error === 'audio-capture') {
        showError('🎤 Nenhum microfone detectado no seu computador.', 6000);
      } else if (e.error === 'network') {
        showError('🌐 Reconhecimento precisa de internet (Google).', 6000);
      } else {
        showError('Erro: ' + e.error, 5000);
      }
    };

    r.onend = () => {
      console.log('[VoiceInput] ended, manual=', wasManuallyStopped.current);
      // Restart automatically if user didn't manually stop (browser stops after pause)
      if (!wasManuallyStopped.current && recognitionRef.current === r) {
        try { r.start(); return; } catch {}
      }
      setListening(false);
      setInterim('');
    };

    try {
      r.start();
      recognitionRef.current = r;
    } catch (err) {
      console.error('[VoiceInput] start failed:', err);
      showError('Não foi possível iniciar: ' + err.message);
    }
  };

  const stop = () => {
    wasManuallyStopped.current = true;
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setListening(false);
    setInterim('');
  };

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (listening) stop(); else start();
  };

  if (!SpeechRecognition) return null;

  const sizes = {
    sm: { btn: 'w-7 h-7', icon: 'w-3.5 h-3.5' },
    md: { btn: 'w-9 h-9', icon: 'w-4 h-4' },
  };
  const s = sizes[size] || sizes.sm;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        title={listening ? 'Parar gravação' : (isSecure ? title : 'Voz indisponível neste contexto')}
        className={`flex items-center justify-center rounded-full transition flex-shrink-0 ${s.btn} ${listening
          ? 'bg-red-500 text-white animate-pulse hover:bg-red-600 ring-2 ring-red-300'
          : !isSecure
            ? 'bg-gray-800 text-gray-600 hover:bg-gray-700 border border-gray-700 cursor-help'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-yellow-400 border border-gray-700'}`}
      >
        <MicrophoneIcon className={s.icon} />
      </button>

      {/* Listening indicator with live partial text */}
      {listening && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap z-[100] shadow-2xl"
          style={{ backgroundColor: '#dc2626', color: '#fff', maxWidth: 280, whiteSpace: 'normal' }}>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>{interim || '🎤 Ouvindo… fale agora'}</span>
          </div>
        </div>
      )}

      {/* Error tooltip */}
      {error && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 rounded-lg text-[11px] font-medium z-[100] shadow-2xl"
          style={{ backgroundColor: '#7f1d1d', color: '#fecaca', border: '1px solid #991b1b', maxWidth: 320, whiteSpace: 'normal' }}>
          {error}
        </div>
      )}
    </div>
  );
}
