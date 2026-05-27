@echo off
cd /d "%~dp0"
set "PORT=3456"
title 樱栖学园 · 编年志

echo.
echo   樱栖学园 · 编年志
echo   ====================
echo   http://localhost:%PORT%/
echo.

:: npx serve (preferred)
where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] npx serve on port %PORT%
    start "" "http://localhost:%PORT%/"
    npx --yes serve . -l %PORT% --no-clipboard
    goto :done
)

:: Python fallback
where python >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] Python http.server on port %PORT%
    start "" "http://localhost:%PORT%/"
    python -m http.server %PORT%
    goto :done
)

:: Python3 fallback
where python3 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [..] Python3 http.server on port %PORT%
    start "" "http://localhost:%PORT%/"
    python3 -m http.server %PORT%
    goto :done
)

echo   [ERR] Node.js or Python required.
echo         Install: https://nodejs.org
echo.
pause

:done
