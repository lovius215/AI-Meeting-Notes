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

REM 2. Support global install or --local (npm link)
if "%~1"=="--local" (
  echo Linking %PACKAGE_NAME% ^(%CLI_NAME%^) locally via npm link...
  call npm link
  if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
  echo Done! You can now run "%CLI_NAME% --help".
) else (
  echo Installing %PACKAGE_NAME% globally via npm...
  call npm install -g "%PACKAGE_NAME%"
  if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
  echo Done! You can now run "%CLI_NAME% --help".
)

endlocal
