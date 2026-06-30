@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

if not exist "pm-material-hub\start-dev.cmd" (
  echo Missing pm-material-hub\start-dev.cmd.
  echo Please make sure the release package was fully extracted.
  echo.
  pause
  exit /b 1
)

call "pm-material-hub\start-dev.cmd"
