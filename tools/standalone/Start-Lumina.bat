@echo off
setlocal
title Lumina Smile Lab
cd /d "%~dp0"
echo.
echo  ==========================================
echo    LUMINA SMILE LAB  -  local launcher
echo  ==========================================
echo.

rem ---- 1. Find Node.js (needed once, free) ----
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" ( set "NODE=%ProgramFiles%\nodejs\node.exe" ) else goto :installnode
)
"%NODE%" -e "process.exit(+process.versions.node.split('.')[0]>=18?0:1)" >nul 2>nul
if errorlevel 1 goto :installnode
goto :havenode

:installnode
echo  Node.js (a free helper program) is required and was not found.
echo  Installing it now. If Windows asks for permission, click Yes.
echo.
where winget >nul 2>nul
if errorlevel 1 (
  echo  Automatic install is not available on this PC.
  echo  Opening the download page. Install the "LTS" version, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo  Node.js installed. Please CLOSE this window and double-click Start-Lumina.bat again.
pause
exit /b 0

:havenode
rem ---- 2. Face model (one-time download, about 4 MB) ----
if not exist "models\face_landmarker.task" (
  echo  First run: downloading the face tracking model from Google...
  "%NODE%" fetch-face-model.mjs
  if errorlevel 1 (
    echo.
    echo  Could not download the face model. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo.
)

rem ---- 3. Desktop shortcut (first run only) ----
if not exist "%USERPROFILE%\Desktop\Lumina Smile Lab.lnk" (
  powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:USERPROFILE+'\Desktop\Lumina Smile Lab.lnk');$s.TargetPath='%~dp0Start-Lumina.bat';$s.WorkingDirectory='%~dp0';$s.Save()" >nul 2>nul
)

rem ---- 4. Start and open the browser ----
echo  Starting Lumina. Your browser will open in a moment.
echo  KEEP THIS WINDOW OPEN while you use the app. Close it to stop.
echo.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080"
"%NODE%" serve.mjs 8080
echo.
echo  The app stopped. If you saw an error about the port being in use, Lumina may already be running:
echo  open http://localhost:8080 in Chrome or Edge.
pause
