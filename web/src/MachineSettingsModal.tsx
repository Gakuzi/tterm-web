// Modal for machine settings and Many-to-Many project delegation.
// Allows binding/unbinding a machine to/from multiple projects with RBAC checks:
// only users with 'owner' or 'admin' roles can attach or detach machines.

import { useEffect, useState } from "react";
import type { Machine, Project, Role } from "./api";
import { bindMachineToProject, getMachineProjects, unbindMachineFromProject } from "./api";
import { colorClass } from "./colors";
import { useT } from "./i18n";
import { Check, Close, Computer, Layers, Lock, Server, Warning } from "./icons";
import { canManage } from "./Machines";
import { lastSeen } from "./time";

interface MachineSettingsModalProps {
  machine: Machine | null;
  currentProject?: Project | null;
  allProjects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

const ROLE_LABELS: Record<Role, string> = {
  // i18n-ignore
  owner: "Владелец",
  // i18n-ignore
  admin: "Администратор",
  // i18n-ignore
  member: "Участник",
  // i18n-ignore
  observer: "Наблюдатель",
};

export function MachineSettingsModal(props: MachineSettingsModalProps) {
  const { machine, currentProject, allProjects, isOpen, onClose, onRefresh } = props;
  const t = useT();
  const [boundProjectIds, setBoundProjectIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Check if user has administrative rights on the source machine / current project
  const sourceProjectRole = currentProject?.role ?? (allProjects.find((p) => p.machines.some((m) => m.id === machine?.id))?.role || "member");
  const canManageMachine = canManage(sourceProjectRole);

  useEffect(() => {
    if (!isOpen || !machine) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    getMachineProjects(machine.id)
      .then((list) => {
        const ids = new Set(list.map((x) => x.project_id));
        // If current project exists and not yet in list, ensure it's recorded
        if (currentProject && !ids.has(currentProject.id)) {
          ids.add(currentProject.id);
        }
        setBoundProjectIds(ids);
      })
      .catch(() => {
        // i18n-ignore
        setErrorMessage("Не удалось загрузить список проектов машины");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, machine, currentProject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !machine) return null;

  const computer = machine.kind === "computer";
  const offline = computer && !machine.online;
  const passport = machine.passport || {};

  const toggleProject = async (p: Project) => {
    if (!canManageMachine) {
      // i18n-ignore
      setErrorMessage("У вас нет прав администратора для управления этой машиной.");
      return;
    }
    if (!canManage(p.role)) {
      // i18n-ignore
      setErrorMessage(`Требуются права администратора или владельца в проекте «${p.name}».`);
      return;
    }

    setBusyProjectId(p.id);
    setErrorMessage(null);
    setStatusMessage(null);

    const isBound = boundProjectIds.has(p.id);
    try {
      if (isBound) {
        // Prevent detaching if it's the only bound project
        if (boundProjectIds.size <= 1) {
          // i18n-ignore
          setErrorMessage("Машина должна быть привязана хотя бы к одному проекту.");
          setBusyProjectId(null);
          return;
        }
        const ok = await unbindMachineFromProject(machine.id, p.id);
        if (ok) {
          setBoundProjectIds((prev) => {
            const next = new Set(prev);
            next.delete(p.id);
            return next;
          });
          // i18n-ignore
          setStatusMessage(`Машина отключена от проекта «${p.name}»`);
        } else {
          // i18n-ignore
          setErrorMessage("Ошибка при отключении машины от проекта.");
        }
      } else {
        const ok = await bindMachineToProject(machine.id, p.id, p.name);
        if (ok) {
          setBoundProjectIds((prev) => new Set(prev).add(p.id));
          // i18n-ignore
          setStatusMessage(`Машина успешно подключена к проекту «${p.name}»`);
        } else {
          // i18n-ignore
          setErrorMessage("Ошибка при подключении машины к проекту.");
        }
      }
      onRefresh?.();
    } catch (err: any) {
      // i18n-ignore
      setErrorMessage(err?.message || "Ошибка при изменении привязки проекта");
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backdropFilter: "blur(4px)",
        padding: "16px",
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-primary, #18181b)",
          border: "1px solid var(--color-border, #333)",
          borderRadius: "14px",
          padding: "24px",
          width: "560px",
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(56, 189, 248, 0.12)",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {computer ? <Computer size={22} /> : <Server size={22} />}
            </span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                {machine.name}
                {machine.shared && (
                  <span
                    style={{
                      fontSize: 11,
                      background: "rgba(56, 189, 248, 0.18)",
                      color: "#38bdf8",
                      padding: "2px 7px",
                      borderRadius: 4,
                      fontWeight: 500,
                    }}
                  >
                    {/* i18n-ignore */}
                    Общая
                  </span>
                )}
              </h2>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary, #999)", marginTop: 2 }}>
                {/* i18n-ignore */}
                {[machine.os, machine.host].filter(Boolean).join(" · ") || (computer ? "Компьютер" : "Сервер")}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="button-ghost small"
            onClick={onClose}
            style={{ padding: "6px 8px", borderRadius: 8 }}
            // i18n-ignore
            aria-label="Закрыть"
          >
            <Close size={18} />
          </button>
        </div>

        {/* Machine Stats Summary */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: 10,
            padding: "12px 14px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "10px",
            fontSize: 12,
          }}
        >
          <div>
            {/* i18n-ignore */}
            <div style={{ color: "var(--color-text-secondary, #888)", fontSize: 11 }}>Состояние</div>
            <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: offline ? "#ef4444" : "#22c55e",
                  display: "inline-block",
                }}
              />
              {/* i18n-ignore */}
              {computer
                ? offline
                  ? machine.lastSeen
                    // i18n-ignore
                    ? `Был ${lastSeen(machine.lastSeen, t)}`
                    // i18n-ignore
                    : "Не в сети"
                  // i18n-ignore
                  : "В сети"
                // i18n-ignore
                : "Сервер подключен"}
            </div>
          </div>
          {passport.arch && (
            <div>
              {/* i18n-ignore */}
              <div style={{ color: "var(--color-text-secondary, #888)", fontSize: 11 }}>Архитектура</div>
              <div style={{ fontWeight: 500, marginTop: 2 }}>{passport.arch}</div>
            </div>
          )}
          {passport.shell && (
            <div>
              {/* i18n-ignore */}
              <div style={{ color: "var(--color-text-secondary, #888)", fontSize: 11 }}>Оболочка (Shell)</div>
              <div style={{ fontWeight: 500, marginTop: 2 }}>{passport.shell}</div>
            </div>
          )}
          {passport.user && (
            <div>
              {/* i18n-ignore */}
              <div style={{ color: "var(--color-text-secondary, #888)", fontSize: 11 }}>Пользователь</div>
              <div style={{ fontWeight: 500, marginTop: 2 }}>{passport.user}</div>
            </div>
          )}
        </div>

        {/* Access Warning if not admin */}
        {!canManageMachine && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(234, 179, 8, 0.12)",
              border: "1px solid rgba(234, 179, 8, 0.3)",
              color: "#fbbf24",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            <span style={{ flexShrink: 0, display: "flex" }}>
              <Lock size={16} />
            </span>
            {/* i18n-ignore */}
            <span>
              {/* i18n-ignore */}
              У вашей роли ({ROLE_LABELS[sourceProjectRole]}) недостаточно прав. Изменять привязку машины могут только администраторы.
            </span>
          </div>
        )}

        {/* Project Multi-Binding Section */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "#38bdf8", display: "flex" }}>
              <Layers size={16} />
            </span>
            {/* i18n-ignore */}
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              {/* i18n-ignore */}
              Привязка к проектам (Many-to-Many)
            </h3>
          </div>
          {/* i18n-ignore */}
          <p style={{ fontSize: 12, color: "var(--color-text-secondary, #999)", margin: "0 0 12px 0", lineHeight: 1.4 }}>
            {/* i18n-ignore */}
            Машина может работать сразу в нескольких проектах. Терминалы и ветки разработки изолированы и принадлежат только проекту, в котором они были запущены.
          </p>

          {/* Project List with RBAC badges */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "260px", overflowY: "auto" }}>
            {allProjects.map((p) => {
              const isBound = boundProjectIds.has(p.id);
              const userRole = p.role;
              const isProjectAdmin = canManage(userRole);
              const isBusy = busyProjectId === p.id;
              const isDisabled = !canManageMachine || !isProjectAdmin || isBusy || loading;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (!isDisabled) toggleProject(p);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: isBound ? "rgba(56, 189, 248, 0.08)" : "rgba(255, 255, 255, 0.02)",
                    border: isBound ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid rgba(255, 255, 255, 0.07)",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    opacity: isDisabled && !isBound ? 0.6 : 1,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isBound}
                      disabled={isDisabled}
                      onChange={() => {}} // handled by parent div onClick
                      style={{
                        cursor: isDisabled ? "not-allowed" : "pointer",
                        accentColor: "#38bdf8",
                        width: 16,
                        height: 16,
                      }}
                    />
                    <span className={`code-badge ${colorClass(p.color)}`} style={{ fontSize: 11, padding: "2px 7px" }}>
                      {p.code}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={{ fontWeight: isBound ? 600 : 400, fontSize: 13, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      {/* i18n-ignore */}
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                        {/* i18n-ignore */}
                        Ваша роль: <span style={{ color: isProjectAdmin ? "#38bdf8" : "#aaa", fontWeight: 500 }}>{ROLE_LABELS[userRole]}</span>
                        {/* i18n-ignore */}
                        {!isProjectAdmin && " (недостаточно прав для привязки)"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isBusy ? (
                      // i18n-ignore
                      <span style={{ fontSize: 11, color: "#38bdf8" }}>Сохранение...</span>
                    ) : isBound ? (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#38bdf8",
                          background: "rgba(56, 189, 248, 0.12)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontWeight: 500,
                        }}
                      >
                        {/* i18n-ignore */}
                        Подключено
                      </span>
                    ) : isProjectAdmin ? (
                      // i18n-ignore
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary, #777)" }}>
                        {/* i18n-ignore */}
                        Доступно
                      </span>
                    ) : (
                      <span
                        // i18n-ignore
                        title="Требуются права администратора или владельца"
                        style={{
                          fontSize: 11,
                          color: "#ef4444",
                          background: "rgba(239, 68, 68, 0.1)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {/* i18n-ignore */}
                        Нет прав
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status / Error Notifications */}
        {errorMessage && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Warning size={14} />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#4ade80",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Check size={14} />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          {/* i18n-ignore */}
          <button type="button" className="button-plain small" onClick={onClose}>
            {/* i18n-ignore */}
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
