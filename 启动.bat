@echo off
chcp 65001 >nul
title 樱栖学园 · 编年志

:: 切换到本脚本所在目录
cd /d "%~dp0"

set PORT=3456

echo.
echo   🌸 樱栖学园 · 编年志
echo   ════════════════════
echo.

:: 检查端口是否已被占用
powershell -Command "try { (Invoke-WebRequest -Uri http://localhost:%PORT% -TimeoutSec 2 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✅ 服务器已在运行 → http://localhost:%PORT%
    start http://localhost:%PORT%
    goto :end
)

:: 优先尝试 npx serve
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo   ▶ 使用 npx serve 启动...
    echo   ▶ 正在启动服务器，请稍候...
    start "" http://localhost:%PORT%
    npx --yes serve . -l %PORT% --no-clipboard
    goto :end
)

:: 回退到 Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo   ▶ 使用 Python 启动...
    start "" http://localhost:%PORT%
    python -m http.server %PORT%
    goto :end
)

where python3 >nul 2>nul
if %errorlevel% equ 0 (
    echo   ▶ 使用 Python3 启动...
    start "" http://localhost:%PORT%
    python3 -m http.server %PORT%
    goto :end
)

:: 都没找到
echo   ❌ 未找到 Node.js 或 Python，请安装其中之一：
echo      Node.js: https://nodejs.org
echo      Python:  https://www.python.org
echo.
pause
goto :end

:end
