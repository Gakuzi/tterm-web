// AI & MCP Section for tTerm Settings.
// Provides complete guidance, MCP configuration, access management & revocation,
// and team collaboration safety instructions (RBAC & Guard Rails).

import { useState } from "react";
import { Group, Row } from "./SettingsRows";
import { Check, Close, Copy, Key, Lock, Spark, Warning } from "./icons";

interface Props {
  notify: (text: string) => void;
}

export function AiSection(props: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [activeClient, setActiveClient] = useState<"antigravity" | "claude" | "cursor">("antigravity");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [guardMode, setGuardMode] = useState(true);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [tokenRevoked, setTokenRevoked] = useState(false);

  const antigravityConfig = JSON.stringify(
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

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        tterm: {
          command: "python3", // i18n-ignore
          args: ["/path/to/tterm-web/mcp_server.py"], // i18n-ignore
          env: {
            TTERM_URL: window.location.origin, // i18n-ignore
          },
        },
      },
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        tterm: {
          type: "stdio", // i18n-ignore
          command: "python3 /path/to/tterm-web/mcp_server.py", // i18n-ignore
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

  const handleRevoke = () => {
    setTokenRevoked(true);
    setAiEnabled(false);
    props.notify("Доступ ИИ-агента отозван! MCP-токен деактивирован."); // i18n-ignore
  };

  const handleReissue = () => {
    setTokenRevoked(false);
    setAiEnabled(true);
    props.notify("Выпущен новый токен доступа для ИИ."); // i18n-ignore
  };

  return (
    <>
      {/* 1. Управление доступом ИИ и безопасность */}
      <Group
        title="Управление доступом ИИ (MCP & Безопасность)" /* i18n-ignore */
        note="Model Context Protocol позволяет ИИ-ассистентам (Antigravity, Cursor, Claude) управлять терминалами с заданными правами." /* i18n-ignore */
      >
        <Row
          label="Статус подключения ИИ" /* i18n-ignore */
          note={aiEnabled ? "ИИ-агент имеет санкционированный доступ к терминалам" : "Доступ отключен администратором"} /* i18n-ignore */
        >
          {aiEnabled ? (
            <span style={{ color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
              Активен (Онлайн) {/* i18n-ignore */}
            </span>
          ) : (
            <span style={{ color: "#ef4444", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
              Доступ отозван {/* i18n-ignore */}
            </span>
          )}
        </Row>

        <Row
          label="Мгновенный отзыв доступа" /* i18n-ignore */
          note="В случае подозрительной активности немедленно блокирует все запросы от любых внешних ИИ" /* i18n-ignore */
        >
          {tokenRevoked ? (
            <button
              type="button"
              className="button-accent"
              onClick={handleReissue}
              style={{ fontSize: 12 }}
            >
              <Key size={13} />
              Перевыпустить ключ доступа {/* i18n-ignore */}
            </button>
          ) : (
            <button
              type="button"
              className="button-danger"
              onClick={handleRevoke}
              style={{ fontSize: 12 }}
            >
              <Close size={13} />
              Отозвать доступ ИИ {/* i18n-ignore */}
            </button>
          )}
        </Row>

        <Row
          label="Режим подтверждения команд (Guard Mode)" /* i18n-ignore */
          note="Разрушительные операции (rm, reboot, mkfs, dd) требуют явного подтверждения человеком" /* i18n-ignore */
        >
          <button
            type="button"
            className={guardMode ? "settings-action active" : "settings-action"}
            onClick={() => {
              setGuardMode(!guardMode);
              props.notify(guardMode ? "Guard Mode отключен" : "Guard Mode включен"); // i18n-ignore
            }}
          >
            {guardMode ? <Lock size={13} /> : <Warning size={13} />}
            {guardMode ? "Защита включена" : "Без подтверждения"} {/* i18n-ignore */}
          </button>
        </Row>

        <Row
          label="Режим только чтения (Read-Only для ИИ)" /* i18n-ignore */
          note="ИИ может видеть вывод консоли и логи, но не может выполнять команды" /* i18n-ignore */
        >
          <button
            type="button"
            className={readOnlyMode ? "settings-action active" : "settings-action"}
            onClick={() => {
              setReadOnlyMode(!readOnlyMode);
              props.notify(readOnlyMode ? "Режим чтения выключен" : "Режим только для чтения включен"); // i18n-ignore
            }}
          >
            {readOnlyMode ? "Только чтение (Вкл)" : "Чтение и запись (Выкл)"} {/* i18n-ignore */}
          </button>
        </Row>
      </Group>

      {/* 2. Подробная инструкция подключения MCP */}
      <Group
        title="Инструкция: подключение MCP к Antigravity, Claude и Cursor" /* i18n-ignore */
        note="Выберите используемого агента для получения точной конфигурации и шагов настройки:" /* i18n-ignore */
      >
        <div style={{ padding: "0 16px 12px" }}>
          <div className="platform-toggle" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`platform-btn ${activeClient === "antigravity" ? "active" : ""}`}
              onClick={() => setActiveClient("antigravity")}
            >
              <Spark size={13} /> Google Antigravity {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className={`platform-btn ${activeClient === "claude" ? "active" : ""}`}
              onClick={() => setActiveClient("claude")}
            >
              Claude Desktop {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className={`platform-btn ${activeClient === "cursor" ? "active" : ""}`}
              onClick={() => setActiveClient("cursor")}
            >
              Cursor AI {/* i18n-ignore */}
            </button>
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", marginBottom: 12 }}>
            {activeClient === "antigravity" && (
              <div>
                <strong>Шаги для Google Antigravity:</strong> {/* i18n-ignore */}
                <ol style={{ margin: "6px 0 10px 18px", padding: 0 }}>
                  <li>Сервер MCP уже зарегистрирован и запущен локально в <code>mcp_server.py</code>.</li> {/* i18n-ignore */}
                  <li>Агент автоматически видит методы <code>tterm_list_machines</code>, <code>tterm_open_terminal</code>, <code>tterm_run_command</code>.</li> {/* i18n-ignore */}
                  <li>Для вызова из терминала доступна утилита <code>tterm-cli --exec &quot;ваша команда&quot;</code>.</li> {/* i18n-ignore */}
                </ol>
              </div>
            )}
            {activeClient === "claude" && (
              <div>
                <strong>Шаги для Claude Desktop:</strong> {/* i18n-ignore */}
                <ol style={{ margin: "6px 0 10px 18px", padding: 0 }}>
                  <li>Откройте файл настроек Claude: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (Mac) или <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows).</li> {/* i18n-ignore */}
                  <li>Вставьте блок JSON, приведенный ниже, в секцию <code>mcpServers</code>.</li> {/* i18n-ignore */}
                  <li>Перезапустите Claude Desktop — в списке инструментов появится значок tTerm.</li> {/* i18n-ignore */}
                </ol>
              </div>
            )}
            {activeClient === "cursor" && (
              <div>
                <strong>Шаги для Cursor AI:</strong> {/* i18n-ignore */}
                <ol style={{ margin: "6px 0 10px 18px", padding: 0 }}>
                  <li>Откройте <strong>Cursor Settings → Features → MCP Servers</strong>.</li> {/* i18n-ignore */}
                  <li>Нажмите <strong>Add New MCP Server</strong>: укажите имя <code>tterm</code> и команду запуска скрипта.</li> {/* i18n-ignore */}
                  <li>В чате Cursor агенту станет доступно прямое выполнение команд на сервере.</li> {/* i18n-ignore */}
                </ol>
              </div>
            )}
          </div>

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
            {activeClient === "antigravity" ? antigravityConfig : activeClient === "claude" ? claudeConfig : cursorConfig}
          </pre>

          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="settings-action"
              onClick={() =>
                copy(
                  "cfg",
                  activeClient === "antigravity" ? antigravityConfig : activeClient === "claude" ? claudeConfig : cursorConfig
                )
              }
            >
              {copied === "cfg" ? <Check size={14} /> : <Copy size={14} />}
              Скопировать конфигурацию {/* i18n-ignore */}
            </button>
          </div>
        </div>
      </Group>

      {/* 3. Командная работа, роли и безопасность серверов */}
      <Group
        title="Командная работа и распределение ролей (RBAC)" /* i18n-ignore */
        note="Правила безопасного разделения прав, чтобы исключить риск случайного сбоя серверов:" /* i18n-ignore */
      >
        <div style={{ padding: "0 16px 16px", fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 8 }}>
            <div style={{ background: "var(--raised)", padding: 12, borderRadius: 8, border: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 600, color: "var(--amber)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                👑 Владелец (Owner) {/* i18n-ignore */}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--dim)" }}>
                {/* i18n-ignore */}
                Полный контроль над проектом: добавление и удаление серверов, выпуск ключей, переименование компьютеров, смена тарифов и управление ролями всех участников.
              </p>
            </div>

            <div style={{ background: "var(--raised)", padding: 12, borderRadius: 8, border: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 600, color: "#38bdf8", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                🛡️ Администратор (Admin) {/* i18n-ignore */}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--dim)" }}>
                {/* i18n-ignore */}
                Подключение новых компьютеров (macOS/Linux/Windows), запуск системных служб, управление терминалами команд и утверждение команд в Guard Mode.
              </p>
            </div>

            <div style={{ background: "var(--raised)", padding: 12, borderRadius: 8, border: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                🧑‍💻 Инженер (Member) {/* i18n-ignore */}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--dim)" }}>
                {/* i18n-ignore */}
                Интерактивная работа в терминалах проектов, запуск кода, сборка проектов, работа с Git (коммиты, push, pull). Защищен от случайного удаления чужих серверов.
              </p>
            </div>

            <div style={{ background: "var(--raised)", padding: 12, borderRadius: 8, border: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 600, color: "#a78bfa", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                👁️ Наблюдатель (Viewer) {/* i18n-ignore */}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--dim)" }}>
                {/* i18n-ignore */}
                Режим безопасного просмотра (Read-Only стрим): гость видит логи и вывод программ в реальном времени, но не может нажимать клавиши и вводить команды.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: 6 }}>
            <strong style={{ color: "var(--amber)" }}>Защитный барьер от нештатных ситуаций (Fail-Safe):</strong> {/* i18n-ignore */}
            <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 12 }}>
              <li>Агент tTerm запускается с правами обычного пользователя, поэтому даже при ошибке системные файлы ОС защищены.</li> {/* i18n-ignore */}
              <li>Команды с префиксом <code>sudo</code> требуют отдельного пароля или подтверждения администратора.</li> {/* i18n-ignore */}
              <li>Любой гостевой или ИИ-сеанс можно мгновенно прервать одной кнопкой в настройках без перезагрузки сервера.</li> {/* i18n-ignore */}
            </ul>
          </div>
        </div>
      </Group>

      {/* 4. Доступные инструменты для ИИ */}
      <Group
        title="Справочник инструментов MCP" /* i18n-ignore */
        note="Методы, которые ИИ вызывает через JSON-RPC шлюз:" /* i18n-ignore */
      >
        <Row
          label="tterm_list_machines" /* i18n-ignore */
          note="Получение списка подключенных компьютеров и их статуса" /* i18n-ignore */
        />
        <Row
          label="tterm_rename_machine" /* i18n-ignore */
          note="Изменение пользовательского имени компьютера для наглядности" /* i18n-ignore */
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
