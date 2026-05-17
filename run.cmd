@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo [1] 正在关闭旧进程...
taskkill /f /im KoubojianJi.exe >nul 2>&1
wmic process where "name='KoubojianJi.exe'" delete >nul 2>&1
:: 暴力清理：直接删掉锁定的 exe 让编译能覆盖
timeout /t 2 /nobreak >nul
del /f /q "bin\Debug\net10.0\KoubojianJi.exe" >nul 2>&1

echo [2] 正在编译...
dotnet build --nologo 2>&1
if %errorlevel% neq 0 (
    echo.
    echo *** 编译失败 ***
    pause
    exit /b 1
)

echo [3] 正在启动...
start "" "bin\Debug\net10.0\KoubojianJi.exe"
