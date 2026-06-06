@echo off
echo ============================================
echo   Configurando IP fixo - GS Mantos
echo ============================================
echo.
echo IP fixo sera: 192.168.15.89
echo.
netsh interface ip set address "Wi-Fi" static 192.168.15.89 255.255.255.0 192.168.15.1
netsh interface ip set dns "Wi-Fi" static 8.8.8.8
netsh interface ip add dns "Wi-Fi" 8.8.4.4 index=2
echo.
netsh advfirewall firewall delete rule name="GS Operacional App" >nul 2>&1
netsh advfirewall firewall add rule name="GS Operacional App" dir=in action=allow protocol=TCP localport=5000
echo.
echo ============================================
echo   Pronto! Link fixo: http://192.168.15.89:5000
echo ============================================
echo.
pause
