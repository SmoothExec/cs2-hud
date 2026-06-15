@echo off
title CS2 HUD
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Get it from https://nodejs.org  ^(LTS^), then run this again.
  echo.
  pause
  exit /b 1
)
echo Starting CS2 HUD...
node server.mjs
echo.
echo Server stopped. Press any key to close.
pause >nul
