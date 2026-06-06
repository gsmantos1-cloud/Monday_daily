@echo off
echo.
echo  ====================================
echo   Team Hub - Instalando dependencias
echo  ====================================
echo.

echo [1/2] Instalando backend...
cd /d "%~dp0server"
call npm install
if %errorlevel% neq 0 (
  echo ERRO ao instalar o backend!
  pause
  exit /b 1
)

echo.
echo [2/2] Instalando frontend...
cd /d "%~dp0client"
call npm install
if %errorlevel% neq 0 (
  echo ERRO ao instalar o frontend!
  pause
  exit /b 1
)

echo.
echo  ====================================
echo   Instalacao concluida com sucesso!
echo   Execute "iniciar.bat" para rodar.
echo  ====================================
echo.
pause
