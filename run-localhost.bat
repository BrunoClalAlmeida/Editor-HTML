@echo off
setlocal EnableExtensions

rem Vai para a pasta onde o .bat está
cd /d "%~dp0"

rem Porta padrão (altere se quiser)
set "PORT=5500"

rem (opcional) abrir navegador
start "" "http://localhost:%PORT%/"

rem Se "serve" já estiver instalado globalmente, usa ele; senão usa npx
where serve >nul 2>nul
if %errorlevel%==0 (
  serve . -l %PORT%
) else (
  npx --yes serve . -l %PORT%
)

endlocal
