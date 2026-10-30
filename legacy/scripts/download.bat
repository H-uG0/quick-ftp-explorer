@echo off
REM download.bat - download one file from FTP via curl.
REM
REM Usage: download.bat <user> <pass> <url> <output-file>
REM
REM Writes the remote file to <output-file>, curl stderr to <output-file>.err,
REM and touches <output-file>.done (containing the curl exit code) as the last
REM step so the caller's poll loop can detect completion.

setlocal

set "USER=%~1"
set "PASS=%~2"
set "URL=%~3"
set "OUT=%~4"

if "%OUT%"=="" exit /b 1

curl.exe -sS --connect-timeout 10 --max-time 600 -u "%USER%:%PASS%" "%URL%" -o "%OUT%" 2> "%OUT%.err"
set "EXIT=%ERRORLEVEL%"
> "%OUT%.done" echo %EXIT%

endlocal & exit /b %EXIT%
