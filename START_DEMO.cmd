@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run SETUP_WINDOWS.cmd first.
  pause
  exit /b 1
)
if not exist "web\dist\index.html" (
  echo Building web interface...
  call npm.cmd --prefix web run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo.
echo Open http://localhost:8000 in your browser.
echo Keep this window open. Press Ctrl+C to stop.
echo.
".venv\Scripts\python.exe" scripts\local_runtime.py start
if errorlevel 1 pause
