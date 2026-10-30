@echo off
REM package.bat - build a distributable zip of the legacy HTA app.
REM
REM Stages a clean copy of legacy\ into dist\quick-ftp-explorer\ (no
REM .git, no user-created shortcuts, no cached temp downloads), zips it
REM with Windows' built-in tar.exe (ships since Windows 10 1803), and
REM falls back to PowerShell Compress-Archive if tar is unavailable.
REM The repository-wide LICENSE lives one level up.
REM
REM Result: legacy\dist\quick-ftp-explorer.zip

setlocal

set "HERE=%~dp0"
set "STAGE=%HERE%dist\quick-ftp-explorer"
set "OUT=%HERE%dist\quick-ftp-explorer.zip"

echo Staging in "%STAGE%" ...
if exist "%STAGE%" rmdir /s /q "%STAGE%"
if exist "%OUT%" del /q "%OUT%"
mkdir "%STAGE%"

copy /y "%HERE%quick-ftp-explorer.hta" "%STAGE%\"  >nul
copy /y "%HERE%README.md"               "%STAGE%\" >nul
copy /y "%HERE%..\LICENSE"              "%STAGE%\" >nul

xcopy /e /i /q /y "%HERE%ui"      "%STAGE%\ui\"      >nul
xcopy /e /i /q /y "%HERE%scripts" "%STAGE%\scripts\" >nul
xcopy /e /i /q /y "%HERE%docs"    "%STAGE%\docs\"    >nul

mkdir "%STAGE%\config\shortcuts"
mkdir "%STAGE%\config\temp"
type nul > "%STAGE%\config\shortcuts\.gitkeep"
type nul > "%STAGE%\config\temp\.gitkeep"
REM config/data.csv is intentionally not bundled; the app writes it on first
REM launch using the fallback defaults in ui/js/config.js.

echo Creating "%OUT%" ...
pushd "%HERE%dist"
where tar.exe >nul 2>&1
if %errorlevel% equ 0 (
  tar -a -c -f "quick-ftp-explorer.zip" quick-ftp-explorer
) else (
  echo tar.exe not found; falling back to PowerShell Compress-Archive.
  powershell -NoProfile -Command "Compress-Archive -Path 'quick-ftp-explorer' -DestinationPath 'quick-ftp-explorer.zip' -Force"
)
set PKG_EXIT=%errorlevel%
popd

rmdir /s /q "%STAGE%"

if %PKG_EXIT% neq 0 (
  echo Packaging failed with exit code %PKG_EXIT%.
  exit /b %PKG_EXIT%
)

for %%A in ("%OUT%") do echo Done: %%~fA  ^(%%~zA bytes^)

endlocal
exit /b 0
