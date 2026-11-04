import { useState, useEffect } from "react";
import {
  getTerminalAccess, updateTerminalAccess, revokeTerminalAi,
  type Me,
} from "./api";
import { Check, Close, Copy, Person, Spark } from "./icons";
import { useBriefly } from "./briefly";

interface Props {
  terminalId: string;
  machineName: string;
  terminalLabel: string;
  me: Me;
  onClose: () => void;
  notify: (text: string) => void;
}

export function TerminalAccessDialog(props: Props) {
  const { terminalId, machineName, terminalLabel, onClose, notify } = props;
  const [tab, setTab] = useState<"ai" | "team">("ai");
  const [loading, setLoading] = useState(true);
  const [aiAccess, setAiAccess] = useState(true);
  const [aiMode, setAiMode] = useState<"execute" | "guard" | "readonly">("execute");
  const [copiedLink, showCopiedLink] = useBriefly<boolean>();
  const [copiedCli, showCopiedCli] = useBriefly<boolean>();
  const [copiedConfig, showCopiedConfig] = useBriefly<boolean>();

  useEffect(() => {
    let live = true;
    getTerminalAccess(terminalId)
      .then((acc) => {
        if (!live) return;
        setAiAccess(acc.aiAccess);
        setAiMode(acc.aiMode);
      })
      .catch(() => {
        // Fallback default
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [terminalId]);

  const saveSettings = async (access: boolean, mode: "execute" | "guard" | "readonly") => {
    setAiAccess(access);
    setAiMode(mode);
    try {
      await updateTerminalAccess(terminalId, { aiAccess: access, aiMode: mode });
      notify(access ? "Настройки доступа терминала сохранены" : "Доступ ИИ к терминалу отключен"); // i18n-ignore
    } catch {
      notify("Ошибка сохранения настроек"); // i18n-ignore
    }
  };

  const handleRevoke = async () => {
    try {
      await revokeTerminalAi(terminalId);
      setAiAccess(false);
      notify("Доступ ИИ к терминалу успешно отозван"); // i18n-ignore
    } catch {
      notify("Не удалось отозвать доступ"); // i18n-ignore
    }
  };

  const shareUrl = `${location.origin}/t/${terminalId}`;
  const cliSnippet = `tterm-cli --terminal ${terminalId} "ls -la"`;
  const mcpConfigSnippet = JSON.stringify(
    {
      url: location.origin,
      allowed_terminal: terminalId,
    },
    null,
    2
  );

  const copyToClipboard = async (text: string, showFn: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      showFn(true);
      notify("Скопировано в буфер обмена"); // i18n-ignore
    } catch {
      showFn(false);
      notify("Не удалось скопировать"); // i18n-ignore
    }
  };

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog access-dialog" role="dialog" aria-modal="true">
        <header className="dialog-head">
          <div className="dialog-title-group">
            <h2 className="dialog-title">
              {/* i18n-ignore */}
              Управление доступом: {terminalLabel}
            </h2>
            <p className="dialog-subtitle">
              {/* i18n-ignore */}
              Сервер: <strong>{machineName}</strong> • Терминал ID: <code className="mini-id">{terminalId.slice(0, 8)}…</code>
            </p>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} title="Закрыть"> {/* i18n-ignore */}
            <Close size={18} />
          </button>
        </header>

        <nav className="access-tabs">
          <button
            type="button"
            className={`access-tab ${tab === "ai" ? "active" : ""}`}
            onClick={() => setTab("ai")}
          >
            <Spark size={15} />
            <span>{/* i18n-ignore */}Доступ ИИ-Агентов</span>
          </button>
          <button
            type="button"
            className={`access-tab ${tab === "team" ? "active" : ""}`}
            onClick={() => setTab("team")}
          >
            <Person size={15} />
            <span>{/* i18n-ignore */}Совместный доступ (Команда)</span>
          </button>
        </nav>

        <div className="dialog-body access-dialog-body">
          {tab === "ai" && (
            <div className="access-section">
              <div className="access-status-card">
                <div className="status-toggle-row">
                  <div>
                    <strong>{/* i18n-ignore */}Статус доступа для ИИ-Агентов</strong>
                    <p className="status-desc">
                      {aiAccess
                        ? "ИИ-ассистенты (Antigravity, Cursor, Claude) могут взаимодействовать с этим терминалом." // i18n-ignore
                        : "Доступ ИИ полностью заблокирован. Агенты не могут выполнять команды."} {/* i18n-ignore */}
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={aiAccess}
                      disabled={loading}
                      onChange={(e) => void saveSettings(e.target.checked, aiMode)}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                {aiAccess && (
                  <div className="emergency-revoke-box">
                    <button
                      type="button"
                      className="button-danger small"
                      onClick={() => void handleRevoke()}
                    >
                      {/* i18n-ignore */}
                      🚫 Отозвать доступ у всех агентов
                    </button>
                    <span className="faint-note">
                      {/* i18n-ignore */}
                      Мгновенно прерывает команды агента и отзывает права на этот терминал.
                    </span>
                  </div>
                )}
              </div>

              {aiAccess && (
                <div className="access-roles-box">
                  <span className="field-label">{/* i18n-ignore */}Уровень прав ИИ в этом терминале (RBAC)</span>
                  <div className="role-options">
                    <label className={`role-card ${aiMode === "execute" ? "active" : ""}`}>
                      <input
                        type="radio"
                        name="aiMode"
                        value="execute"
                        checked={aiMode === "execute"}
                        onChange={() => void saveSettings(true, "execute")}
                      />
                      <div className="role-content">
                        <div className="role-head">
                          <strong>{/* i18n-ignore */}⚡ Полный запуск (Execute)</strong>
                          <span className="role-chip rec">{/* i18n-ignore */}По умолчанию</span>
                        </div>
                        <p>{/* i18n-ignore */}Агент выполняет команды автономно. Вы в реальном времени наблюдаете за ходом выполнения в окне терминала.</p>
                      </div>
                    </label>

                    <label className={`role-card ${aiMode === "guard" ? "active" : ""}`}>
                      <input
                        type="radio"
                        name="aiMode"
                        value="guard"
                        checked={aiMode === "guard"}
                        onChange={() => void saveSettings(true, "guard")}
                      />
                      <div className="role-content">
                        <div className="role-head">
                          <strong>{/* i18n-ignore */}🛡️ Режим подтверждения (Guard Mode)</strong>
                          <span className="role-chip sec">{/* i18n-ignore */}Безопасный</span>
                        </div>
                        <p>{/* i18n-ignore */}Перед выполнением любой команды агента у вас в терминале появляется карточка с кнопками [Разрешить] / [Отклонить].</p>
                      </div>
                    </label>

                    <label className={`role-card ${aiMode === "readonly" ? "active" : ""}`}>
                      <input
                        type="radio"
                        name="aiMode"
                        value="readonly"
                        checked={aiMode === "readonly"}
                        onChange={() => void saveSettings(true, "readonly")}
                      />
                      <div className="role-content">
                        <div className="role-head">
                          <strong>{/* i18n-ignore */}👁️ Только чтение (Read-Only)</strong>
                        </div>
                        <p>{/* i18n-ignore */}Агент может просматривать статус и читать историю вывода, но запуск команд запрещён.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="access-integration-box">
                <span className="field-label">{/* i18n-ignore */}Привязка ИИ исключительно к ЭТОМУ терминалу</span>
                <p className="status-desc">
                  {/* i18n-ignore */}
                  Вы можете дать агенту доступ только к данному терминалу (ограничение по Scoped Terminal ID). Другие терминалы и компьютеры будут изолированы.
                </p>

                <div className="code-block-header">
                  <span>{/* i18n-ignore */}Команда запуска CLI для этого терминала:</span>
                  <button
                    type="button"
                    className="copy-chip"
                    onClick={() => void copyToClipboard(cliSnippet, showCopiedCli)}
                  >
                    {copiedCli ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedCli ? "Скопировано" : "Копировать"}</span> {/* i18n-ignore */}
                  </button>
                </div>
                <pre className="code-snippet"><code>{cliSnippet}</code></pre>

                <div className="code-block-header" style={{ marginTop: "12px" }}>
                  <span>{/* i18n-ignore */}Конфигурация MCP (~/.config/tterm/config.json):</span>
                  <button
                    type="button"
                    className="copy-chip"
                    onClick={() => void copyToClipboard(mcpConfigSnippet, showCopiedConfig)}
                  >
                    {copiedConfig ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedConfig ? "Скопировано" : "Копировать"}</span> {/* i18n-ignore */}
                  </button>
                </div>
                <pre className="code-snippet"><code>{mcpConfigSnippet}</code></pre>
              </div>
            </div>
          )}

          {tab === "team" && (
            <div className="access-section">
              <div className="team-share-box">
                <span className="field-label">{/* i18n-ignore */}Ссылка для совместного доступа к этому терминалу</span>
                <div className="share-link-row">
                  <input
                    type="text"
                    className="text-input"
                    readOnly
                    value={shareUrl}
                  />
                  <button
                    type="button"
                    className="button-accent"
                    onClick={() => void copyToClipboard(shareUrl, showCopiedLink)}
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedLink ? "Скопировано" : "Копировать ссылку"}</span> {/* i18n-ignore */}
                  </button>
                </div>
                <p className="status-desc" style={{ marginTop: "8px" }}>
                  {/* i18n-ignore */}
                  По этой ссылке коллега или гость сможет открыть этот терминал прямо в браузере.
                </p>
              </div>

              <div className="author-legend-box">
                <span className="field-label">{/* i18n-ignore */}Идентификация авторов в терминале (Кто выполняет)</span>
                <p className="status-desc">
                  {/* i18n-ignore */}
                  Каждая выполненная команда помечается бейджем автора и выделяется цветом:
                </p>
                <div className="legend-items">
                  <div className="legend-item">
                    <span className="chip-author chip-author-user">
                      <Person size={11} />
                      <span>{/* i18n-ignore */}Вы ({props.me.name || "Владелец"})</span>
                    </span>
                    <span className="legend-text">{/* i18n-ignore */}Ваши команды, введённые в веб-интерфейсе.</span>
                  </div>
                  <div className="legend-item">
                    <span className="chip-author chip-author-agent">
                      <Spark size={11} />
                      <span>{/* i18n-ignore */}Antigravity (ИИ-Агент)</span>
                    </span>
                    <span className="legend-text">{/* i18n-ignore */}Команды ИИ. Выделяются фиолетовой полосой и светящимся бейджем.</span>
                  </div>
                  <div className="legend-item">
                    <span className="chip-author chip-author-guest">
                      <span>{/* i18n-ignore */}👥 Гость / Коллега</span>
                    </span>
                    <span className="legend-text">{/* i18n-ignore */}Команды внешних участников с гостевым доступом.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="dialog-foot">
          <button type="button" className="button-accent" onClick={onClose}>
            {/* i18n-ignore */}
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
