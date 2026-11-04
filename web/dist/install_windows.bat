@echo off
chcp 65001 >nul
echo ===================================================
echo   tTerm Windows Agent Installer
echo ===================================================
echo.
echo Проверка наличия PowerShell в системе...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Write-Host 'PowerShell обнаружен.'"
if %errorlevel% neq 0 (
    echo [ОШИБКА] Требуется PowerShell для работы агента tTerm на Windows.
    pause
    exit /b 1
)

set CONNECT_URL=%1
if "%CONNECT_URL%"=="" (
    set /p CONNECT_URL="Введите адрес сервера tTerm (например http://192.168.0.6:8291): "
)

set TOKEN=%2
if "%TOKEN%"=="" (
    set /p TOKEN="Введите одноразовый токен подключения (из диалога Add Machine): "
)

echo.
echo Подключение Windows к серверу tTerm %CONNECT_URL%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$wc = New-Object System.Net.WebClient; $wc.Encoding = [System.Text.Encoding]::UTF8; " ^
  "try { $script = $wc.DownloadString('%CONNECT_URL%/install_computer.ps1'); Invoke-Expression $script; Install-TTermComputer -ConnectUrl '%CONNECT_URL%' -Token '%TOKEN%' } catch { Write-Error $_.Exception.Message }"

echo.
echo Готово. Нажмите любую клавишу для закрытия.
pause >nul
