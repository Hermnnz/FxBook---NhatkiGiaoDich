@echo off
title FxBook Trading Journal - Nguyen Duc Anh

:: 1. Tu dong tim dung thu muc du an FxBook
set "PROJECT_DIR=%~dp0"
if not exist "%PROJECT_DIR%package.json" (
    if exist "D:\Hoc Tap\Project\FxBook\package.json" (
        set "PROJECT_DIR=D:\Hoc Tap\Project\FxBook\"
    ) else (
        echo [LOI] Khong tim thay thu muc du an FxBook!
        pause
        exit /b 1
    )
)
cd /d "%PROJECT_DIR%"

:: 2. Neu may chu dang chay san -> mo web ngay lap tuc va thoat
curl.exe -s -o NUL --connect-timeout 1 http://127.0.0.1:3000
if not errorlevel 1 (
    echo [FxBook] May chu dang chay san. Mo trang web ngay lap tuc...
    start http://localhost:3000
    exit /b 0
)

:: 3. Khoi dong may chu FxBook
echo ========================================================
echo   FxBook Trading Journal - Nguyen Duc Anh
echo ========================================================
echo Dang khoi dong may chu FxBook sieu toc...

:: Kiem tra ban build Production da san sang chua
if not exist ".next\BUILD_ID" (
    echo [THONG BAO] Dang bien dich ban Production lan dau...
    call npm.cmd run build
)

:: Mo trinh duyet tu dong ngay khi may chu san sang (chay ngam tach biet, khong spam man hinh)
if exist "bin\open_browser.bat" (
    start "" /min cmd /c "bin\open_browser.bat"
) else (
    start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
)

:: Chay may chu Next.js truc tiep bang node.exe
if exist "node_modules\next\dist\bin\next" (
    node "node_modules\next\dist\bin\next" start
) else (
    call npm.cmd start
)

echo.
echo ========================================================
echo May chu FxBook da dung.
echo ========================================================
pause

