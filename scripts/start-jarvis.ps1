# Start Jarvis movie HUD (browser SpeechSynthesis — no edge-tts/pip).
# Usage: right-click Run with PowerShell, or call from Start-Jarvis.bat / Desktop shortcut.

$ErrorActionPreference = "Stop"
# This script lives in repo/scripts — go up one folder to Jarvis root.
$Jarvis = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Jarvis

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm not found. Install Node.js from https://nodejs.org then try again."
  Read-Host "Press Enter to close"
  exit 1
}

if (-not (Test-Path (Join-Path $Jarvis "node_modules"))) {
  Write-Host "Installing dependencies first — this can take a few minutes..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed."
    Read-Host "Press Enter to close"
    exit 1
  }
}

Start-Process "http://localhost:8787"
Write-Host "Starting Jarvis HUD at http://localhost:8787"
Write-Host "Keep this window open while using Jarvis. Close it (Ctrl+C) to stop."
npm run jarvis
