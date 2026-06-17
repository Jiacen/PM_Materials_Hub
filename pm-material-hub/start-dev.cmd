@echo off
cd /d "%~dp0"
echo Starting PM Material Hub...
echo Project: %cd%
echo URL: http://127.0.0.1:3001/
echo.
"C:\Program Files\nodejs\npm.cmd" run dev -- --hostname 127.0.0.1 --port 3001
pause
