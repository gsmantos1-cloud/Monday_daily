import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import { useApi } from './ApiContext.jsx';

const AlertContext = createContext({ alerts: [], dismissAlert: () => {} });

function playAlertSound(type = 'urgent') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === 'warning') {
      // Single gentle beep at lower frequency for 2h warning
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.7);
    } else {
      // Triple urgent beep
      [0, 0.35, 0.7].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.5);
      });
    }
  } catch {}
}

function isWorkHours() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun 6=Sat
  const h = now.getHours();
  const m = now.getMinutes();
  const mins = h * 60 + m;
  return day >= 1 && day <= 5 && mins >= 9 * 60 && mins < 18 * 60;
}

export function AlertProvider({ children }) {
  const { user, token } = useAuth();
  const api = useApi();
  const [alerts, setAlerts] = useState([]);
  const alertedRef = useRef(new Set()); // track which task IDs have been alerted this session
  const alertedTwoHourRef = useRef(new Set()); // track which tasks have gotten the 2h warning

  const dismissAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const checkAlerts = useCallback(async () => {
    if (!user || !token) return;
    if (!isWorkHours()) return;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const h = now.getHours();
    const day = now.getDay();
    const isTwoHourWindow = day >= 1 && day <= 5 && h >= 16 && h < 17;

    try {
      const tasks = await api.get(`/api/tasks?assignee_id=${user.id}`);

      // Standard urgent alert (tasks due today, not done, not yet alerted)
      const urgent = tasks.filter(t =>
        t.deadline === today &&
        t.status !== 'done' &&
        !alertedRef.current.has(t.id)
      );
      if (urgent.length > 0) {
        playAlertSound('urgent');
        urgent.forEach(t => alertedRef.current.add(t.id));
        setAlerts(prev => {
          const newAlerts = urgent.map(t => ({
            id: t.id,
            title: t.title,
            board: t.board_name,
            type: 'urgent',
            message: 'Tarefa crítica vence hoje!',
          }));
          const existingIds = new Set(prev.map(a => a.id));
          return [...prev, ...newAlerts.filter(a => !existingIds.has(a.id))];
        });
      }

      // 2-hour warning (between 16:00–17:00 on weekdays)
      if (isTwoHourWindow) {
        const twoHourWarning = tasks.filter(t =>
          t.deadline === today &&
          t.status !== 'done' &&
          !alertedTwoHourRef.current.has(t.id)
        );
        if (twoHourWarning.length > 0) {
          playAlertSound('warning');
          twoHourWarning.forEach(t => alertedTwoHourRef.current.add(t.id));
          setAlerts(prev => {
            const newAlerts = twoHourWarning.map(t => ({
              id: `2h_${t.id}`,
              title: t.title,
              board: t.board_name,
              type: 'warning',
              message: '⏰ 2 horas restantes hoje!',
            }));
            const existingIds = new Set(prev.map(a => a.id));
            return [...prev, ...newAlerts.filter(a => !existingIds.has(a.id))];
          });
        }
      }
    } catch {}
  }, [user, token, api]);

  useEffect(() => {
    if (!user) return;
    checkAlerts(); // check immediately on login
    const interval = setInterval(checkAlerts, 60000); // check every minute
    return () => clearInterval(interval);
  }, [user, checkAlerts]);

  return (
    <AlertContext.Provider value={{ alerts, dismissAlert }}>
      {children}
    </AlertContext.Provider>
  );
}

export const useAlerts = () => useContext(AlertContext);
