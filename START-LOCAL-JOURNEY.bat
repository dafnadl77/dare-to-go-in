@echo off
rem Starts the local test journey on this computer and opens it in your browser (double-click this file).
rem   - real model for the questions and the reflection (gpt-4.1), through a local bridge
rem   - no database, no real account, no credits, no payment; the picture is a sample; nothing is saved
cd /d "%~dp0"
start "DARE test bridge (close this window to stop)" /min node scripts\devEnv.mjs bridge
start "DARE test screens (close this window to stop)" /min node scripts\devEnv.mjs journey
echo Starting... the browser opens in a few seconds.
timeout /t 7 /nobreak >nul
start "" "http://localhost:5393/?demo=1"
