@echo off
rem Opens the CONVERSATION page on this computer (double-click this file): the three approved conversations on the dream map.
rem   - a stub model that answers from the script: no AI, no database, no account, no credits, no payment; nothing is saved
rem   - close the small "DARE conversation" window to stop it
cd /d "%~dp0"
start "DARE conversation (close this window to stop)" /min cmd /c "npx vite --port 5182 --strictPort"
echo Starting... the browser opens in a few seconds.
timeout /t 6 /nobreak >nul
start "" "http://localhost:5182/conversation.html"
