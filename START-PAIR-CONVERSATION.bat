@echo off
rem Opens the PAIR-AND-QUESTION design page on this computer (double-click this file).
rem   - scripted from saved runs: no AI, no database, no account, no credits, no payment; nothing is saved
rem   - close the small "DARE pair conversation" window to stop it
cd /d "%~dp0"
start "DARE pair conversation (close this window to stop)" /min cmd /c "npx vite --port 5181 --strictPort"
echo Starting... the browser opens in a few seconds.
timeout /t 6 /nobreak >nul
start "" "http://localhost:5181/pair-conversation.html"
