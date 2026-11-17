@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动本地预览...
start "" /b cmd /c "timeout /t 2 >nul & start http://127.0.0.1:5173"
node tools/serve.mjs 5173
pause
