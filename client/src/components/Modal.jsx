import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }} />
      <div
        className={`relative w-full ${widths[size]} rounded-2xl shadow-2xl border`}
        style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Gold top accent */}
        <div className="h-0.5 rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #D4AF37, #f0d060, #D4AF37)' }} />
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1f1f1f' }}>
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-200 transition">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
