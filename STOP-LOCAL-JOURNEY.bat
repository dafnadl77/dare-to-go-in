@echo off
rem Stops the local test journey (the two small windows started by START-LOCAL-JOURNEY.bat).
taskkill /FI "WINDOWTITLE eq DARE test bridge*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq DARE test screens*" /T /F >nul 2>&1
echo Stopped.
