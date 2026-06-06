@echo off
echo Configurando IP fixo para o Team Hub...
netsh interface ip set address "Wi-Fi" static 192.168.15.10 255.255.255.0 192.168.15.1
netsh interface ip set dns "Wi-Fi" static 8.8.8.8
netsh interface ip add dns "Wi-Fi" 8.8.4.4 index=2
echo.
echo IP fixo configurado: 192.168.15.10
echo Link do sistema: http://192.168.15.10:5173
echo.
pause
