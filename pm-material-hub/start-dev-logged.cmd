@echo off
cd /d "%~dp0"
echo [%date% %time%] Starting PM Material Hub > dev-server.log
echo Project: %cd% >> dev-server.log
"C:\Program Files\nodejs\npm.cmd" run dev -- --hostname 127.0.0.1 --port 3001 >> dev-server.log 2>&1
