import { useState, useEffect } from "react";
import { Check, Close, Lock, Mail } from "./icons";
import { useBriefly } from "./briefly";

export interface ActiveDrainLock {
  id: string;
  entityType: string;
  entityName: string;
  initiatorName: string;
  action: string;
  timeoutSeconds: number;
  createdAt: string;
}

interface Props {
  lock: ActiveDrainLock;
  terminalId: string;
  onAppealSubmit?: (lockId: string, reason: string) => Promise<boolean>;
}

export function HierarchicalLockBanner({ lock, onAppealSubmit }: Props) {
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [appealSent, showAppealSent] = useBriefly<boolean>();
  const [secondsLeft, setSecondsLeft] = useState(lock.timeoutSeconds || 180);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSendAppeal = async () => {
    if (!reason.trim()) return;
    setSending(true);
    try {
      if (onAppealSubmit) {
        await onAppealSubmit(lock.id, reason);
      }
      showAppealSent(true);
      setShowAppealModal(false);
      setReason("");
    } catch {
      // Ignore
    } finally {
      setSending(false);
    }
  };

  const actionLabels: Record<string, string> = {
    reboot: "перезагрузку хоста", // i18n-ignore
    restart: "перезапуск контейнера", // i18n-ignore
    delete: "удаление контейнера", // i18n-ignore
    upgrade: "плановое обновление", // i18n-ignore
    maintenance: "техническое обслуживание", // i18n-ignore
  };
  const actionText = actionLabels[lock.action] || lock.action;

  return (
    <>
      <div style={{
        margin: "6px 0 10px 0",
        padding: "10px 14px",
        borderRadius: "8px",
        background: "rgba(239, 68, 68, 0.12)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 12,
        color: "#fca5a5"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#ef4444", display: "inline-flex" }}><Lock size={15} /></span>
          <span>
            <strong>Ввод команд заблокирован: {/* i18n-ignore */}</strong>
            Администратор <strong>{lock.initiatorName} {/* i18n-ignore */}</strong> инициировал {actionText} на {lock.entityName}. {/* i18n-ignore */}
            Ожидание окончания текущих задач ({Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, "0")}). {/* i18n-ignore */}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {appealSent ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#10b981", fontSize: 11 }}>
              <span style={{ display: "inline-flex" }}><Check size={13} /></span>
              Запрос отправлен {/* i18n-ignore */}
            </span>
          ) : (
            <button
              type="button"
              className="button-plain small"
              onClick={() => setShowAppealModal(true)}
              style={{ padding: "4px 8px", fontSize: 11 }}
            >
              <span style={{ display: "inline-flex", marginRight: 4 }}><Mail size={12} /></span>
              Написать руководителю {/* i18n-ignore */}
            </button>
          )}
        </div>
      </div>

      {showAppealModal && (
        <div className="dialog-overlay" onClick={() => setShowAppealModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="dialog-head">
              <h3>Запрос отсрочки руководителю {/* i18n-ignore */}</h3>
              <button type="button" className="button-ghost small" onClick={() => setShowAppealModal(false)}>
                <Close size={15} />
              </button>
            </div>
            <div className="dialog-body" style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", marginBottom: 12 }}>
                Руководитель <strong>{lock.initiatorName} {/* i18n-ignore */}</strong> выполняет {actionText}. Опишите причину, почему требуется дополнительное время для завершения вашего процесса. {/* i18n-ignore */}
              </p>
              <textarea
                className="input-text"
                rows={3}
                placeholder="Например: Идет критическая миграция БД, требуется еще 3 минуты..." /* i18n-ignore */
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: "100%", fontSize: 12, marginBottom: 14 }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="button-ghost small" onClick={() => setShowAppealModal(false)}>
                  Отмена {/* i18n-ignore */}
                </button>
                <button
                  type="button"
                  className="button-accent small"
                  disabled={!reason.trim() || sending}
                  onClick={handleSendAppeal}
                >
                  {sending ? "Отправка..." /* i18n-ignore */ : "Отправить руководителю" /* i18n-ignore */}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
