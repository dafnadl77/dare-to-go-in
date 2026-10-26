@echo off
rem Opens ONE REAL conversation with DARE on this computer (double-click this file). Approved 2026-10-24 (doc 105):
rem   - the real model through the real route and its safety checks, on this computer only (127.0.0.1)
rem   - HARD cap $0.20 for the whole test: every request is checked BEFORE it is sent; past the cap nothing is sent
rem   - no database, no account, no credits, no payment; the conversation itself is not saved anywhere
rem   - close the two small windows to stop
cd /d "%~dp0"
start "DARE conversation bridge (close to stop)" /min cmd /c "set CONV_LIVE_CAP=0.20&& npx tsx scripts/conversationBridge.ts"
start "DARE conversation page (close to stop)" /min cmd /c "npx vite --port 5182 --strictPort"
echo Starting... the browser opens in a few seconds.
timeout /t 8 /nobreak >nul
start "" "http://localhost:5182/conversation.html?live=1"
