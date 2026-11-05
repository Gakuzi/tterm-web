# tTerm Model Context Protocol (MCP) Server

Интеграция [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) для **tTerm Web**.

Позволяет AI-ассистентам (**Claude Desktop, Cursor, Antigravity, VS Code Copilot**) безопасно подключаться к инфраструктуре tTerm, получать список машин, инспектировать терминалы и управлять удалёнными серверами.

---

## 🚀 Быстрый старт

### 1. Настройка в Claude Desktop / Cursor / Antigravity

Добавьте конфигурацию в ваш файл `claude_desktop_config.json` или настройки MCP в Cursor:

```json
{
  "mcpServers": {
    "tterm": {
      "command": "python3",
      "args": ["/path/to/tterm-web/mcp_server.py"],
      "env": {
        "TTERM_URL": "https://app.tterm.net",
        "TTERM_SESSION": "your_session_cookie_or_token"
      }
    }
  }
}
```

> [!TIP]
> При использовании публичного сервиса `app.tterm.net` укажите `"TTERM_URL": "https://app.tterm.net"`. При использовании собственного локального сервера укажите локальный адрес (например, `"http://localhost:8290"` или `"http://192.168.1.100:8290"`).

---

## 🛠 Доступные MCP-инструменты (Tools)

| Инструмент | Описание | Параметры |
| :--- | :--- | :--- |
| `tterm_list_machines` | Возвращает список всех подключённых компьютеров и серверов (статус online/offline, ОС, пользователь, версия агента). | — |
| `tterm_get_machine_info` | Возвращает детальный паспорт машины (спецификации процессора, памяти, диска, доступные оболочки shell). | `machine_id` *(string)* |
| `tterm_list_terminals` | Возвращает список активных терминалов, рабочую директорию (`cwd`) и выполняющиеся команды. | — |
| `tterm_read_terminal` | Считывает журнал блоков команд в терминале: команды, коды возврата (`exitCode`) и расшифрованный вывод stdout/stderr. | `terminal_id` *(string)* |

---

## 🔒 Безопасность и отзыв доступа

1. **Мгновенный отзыв:** доступ агента прекращается сразу же при завершении сессии или отзыве токена в веб-интерфейсе tTerm.
2. **Изоляция:** агент видит только те машины и проекты, к которым выдан доступ.
