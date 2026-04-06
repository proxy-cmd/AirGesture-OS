@echo off
setlocal

set "PROJECT_DIR=%~dp0"
if not exist "%PROJECT_DIR%backend\app.py" (
  if exist "D:\ChillerMate\backend\app.py" (
    set "PROJECT_DIR=D:\ChillerMate\"
  )
)

if not exist "%PROJECT_DIR%backend\app.py" (
  echo [ERROR] Could not find project backend file.
  echo Tried:
  echo - %~dp0backend\app.py
  echo - D:\ChillerMate\backend\app.py
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

echo [BOOT] Preparing full stack...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
  if not "%%P"=="0" (
    echo [BOOT] Killing process on port 5000: PID %%P
    taskkill /PID %%P /F >nul 2>nul
  )
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5500 .*LISTENING"') do (
  if not "%%P"=="0" (
    echo [BOOT] Killing process on port 5500: PID %%P
    taskkill /PID %%P /F >nul 2>nul
  )
)

echo [BOOT] Starting backend window...
start "ChillerMate Backend" cmd /k "cd /d ""%PROJECT_DIR%"" && python -u backend\app.py"

echo [BOOT] Starting frontend window...
start "ChillerMate Frontend" cmd /k "cd /d ""%PROJECT_DIR%frontend"" && python -m http.server 5500"

timeout /t 2 >nul
echo [DONE] Started.
echo Open: http://127.0.0.1:5000
echo If using ngrok: ngrok http 5000
pause
