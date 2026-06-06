module.exports = {
  apps: [
    {
      name: 'team-hub-server',
      script: 'index.js',
      cwd: 'C:\\Users\\User\\team-hub\\server',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'production', PORT: 3001 }
    },
    {
      name: 'team-hub-vite',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host 0.0.0.0 --port 5173',
      cwd: 'C:\\Users\\User\\team-hub\\client',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'development' }
    }
  ]
};
