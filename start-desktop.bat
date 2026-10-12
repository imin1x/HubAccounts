@echo off
chcp 65001 >nul
title HubAccounts Local Vault (Desktop Offline)

echo ========================================================
echo    HUBACCOUNTS — KHO TÀI KHOẢN MÃ HOÁ (CHẾ ĐỘ OFFLINE)
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LỖI] Chưa tìm thấy Node.js trên máy tính!
    echo Vui lòng cài đặt Node.js từ https://nodejs.org để chạy máy chủ cục bộ.
    echo Hoặc bạn có thể click đúp mở trực tiếp file HubAccounts.html bằng trình duyệt.
    echo.
    pause
    exit /b 1
)

echo [*] Đang khởi động máy chủ bảo mật cục bộ tại 127.0.0.1:8765 ...
echo [*] Trình duyệt sẽ tự động mở sau giây lát.
echo.
echo Nhấn Ctrl+C trong cửa sổ này khi muốn dừng máy chủ.
echo ========================================================

start "" "http://127.0.0.1:8765/HubAccounts.html"
node server.js
pause
