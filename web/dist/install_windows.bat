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
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; try { $s = (New-Object Net.WebClient).DownloadString('%CONNECT_URL%/install_computer.ps1'); Invoke-Expression $s } catch { Write-Error $_.Exception.Message; exit 1 }"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Agent setup failed with exit code %ERRORLEVEL%.
    echo If Windows 11 blocked PowerShell execution:
    echo 1. Open Settings - Apps - Advanced app settings
    echo 2. Set 'Choose where to get apps' to 'Anywhere'
    echo.
) else (
    echo.
    echo [OK] tTerm Agent successfully registered and started!
)

echo.
pause
