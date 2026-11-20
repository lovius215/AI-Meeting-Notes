@echo off
setlocal

set "PACKAGE_NAME=@loviusc/ai-meeting-notes"
set "CLI_NAME=meetnotes"

REM 1. Mandatory check for node and npm
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [Error] Node.js is not installed. Please install Node.js ^(^>= 18^) from https://nodejs.org/ first.
  exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [Error] npm is not installed. Please install Node.js and npm first.
  exit /b 1
)

REM 2. Clean uninstall
echo Uninstalling %PACKAGE_NAME% ^(%CLI_NAME%^)...
call npm uninstall -g "%PACKAGE_NAME%"
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
echo Successfully uninstalled %PACKAGE_NAME%.

endlocal
