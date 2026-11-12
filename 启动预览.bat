@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PORT=8765

echo ============================================
echo   911 风格跑车 3D 数字车展 - 本地预览
echo ============================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  set PY=py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set PY=python
  ) else (
    echo [错误] 未找到 Python，请先安装 Python 3 并加入 PATH。
    pause
    exit /b 1
  )
)

echo 正在启动静态服务 http://localhost:%PORT% ...
echo 浏览器将自动打开，关闭本窗口即停止服务。
start "" "http://localhost:%PORT%/index.html"
%PY% -m http.server %PORT% --bind 127.0.0.1
pause
