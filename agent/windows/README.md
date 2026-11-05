# tTerm Windows Agent

Нативное Windows-приложение (64-bit EXE) для подключения рабочих станций и серверов Windows (10, 11, Server) к веб-терминалу **tTerm Web**.

## Возможности
- **Установка в 1 клик**: при первом запуске автоматически сохраняет конфигурацию в `%USERPROFILE%\.tterm-web\env.json`.
- **Автозапуск**: автоматически прописывается в автозагрузку Windows (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` и папку `Startup`).
- **Фоновый режим**: работает как фоновый демон без надоедливых консольных окон, логирует работу в `%USERPROFILE%\.tterm-web\agent.log`.
- **PowerShell-терминал**: полноценная поддержка интерактивных сессий PowerShell и выполнения скриптов через защищенный WebSocket-протокол.
- **Безопасность**: не использует вызовы `Invoke-Expression` / `DownloadString` в командной строке, поэтому не блокируется эвристиками защитника Windows (Windows Defender / AMSI).

## Сборка из исходников

Для кросс-компиляции под Windows с любой ОС (macOS / Linux / Windows) требуется Go 1.20+:

```bash
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o tterm-agent.exe
```

## Использование

```cmd
:: Обычный запуск (установка, автозапуск и фоновое подключение)
tterm-agent.exe

:: Запуск с указанием адреса сервера
tterm-agent.exe -hub http://localhost:8291

:: Проверка статуса
tterm-agent.exe --status

:: Удаление из автозапуска
tterm-agent.exe --uninstall
```
