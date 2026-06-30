@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"
set "APP_DIR=%cd%"
set "PORT=3001"
set "HOST=127.0.0.1"
set "URL=http://%HOST%:%PORT%/"

echo.
echo PM Material Hub - 本地绿色启动
echo App: %APP_DIR%
echo URL: %URL%
echo.

call :find_npm
if not defined NPM_CMD (
  echo 未找到 Node.js / npm。
  echo.
  echo 请先安装 Node.js LTS，然后重新双击本文件。
  echo 下载地址: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo 当前目录缺少 package.json，无法启动应用。
  echo 请确认本文件位于 pm-material-hub 目录内。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 首次运行：正在安装本地依赖，请保持网络连接...
  "%NPM_CMD%" install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败。请检查网络、Node.js 版本或 npm 日志。
    pause
    exit /b 1
  )
  echo.
)

echo 正在打开浏览器...
start "" "%URL%"
echo.
echo 应用启动中。请保持此窗口打开；关闭窗口会停止应用。
echo.
"%NPM_CMD%" run dev -- --hostname %HOST% --port %PORT%

echo.
echo 应用已停止。
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
