// AI & MCP Section for tTerm Settings.
// Exposes tools and configuration for AI Assistants (Cursor, Claude Desktop, Antigravity).

import { useState } from "react";
import { Group, Row } from "./SettingsRows";
import { Check, Copy } from "./icons";

interface Props {
  notify: (text: string) => void;
}

export function AiSection(props: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        tterm: {
          command: "/Users/evgeniy/Documents/antigravity/tterm-web/.venv/bin/python", // i18n-ignore
          args: ["/Users/evgeniy/Documents/antigravity/tterm-web/mcp_server.py"], // i18n-ignore
          env: {
            TTERM_URL: window.location.origin, // i18n-ignore
          },
        },
      },
    },
    null,
    2
  );

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    props.notify("Скопировано в буфер обмена"); // i18n-ignore
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <Group
        title="Управление через ИИ (MCP)" /* i18n-ignore */
        note="Model Context Protocol позволяет ИИ-ассистентам (Cursor, Claude, Antigravity) безопасно выполнять команды в терминалах tTerm." /* i18n-ignore */
      >
        <Row
          label="Статус MCP сервера" /* i18n-ignore */
          note="Локальный мост и JSON-RPC шлюз активны" /* i18n-ignore */
        >
          <span style={{ color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            Онлайн {/* i18n-ignore */}
          </span>
        </Row>

        <Row
          label="Быстрый запуск в консоли" /* i18n-ignore */
          note="Утилита tterm-cli установлена в ~/.local/bin/tterm-cli" /* i18n-ignore */
        >
          <button
            type="button"
            className="settings-action"
            onClick={() => copy("cli", "tterm-cli --exec 'uptime'")}
          >
            {copied === "cli" ? <Check size={14} /> : <Copy size={14} />}
            <code>tterm-cli --exec "uptime"</code> {/* i18n-ignore */}
          </button>
        </Row>
      </Group>

      <Group
        title="Конфигурация для Claude Desktop и Cursor" /* i18n-ignore */
        note="Вставьте этот блок в ваш claude_desktop_config.json или настройки MCP в Cursor." /* i18n-ignore */
      >
        <div style={{ padding: "8px 16px 16px" }}>
          <pre
            style={{
              background: "rgba(0, 0, 0, 0.25)",
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              overflowX: "auto",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              fontFamily: "JetBrains Mono Variable, monospace", // i18n-ignore
            }}
          >
            {mcpConfig}
          </pre>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="settings-action"
              onClick={() => copy("cfg", mcpConfig)}
            >
              {copied === "cfg" ? <Check size={14} /> : <Copy size={14} />}
              Скопировать JSON {/* i18n-ignore */}
            </button>
          </div>
        </div>
      </Group>

      <Group
        title="Доступные инструменты для ИИ" /* i18n-ignore */
        note="Инструменты, которые агент может вызывать через MCP:" /* i18n-ignore */
      >
        <Row
          label="tterm_list_machines" /* i18n-ignore */
          note="Получение списка подключенных компьютеров и их статуса" /* i18n-ignore */
        />
        <Row
          label="tterm_list_terminals" /* i18n-ignore */
          note="Список открытых терминалов и текущих запущенных процессов" /* i18n-ignore */
        />
        <Row
          label="tterm_open_terminal" /* i18n-ignore */
          note="Открытие нового сеанса терминала на выбранной машине" /* i18n-ignore */
        />
        <Row
          label="tterm_exec" /* i18n-ignore */
          note="Автоматический запуск команды с мгновенным возвратом вывода" /* i18n-ignore */
        />
        <Row
          label="tterm_run_command" /* i18n-ignore */
          note="Выполнение команды в конкретном терминале по его ID" /* i18n-ignore */
        />
        <Row
          label="tterm_read_terminal" /* i18n-ignore */
          note="Чтение истории вывода терминала и кодов возврата" /* i18n-ignore */
        />
      </Group>
    </>
  );
}
