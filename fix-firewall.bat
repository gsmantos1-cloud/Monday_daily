@echo off
echo Configurando regras de firewall para o Team Hub...
netsh advfirewall firewall delete rule name="Team Hub Vite" >nul 2>&1
netsh advfirewall firewall delete rule name="Team Hub API" >nul 2>&1
netsh advfirewall firewall add rule name="Team Hub Vite" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="Team Hub API" dir=in action=allow protocol=TCP localport=3001
echo.
echo Regras criadas com sucesso!
echo Outros computadores podem acessar: http://192.168.15.10:5173
echo.
pause
