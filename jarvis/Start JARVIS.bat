@echo off
REM JARVIS — double-click to launch on Windows.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 jarvis.py %*
) else (
  python jarvis.py %*
)
if %errorlevel% neq 0 (
  echo.
  echo JARVIS could not start. Make sure Python 3 is installed ^(python.org^).
  pause
)
