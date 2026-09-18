@echo off
REM Double-click to start Jarvis movie HUD (no Python/TTS install needed).
REM Opens http://localhost:8787 - close this window to stop the server.

set "JARVIS=%~dp0"
cd /d "%JARVIS%"

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo npm was not found. Install Node.js from https://nodejs.org then try again.
  echo.
  pause
  exit /b 1
)

if not exist "%JARVIS%node_modules\" (
  echo Installing dependencies first - this can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" "http://localhost:8787"
echo Starting Jarvis HUD at http://localhost:8787
echo Brain (xAI + Cursor) at http://127.0.0.1:8790 — keys from .env, never the HUD
echo Keep this window open while using Jarvis. Close it to stop.
echo.
call npm run jarvis
pause
