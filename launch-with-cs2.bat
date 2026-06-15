@echo off
REM ============================================================
REM  CS2 HUD - Steam launch wrapper
REM  Starts the HUD server, launches CS2, and stops the server
REM  again when CS2 closes.
REM
REM  You do NOT double-click this. Instead, set it as your CS2
REM  launch options (run setup-autostart.bat to get the exact
REM  line), then just press Play on CS2 as normal.
REM ============================================================
cd /d "%~dp0"

REM Start the HUD server in a minimized window. If one is already
REM running, this second copy just exits (port already in use).
start "CS2HUDServer" /min cmd /c "node server.mjs"

REM Launch CS2 using Steam's original command (passed in as args)
REM and wait here until the game closes.
%*

REM CS2 has closed - shut the HUD server back down.
taskkill /fi "WINDOWTITLE eq CS2HUDServer" /t /f >nul 2>nul
