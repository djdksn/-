@echo off
cd /d "%~dp0"
set PORT=3456
title Sakurasu

echo.
echo   Sakurasu
echo   http://localhost:3456/
echo.

where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] npx serve
    start http://localhost:3456/
    npx --yes serve . -l 3456 --no-clipboard
    goto :done
)

where python >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] Python
    start http://localhost:3456/
    python -m http.server 3456
    goto :done
)

where python3 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] Python3
    start http://localhost:3456/
    python3 -m http.server 3456
    goto :done
)

echo   [ERR] Node.js or Python required.
echo         https://nodejs.org
echo.
pause

:done
