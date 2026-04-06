@echo off
setlocal

set "PROJECT_DIR=%~dp0"
if not exist "%PROJECT_DIR%backend\app.py" (
  if exist "D:\ChillerMate\backend\app.py" (
    set "PROJECT_DIR=D:\ChillerMate\"
  )
)

if not exist "%PROJECT_DIR%backend\app.py" (
  echo [ERROR] Could not find backend\app.py
  echo Tried:
  echo - %~dp0backend\app.py
  echo - D:\ChillerMate\backend\app.py
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

echo [BOOT] Starting backend launcher...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
  if not "%%P"=="0" (
    echo [BOOT] Killing process on port 5000: PID %%P
    taskkill /PID %%P /F >nul 2>nul
  )
)

echo [BOOT] Launching backend...
start "ChillerMate Backend" cmd /k "cd /d ""%PROJECT_DIR%"" && python -u backend\app.py"
echo [DONE] Backend window opened.
pause
