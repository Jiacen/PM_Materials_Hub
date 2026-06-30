@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"
set "PORT=3001"
set "HOST=127.0.0.1"
set "LOG_FILE=%cd%\dev-server.log"

call :find_npm
if not defined NPM_CMD (
  echo [%date% %time%] Node.js / npm not found. > "%LOG_FILE%"
  echo 未找到 Node.js / npm。请先安装 Node.js LTS。
  pause
  exit /b 1
)

echo [%date% %time%] Starting PM Material Hub > "%LOG_FILE%"
echo App: %cd% >> "%LOG_FILE%"
echo URL: http://%HOST%:%PORT%/ >> "%LOG_FILE%"

if not exist "node_modules" (
  echo [%date% %time%] Installing dependencies... >> "%LOG_FILE%"
  "%NPM_CMD%" install >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    echo 依赖安装失败，详情见 dev-server.log。
    pause
    exit /b 1
  )
)

start "" "http://%HOST%:%PORT%/"
"%NPM_CMD%" run dev -- --hostname %HOST% --port %PORT% >> "%LOG_FILE%" 2>&1
exit /b %errorlevel%

:find_npm
if exist "%~dp0..\runtime\node\npm.cmd" (
  set "NPM_CMD=%~dp0..\runtime\node\npm.cmd"
  exit /b 0
)
if exist "%~dp0runtime\node\npm.cmd" (
  set "NPM_CMD=%~dp0runtime\node\npm.cmd"
  exit /b 0
)
for %%I in (npm.cmd) do (
  if not "%%~$PATH:I"=="" (
    set "NPM_CMD=%%~$PATH:I"
    exit /b 0
  )
)
if exist "%ProgramFiles%\nodejs\npm.cmd" (
  set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
  exit /b 0
)
if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" (
  set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
  exit /b 0
)
exit /b 0
