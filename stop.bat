@echo off
title Tat FxBook - Nguyen Duc Anh

echo Dang tat may chu FxBook...
powershell -nop -c "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"

echo ========================================================
echo   May chu FxBook da duoc tat hoan toan.
echo ========================================================
ping 127.0.0.1 -n 2 >nul
exit /b 0
