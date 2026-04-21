@echo off
REM list.bat - run curl to list a remote FTP directory.
REM
REM Usage: list.bat <user> <pass> <url> <output-file>
REM
REM The URL must end in '/' to trigger an FTP LIST (otherwise curl does RETR).
REM Writes stdout to <output-file>, stderr to <output-file>.err, and touches
REM <output-file>.done (containing the curl exit code) as the last step so the
REM caller's poll loop can detect completion.

setlocal

set "USER=%~1"
set "PASS=%~2"
set "URL=%~3"
set "OUT=%~4"

if "%OUT%"=="" exit /b 1

curl.exe -sS --connect-timeout 10 --max-time 60 -u "%USER%:%PASS%" "%URL%" > "%OUT%" 2> "%OUT%.err"
set "EXIT=%ERRORLEVEL%"
> "%OUT%.done" echo %EXIT%

endlocal & exit /b %EXIT%
