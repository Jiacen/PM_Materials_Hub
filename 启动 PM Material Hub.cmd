@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

if not exist "pm-material-hub\start-dev.cmd" (
  echo 未找到 pm-material-hub\start-dev.cmd。
  echo 请确认 release 包已完整解压。
  echo.
  pause
  exit /b 1
)

call "pm-material-hub\start-dev.cmd"
