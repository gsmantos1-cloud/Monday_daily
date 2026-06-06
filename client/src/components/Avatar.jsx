import React from 'react';

const ROLE_LABELS = { owner: 'Dono', manager: 'Gerente', operational: 'Operacional' };

export function Avatar({ user, size = 'md', showRole = false, online = false }) {
  const sizes = { xs: 'w-6 h-6 text-xs', sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base', xl: 'w-14 h-14 text-lg' };
  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-shrink-0">
        <div
          className={`${sizes[size]} rounded-full flex items-center justify-center font-black text-black select-none`}
          style={{ backgroundColor: user?.avatar_color || '#D4AF37' }}
        >
          {initials}
        </div>
        {online !== undefined && (
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${online ? 'bg-success' : 'bg-gray-700'}`}
            style={{ borderColor: '#0d0d0d' }} />
        )}
      </div>
      {showRole && user && (
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-gray-100 truncate">{user.name}</span>
          <span className="text-xs text-gray-400">{ROLE_LABELS[user.role] || user.role}</span>
        </div>
      )}
    </div>
  );
}

export function RoleBadge({ role }) {
  const styles = {
    owner:       'border',
    manager:     'border',
    operational: 'border'
  };
  const colors = {
    owner:       { backgroundColor: '#2a200a', color: '#D4AF37', borderColor: '#D4AF3755' },
    manager:     { backgroundColor: '#1a1030', color: '#a78bfa', borderColor: '#a78bfa55' },
    operational: { backgroundColor: '#1a1a1a', color: '#888',     borderColor: '#333' }
  };
  return (
    <span className={`badge ${styles[role] || styles.operational} text-xs font-bold`} style={colors[role] || colors.operational}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}
