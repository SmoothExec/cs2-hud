@echo off
REM Prints the exact CS2 launch-options line to auto-start the HUD server.
echo.
echo  ============================================================
echo   AUTO-START THE CS2 HUD SERVER WITH CS2
echo  ============================================================
echo.
echo   1. In Steam, right-click Counter-Strike 2 ^> Properties.
echo   2. Under "Launch Options", paste exactly this line:
echo.
echo       "%~dp0launch-with-cs2.bat" %%command%%
echo.
echo   3. Close Properties. Now press Play on CS2 as usual -
echo      the HUD server starts automatically and stops when
echo      you quit the game.
echo.
echo  ============================================================
echo.
pause
