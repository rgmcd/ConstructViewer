@echo off
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8181"

cd /d "%~dp0"
echo Starting Construct Viewer at http://127.0.0.1:%PORT%/
node serve-local.js %PORT%
