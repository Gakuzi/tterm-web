import { Alert, Close, Lock } from "./icons";

export interface ActiveProcess {
  terminal_id: string;
  terminal_name: string;
  user_name: string;
  command: string;
  running_since: string;
  duration_seconds?: number;
}

interface Props {
  entityType: "node" | "container" | "service";
  entityName: string;
  action: "reboot" | "restart" | "delete" | "upgrade";
  activeProcesses: ActiveProcess[];
  onConfirmDrain: (timeoutSeconds: number) => void;
  onConfirmForce: () => void;
  onCancel: () => void;
}

export function DisruptiveActionModal(props: Props) {
  const { entityName, action, activeProcesses, onConfirmDrain, onConfirmForce, onCancel } = props;
  const drainTimeout = 180;

  const actionTitles: Record<string, string> = {
    reboot: "Перезагрузка ноды", // i18n-ignore
    restart: "Перезапуск контейнера", // i18n-ignore
    delete: "Удаление контейнера", // i18n-ignore
    upgrade: "Обновление системы", // i18n-ignore
  };
  const title = actionTitles[action] || action;

  return (
    <div className="scrim" onClick={onCancel}>
      <section
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "580px",
          maxWidth: "100%",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div className="dialog-head" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--red)", display: "inline-flex" }}>
              <Alert size={20} />
            </span>
            <div className="dialog-title">
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--ink)" }}>
                {title}: {entityName} {/* i18n-ignore */}
              </h2>
            </div>
          </div>
          <button type="button" className="icon-button small" onClick={onCancel} aria-label="Закрыть" /* i18n-ignore */>
            <Close size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {activeProcesses.length > 0 ? (
            <>
              <div style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "var(--amber-tint)",
                border: "1px solid var(--amber-ring)",
                color: "var(--amber-ink)",
                fontSize: 13,
              }}>
                <strong>Обнаружены активные вложенные процессы! {/* i18n-ignore */}</strong>
                <p style={{ margin: "4px 0 0 0", fontSize: 12 }}>
                  Прямо сейчас в терминалах выполняются задачи. Немедленная операция прервет их и может привести к повреждению данных. {/* i18n-ignore */}
                </p>
              </div>

              <div>
                <span style={{ fontSize: 12, color: "var(--dim)", display: "block", marginBottom: 6 }}>
                  Список запущенных процессов: {/* i18n-ignore */}
                </span>
                <div style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--raised)",
                }}>
                  {activeProcesses.map((p, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px 12px",
                        borderBottom: idx < activeProcesses.length - 1 ? "1px solid var(--line)" : "none",
                        fontSize: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <strong style={{ color: "var(--ink)" }}>{p.terminal_name}</strong>
                        <span style={{ color: "var(--dim)", marginLeft: 6 }}>
                          ({p.user_name}) {/* i18n-ignore */}
                        </span>
                        <code style={{ display: "block", marginTop: 2, color: "var(--blue)" }}>
                          {p.command} {/* i18n-ignore */}
                        </code>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--faint)" }}>
                        {p.running_since.slice(11, 19)} {/* i18n-ignore */}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  className="button-accent"
                  onClick={() => onConfirmDrain(drainTimeout)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <span style={{ display: "inline-flex" }}><Lock size={15} /></span>
                  🛡️ Дождаться завершения (Graceful Drain) — заблокировать ввод {/* i18n-ignore */}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <button
                    type="button"
                    className="button-danger-line small"
                    onClick={onConfirmForce}
                  >
                    ⚡ Принудительно (Force Kill) {/* i18n-ignore */}
                  </button>
                  <button type="button" className="button-plain small" onClick={onCancel}>
                    Отмена {/* i18n-ignore */}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, margin: "4px 0 16px 0", color: "var(--ink)" }}>
                Активных запущенных процессов не обнаружено. Операция <strong>{title} {/* i18n-ignore */}</strong> для <strong>{entityName} {/* i18n-ignore */}</strong> безопасна для выполнения. {/* i18n-ignore */}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="button-plain small" onClick={onCancel}>
                  Отмена {/* i18n-ignore */}
                </button>
                <button type="button" className="button-accent small" onClick={onConfirmForce}>
                  Подтвердить {/* i18n-ignore */}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
