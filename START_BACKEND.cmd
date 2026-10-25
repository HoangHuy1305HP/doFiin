@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Missing Python environment. Read docs\LOCAL_WINDOWS.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" scripts\local_runtime.py start
if errorlevel 1 pause
