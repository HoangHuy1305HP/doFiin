@echo off
setlocal
cd /d "%~dp0"
call npm.cmd --prefix web run build
pause
