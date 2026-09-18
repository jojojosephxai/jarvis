@echo off
REM Double-click to start Jarvis movie HUD + live brain bridge.
REM Opens http://localhost:8787 - close this window to stop.

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

if not exist "%JARVIS%.env" (
  echo.
  echo No .env yet. Copying .env.example — add CURSOR_API_KEY or XAI_API_KEY for live answers.
  copy /Y "%JARVIS%.env.example" "%JARVIS%.env" >nul
)

start "" "http://localhost:8787"
echo Starting Jarvis HUD + brain bridge at http://localhost:8787
echo Keep this window open while using Jarvis. Close it to stop.
echo.
call npm run jarvis:all
pause
