import React, { useState, useCallback, createContext, useContext, useRef } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

const ToastContext = createContext(null);

let _addToast = null;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timerRef = useRef({});

  const remove = useCallback((id) => {
    clearTimeout(timerRef.current[id]);
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  const add = useCallback((msg, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p.slice(-4), { id, msg, type }]);
    timerRef.current[id] = setTimeout(() => remove(id), duration);
    return id;
  }, [remove]);

  _addToast = add;

  const icons = {
    success: <CheckCircleIcon className="w-5 h-5 text-success flex-shrink-0" />,
    warning: <ExclamationTriangleIcon className="w-5 h-5 text-warning flex-shrink-0" />,
    error: <ExclamationTriangleIcon className="w-5 h-5 text-danger flex-shrink-0" />,
    info: <InformationCircleIcon className="w-5 h-5 text-primary flex-shrink-0" />,
  };

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl max-w-xs pointer-events-auto animate-slide-in border"
            style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}
          >
            {icons[t.type]}
            <p className="text-sm text-gray-200 flex-1 leading-snug">{t.msg}</p>
            <button onClick={() => remove(t.id)} className="text-gray-500 hover:text-gray-300 transition mt-0.5">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
export const toast = {
  success: (msg) => _addToast?.(msg, 'success'),
  warning: (msg) => _addToast?.(msg, 'warning'),
  error: (msg) => _addToast?.(msg, 'error'),
  info: (msg) => _addToast?.(msg, 'info'),
};
