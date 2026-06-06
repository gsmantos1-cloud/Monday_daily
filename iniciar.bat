@echo off
title GS MANTOS - Sistema de Gestao
color 0A

echo ==========================================
echo    GS MANTOS - Iniciando servidores...
echo ==========================================
echo.

:: Para processos antigos
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%a >/dev/null 2>&1

:: Backend com pm2
echo [1/2] Iniciando backend...
cd /d C:\Users\User\team-hub\server
pm2 delete team-hub-server >/dev/null 2>&1
pm2 start index.js --name team-hub-server

:: Aguarda backend subir
timeout /t 4 /nobreak >/dev/null

:: Frontend em nova janela
echo [2/2] Iniciando frontend...
start "GS MANTOS - Frontend" cmd /k "cd /d C:\Users\User\team-hub\client && npx vite --port 5173 --host 0.0.0.0"

timeout /t 6 /nobreak >/dev/null

:: Abre navegador
echo.
echo  Sistema no ar em http://localhost:5173
echo  Backend rodando com reinicio automatico (pm2)
echo.
start "" "http://localhost:5173"
pause
