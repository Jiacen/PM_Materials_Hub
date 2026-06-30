@echo off
setlocal

cd /d "%~dp0"
set "APP_DIR=%cd%"
set "PORT=3001"
set "HOST=127.0.0.1"
set "URL=http://%HOST%:%PORT%/"

echo.
echo PM Material Hub - Local Launcher
echo App: %APP_DIR%
echo URL: %URL%
echo.

call :find_npm
if not defined NPM_CMD (
  echo Node.js / npm was not found.
  echo.
  echo Please install Node.js LTS, then run this launcher again.
  echo Download: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo package.json was not found.
  echo Please make sure this file is inside the pm-material-hub folder.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run: installing local dependencies. Keep the network connected...
  "%NPM_CMD%" install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check network, Node.js version, or npm logs.
    pause
    exit /b 1
  )
  echo.
)

echo Opening browser...
start "" "%URL%"
echo.
echo Starting app. Keep this window open while using PM Material Hub.
echo.
"%NPM_CMD%" run dev -- --hostname %HOST% --port %PORT%

echo.
echo App stopped.
pause
exit /b 0

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
