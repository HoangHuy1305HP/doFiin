@echo off
setlocal
cd /d "%~dp0"
python scripts\setup_windows.py
if errorlevel 1 (
  echo Setup did not finish. Check the error above.
  pause
  exit /b 1
)
echo.
echo Ready. Double-click START_DEMO.cmd.
pause
