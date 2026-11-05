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
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div className="dialog-head">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#ef4444", display: "inline-flex" }}><Alert size={18} /></span>
            {title}: {entityName} {/* i18n-ignore */}
          </h3>
          <button type="button" className="button-ghost small" onClick={onCancel}>
            <Close size={15} />
          </button>
        </div>

        <div className="dialog-body" style={{ padding: "16px 20px" }}>
          {activeProcesses.length > 0 ? (
            <>
              <div style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "#fbbf24",
                fontSize: 13,
                marginBottom: 14
              }}>
                <strong>Обнаружены активные вложенные процессы! {/* i18n-ignore */}</strong>
                <p style={{ margin: "4px 0 0 0", fontSize: 12 }}>
                  Прямо сейчас в терминалах выполняются задачи. Немедленная операция прервет их и может привести к повреждению данных. {/* i18n-ignore */}
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 6 }}>
                  Список запущенных процессов: {/* i18n-ignore */}
                </span>
                <div style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.3)"
                }}>
                  {activeProcesses.map((p, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px 12px",
                        borderBottom: idx < activeProcesses.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        fontSize: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <strong>{p.terminal_name}</strong>
                        <span style={{ color: "var(--color-text-secondary, #888)", marginLeft: 6 }}>
                          ({p.user_name}) {/* i18n-ignore */}
                        </span>
                        <code style={{ display: "block", marginTop: 2, color: "#93c5fd" }}>
                          {p.command} {/* i18n-ignore */}
                        </code>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--color-text-dim, #777)" }}>
                        {p.running_since.slice(11, 19)} {/* i18n-ignore */}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                  <button type="button" className="button-ghost small" onClick={onCancel}>
                    Отмена {/* i18n-ignore */}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, marginBottom: 16 }}>
                Активных запущенных процессов не обнаружено. Операция <strong>{title} {/* i18n-ignore */}</strong> для <strong>{entityName} {/* i18n-ignore */}</strong> безопасна для выполнения. {/* i18n-ignore */}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="button-ghost" onClick={onCancel}>
                  Отмена {/* i18n-ignore */}
                </button>
                <button type="button" className="button-accent" onClick={onConfirmForce}>
                  Подтвердить {/* i18n-ignore */}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
