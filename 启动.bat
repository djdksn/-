@echo off
cd /d "%~dp0"
set PORT=8767
title Sakurasu

echo.
echo   Sakurasu
echo   http://localhost:8767/
echo.

where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] npx serve
    start http://localhost:8767/
    npx --yes serve . -l 8767 --no-clipboard
    goto :done
)

where python >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] Python
    start http://localhost:8767/
    python -m http.server 8767
    goto :done
)

where python3 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] Python3
    start http://localhost:8767/
    python3 -m http.server 8767
    goto :done
)

echo   [ERR] Node.js or Python required.
echo         https://nodejs.org
echo.
pause

:done
