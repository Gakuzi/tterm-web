@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title tTerm Windows Agent

echo ===================================================
echo   tTerm Windows Agent Installer
echo ===================================================
echo.

set CONNECT_URL=%1
if "%CONNECT_URL%"=="" set CONNECT_URL=http://192.168.0.6:8291

echo Connecting to tTerm Web at %CONNECT_URL%...
echo [1/2] Загрузка tTerm Agent...

set "AGENT_EXE=%TEMP%\tterm-agent.exe"
if exist "%AGENT_EXE%" del /f /q "%AGENT_EXE%" 2>nul

where curl >nul 2>nul
if %ERRORLEVEL% equ 0 (
    curl -f -sSL "%CONNECT_URL%/tterm-agent.exe" -o "%AGENT_EXE%"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%CONNECT_URL%/tterm-agent.exe', [System.IO.Path]::Combine($env:TEMP, 'tterm-agent.exe'))"
)

if exist "%AGENT_EXE%" (
    echo [2/2] Запуск мастера установки и фоновой службы...
    start "" "%AGENT_EXE%" --hub "%CONNECT_URL%"
    echo.
    echo [OK] tTerm Agent успешно запущен!
    goto :done
)

echo.
echo [Резервный вариант] Загрузка PowerShell агента...
set "PS_TMP=%TEMP%\tterm-agent-setup.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%CONNECT_URL%/install_computer.ps1', [System.IO.Path]::Combine($env:TEMP, 'tterm-agent-setup.ps1'))"

if exist "%PS_TMP%" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_TMP%"
    del /f /q "%PS_TMP%" 2>nul
    echo.
    echo [OK] tTerm PowerShell Agent успешно установлен!
    goto :done
)

echo.
echo [ERROR] Не удалось загрузить агент с сервера %CONNECT_URL%.
echo Проверьте подключение к локальной сети.

:done
echo.
pause
