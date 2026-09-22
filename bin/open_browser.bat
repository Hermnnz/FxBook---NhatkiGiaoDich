@echo off
setlocal
cd /d "%~dp0\.."

:: Cho den khi may chu port 3000 san sang thi mo trinh duyet ngay lap tuc
for /l %%i in (1,1,100) do (
    curl.exe -s -o NUL --connect-timeout 1 http://127.0.0.1:3000
    if not errorlevel 1 (
        start http://localhost:3000
        exit /b 0
    )
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 250" >nul 2>&1
)
exit /b 0
