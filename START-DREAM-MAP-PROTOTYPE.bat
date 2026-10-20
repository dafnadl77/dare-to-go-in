@echo off
rem Opens the DREAM MAP PROTOTYPE on this computer (double-click this file): the computer view and the phone view, in your browser.
rem   - synthetic data and one sample picture only: no AI, no database, no account, no credits, no payment; nothing is saved
rem   - close the small "DARE dream map" window to stop it
cd /d "%~dp0"
start "DARE dream map (close this window to stop)" /min cmd /c "npx vite --port 5180 --strictPort"
echo Starting... the browser opens in a few seconds.
timeout /t 6 /nobreak >nul
start "" "http://localhost:5180/dream-map-prototype.html"
start "" "http://localhost:5180/dream-map-phone.html"
