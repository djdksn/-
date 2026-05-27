@echo off
cd /d "%~dp0"
title 樱栖学园 · 编年志
set PORT=3456

echo.
echo   樱栖学园 · 编年志
echo   ====================
echo.

:: Check if server already running
curl -s -o NUL http://localhost:%PORT% 2>NUL
if %errorlevel% equ 0 (
    echo   [OK] Server already running
    start http://localhost:%PORT%
    goto :done
)

:: Find npx — try common paths first
set NPX=
if exist "%ProgramFiles%\nodejs\npx.cmd" set NPX="%ProgramFiles%\nodejs\npx.cmd"
if exist "%ProgramFiles(x86)%\nodejs\npx.cmd" set NPX="%ProgramFiles(x86)%\nodejs\npx.cmd"
if "%NPX%"=="" where npx >nul 2>nul && set NPX=npx

if not "%NPX%"=="" (
    echo   [..] Starting server on port %PORT%...
    start http://localhost:%PORT%
    %NPX% --yes serve . -l %PORT% --no-clipboard
    goto :done
)

:: Fallback: Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo   [..] Using Python server...
    start http://localhost:%PORT%
    python -m http.server %PORT%
    goto :done
)

where python3 >nul 2>nul
if %errorlevel% equ 0 (
    echo   [..] Using Python3 server...
    start http://localhost:%PORT%
    python3 -m http.server %PORT%
    goto :done
)

echo   [ERR] Node.js or Python required.
echo         Install: https://nodejs.org
echo.
pause

:done
