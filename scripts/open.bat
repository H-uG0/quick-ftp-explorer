@echo off
REM open.bat - open a local file with the OS default handler, fire-and-forget.
REM
REM Usage: open.bat <local-path>
REM
REM `start ""` is the idiomatic way to launch a file without waiting. The empty
REM "" argument is consumed by cmd as the window title so the real path is not
REM misinterpreted when it contains spaces.

setlocal
set "TARGET=%~1"
if "%TARGET%"=="" exit /b 1
start "" "%TARGET%"
endlocal & exit /b 0
