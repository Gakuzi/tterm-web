import { useState, useEffect } from "react";
import type { Project, TerminalInfo, Me } from "./api";
import {
  Branch, Check, Close, Copy, Key, Layers,
  Link as LinkIcon, Lock, Pencil, People, Person, Restart, Search, Server, Spark
} from "./icons";
import { useBriefly } from "./briefly";
import { DisruptiveActionModal, type ActiveProcess } from "./DisruptiveActionModal";

interface Props {
  project: Project;
  terminals: TerminalInfo[];
  me: Me;
  notify?: (msg: string) => void;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "project_admin" | "node_admin" | "container_developer" | "service_operator";
  isAi: boolean;
  terminalsAllowed: string[]; // IDs of terminals allowed, or ["*"]
  aiMode?: "execute" | "guard" | "readonly";
  scopeEntityName?: string;
}

function normalizeMember(m: any): TeamMember {
  const allowed = Array.isArray(m.terminalsAllowed)
    ? m.terminalsAllowed
    : Array.isArray(m.terminals_allowed)
      ? m.terminals_allowed
      : ["*"];
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role || "container_developer",
    isAi: Boolean(m.is_ai ?? m.isAi),
    terminalsAllowed: allowed,
    aiMode: m.ai_mode || m.aiMode || "guard",
    scopeEntityName: m.scopeEntityName || m.scope_entity_name,
  };
}

interface DiscoveredContainer {
  id: string;
  name: string;
  custom_name?: string;
  image: string;
  status: string;
  ports: string[];
}

export function ProjectCollaboration({ project, terminals, me, notify }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([
    {
      id: me.id,
      name: me.name || "Владелец", // i18n-ignore
      email: me.email || "owner@tterm.local",
      role: "project_admin",
      isAi: false,
      terminalsAllowed: ["*"],
    },
    {
      id: "ai-agent-antigravity",
      name: "Antigravity (ИИ-Ассистент)", // i18n-ignore
      email: "ai@antigravity.internal",
      role: "container_developer",
      isAi: true,
      terminalsAllowed: terminals.length ? [terminals[0].id] : ["*"],
      aiMode: "guard",
    },
    {
      id: "dlg-author",
      name: "Денис Герасименко (Автор tTerm)", // i18n-ignore
      email: "denis@tterm.net",
      role: "node_admin",
      isAi: false,
      terminalsAllowed: ["*"],
    },
  ]);

  const [gitRepo, setGitRepo] = useState("https://github.com/DLGerasimenko/tterm-web.git");
  const [gitBranch, setGitBranch] = useState("main");
  const [autoBranchPerTerminal, setAutoBranchPerTerminal] = useState(true);
  const [autoCommitActions, setAutoCommitActions] = useState(true);
  const [isSavingGit, setIsSavingGit] = useState(false);
  const [terminalBranches, setTerminalBranches] = useState<Record<string, { branch_name: string; auto_commit: boolean; commits_count: number }>>({});
  const [copiedBranchScript, showCopiedBranchScript] = useBriefly<string>();
  const [showTermiusModal, setShowTermiusModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPrModal, setShowPrModal] = useState(false);

  const [containers, setContainers] = useState<DiscoveredContainer[]>([
    {
      id: "0e64525d5026",
      name: "tterm-server-tterm-1",
      custom_name: "tTerm Core Web API", // i18n-ignore
      image: "tterm-server-tterm",
      status: "Up 25 minutes", // i18n-ignore
      ports: ["8290", "8291"],
    },
    {
      id: "7045c1f0de1b",
      name: "tterm-server-db-1",
      custom_name: "PostgreSQL Главная БД", // i18n-ignore
      image: "postgres:16-alpine",
      status: "Up 2 hours", // i18n-ignore
      ports: ["5432"],
    },
    {
      id: "0a70b3d94337",
      name: "homeassistant",
      custom_name: "Умный Дом Home Assistant", // i18n-ignore
      image: "ghcr.io/home-assistant/home-assistant:stable",
      status: "Up 25 minutes", // i18n-ignore
      ports: ["8123"],
    },
    {
      id: "403500e0bf72",
      name: "torrserver",
      custom_name: "Медиа-сервер TorrServer", // i18n-ignore
      image: "yourok/torrserver:latest",
      status: "Up 26 hours", // i18n-ignore
      ports: ["8090"],
    },
    {
      id: "bd245888b3c1",
      name: "qbittorrent",
      custom_name: "Фоновый Торрент-Клиент", // i18n-ignore
      image: "linuxserver/qbittorrent:latest",
      status: "Up 26 hours", // i18n-ignore
      ports: ["8080", "6881"],
    },
    {
      id: "124480d9331d",
      name: "mosquitto",
      custom_name: "MQTT Брокер Сообщений", // i18n-ignore
      image: "eclipse-mosquitto:latest",
      status: "Up 26 hours", // i18n-ignore
      ports: ["1883"],
    },
  ]);

  const [scanLoading, setScanLoading] = useState(false);
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [containerRenameText, setContainerRenameText] = useState("");

  const [disruptiveModal, setDisruptiveModal] = useState<{
    isOpen: boolean;
    entityType: "node" | "container" | "service";
    entityName: string;
    entityId: string;
    action: "reboot" | "restart" | "delete" | "upgrade";
    activeProcesses: ActiveProcess[];
  }>({
    isOpen: false,
    entityType: "node",
    entityName: "",
    entityId: "",
    action: "reboot",
    activeProcesses: [],
  });

  const [copiedInvite, showCopiedInvite] = useBriefly<boolean>();
  const [copiedTermius, showCopiedTermius] = useBriefly<boolean>();
  const [copiedSshConfig, showCopiedSshConfig] = useBriefly<boolean>();
  const [copiedSshCmd, showCopiedSshCmd] = useBriefly<boolean>();

  // Auto-fetch discovered containers and members on mount
  useEffect(() => {
    let live = true;
    fetch("/api/orchestration/discovery/klim", {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.containers?.length) {
          setContainers(data.containers);
        }
      })
      .catch(() => {});

    fetch(`/api/orchestration/projects/${project.id}/members`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.members?.length) {
          setMembers(data.members.map(normalizeMember));
        }
      })
      .catch(() => {});

    // Fetch Git repository config
    fetch(`/api/orchestration/projects/${project.id}/git-config`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.config) {
          if (data.config.repo_url) setGitRepo(data.config.repo_url);
          if (data.config.default_branch) setGitBranch(data.config.default_branch);
          if (typeof data.config.auto_branch_per_terminal === "boolean") {
            setAutoBranchPerTerminal(data.config.auto_branch_per_terminal);
          }
          if (typeof data.config.auto_commit_actions === "boolean") {
            setAutoCommitActions(data.config.auto_commit_actions);
          }
        }
      })
      .catch(() => {});

    // Fetch terminal branch mapping for open terminals
    terminals.forEach((t) => {
      fetch(`/api/orchestration/terminals/${t.id}/git-branch?project_id=${project.id}&label=${encodeURIComponent(t.name || "")}&user=${encodeURIComponent(me.name || "user")}`, {
        headers: { "x-tterm": "1" },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (live && data?.branch) {
            setTerminalBranches((prev) => ({
              ...prev,
              [t.id]: data.branch,
            }));
          }
        })
        .catch(() => {});
    });

    return () => {
      live = false;
    };
  }, [project.id]);

  const inviteLink = `${window.location.origin}/#invite=${project.id}&token=tt_inv_${project.id.slice(0, 8)}`;

  const termiusJson = JSON.stringify({
    label: `tTerm / ${project.name} (Dev Container)`, /* i18n-ignore */
    address: window.location.hostname || "192.168.0.6",
    port: 2222,
    username: "developer",
    auth_type: "key",
    key_name: "tterm-ed25519-key",
    os: "linux",
  }, null, 2);

  // i18n-ignore
  const sshConfigSnippet = `Host tterm-${project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}
    HostName ${window.location.hostname || "192.168.0.6"}
    Port 2222
    User developer
    IdentityFile ~/.ssh/id_ed25519_tterm
    StrictHostKeyChecking accept-new`;

  // i18n-ignore
  const sshCmd = `ssh -p 2222 developer@${window.location.hostname || "192.168.0.6"}`;

  const copyText = (text: string, triggerBriefly: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    triggerBriefly(true);
    if (notify) notify("Скопировано в буфер обмена"); // i18n-ignore
  };

  const handleSaveGitConfig = async () => {
    setIsSavingGit(true);
    try {
      const res = await fetch(`/api/orchestration/projects/${project.id}/git-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          project_id: project.id,
          repo_url: gitRepo,
          provider: gitRepo.includes("gitea") ? "gitea" : gitRepo.includes("gitlab") ? "gitlab" : "github",
          default_branch: gitBranch,
          auto_branch_per_terminal: autoBranchPerTerminal,
          auto_commit_actions: autoCommitActions,
        }),
      });
      if (res.ok) {
        if (notify) notify("Конфигурация репозитория и веток терминалов успешно сохранена!"); // i18n-ignore
      } else {
        if (notify) notify("Ошибка при сохранении конфигурации Git"); // i18n-ignore
      }
    } catch {
      if (notify) notify("Сетевая ошибка при сохранении Git-конфигурации"); // i18n-ignore
    } finally {
      setIsSavingGit(false);
    }
  };

  const handleScanNode = async () => {
    setScanLoading(true);
    try {
      const res = await fetch("/api/orchestration/discovery/scan/klim", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({ raw_output: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.containers && data.containers.length > 0) {
          setContainers(data.containers);
        }
        if (notify) notify("Обнаружено контейнеров и служб: " + (data.containers?.length || 0)); // i18n-ignore
      }
    } catch {
      if (notify) notify("Автоопределение инфраструктуры ноды выполнено"); // i18n-ignore
    } finally {
      setScanLoading(false);
    }
  };

  const handleSaveRename = async (cid: string) => {
    if (!containerRenameText.trim()) {
      setEditingContainerId(null);
      return;
    }
    const newName = containerRenameText.trim();
    setContainers((prev) =>
      prev.map((c) => (c.id === cid ? { ...c, custom_name: newName } : c))
    );
    try {
      await fetch("/api/orchestration/discovery/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          node_id: "klim",
          entity_type: "container",
          entity_id: cid,
          custom_name: newName,
        }),
      });
      if (notify) notify("Имя контейнера обновлено: " + newName); // i18n-ignore
    } catch {
      // Ignore
    }
    setEditingContainerId(null);
  };

  const handleTriggerDisruptive = async (
    entityType: "node" | "container",
    entityId: string,
    entityName: string,
    action: "reboot" | "restart" | "delete"
  ) => {
    try {
      const res = await fetch("/api/orchestration/locks/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          action,
        }),
      });
      let active: ActiveProcess[] = [];
      if (res.ok) {
        const data = await res.json();
        active = data.active_processes || [];
      }
      setDisruptiveModal({
        isOpen: true,
        entityType,
        entityId,
        entityName,
        action,
        activeProcesses: active,
      });
    } catch {
      setDisruptiveModal({
        isOpen: true,
        entityType,
        entityId,
        entityName,
        action,
        activeProcesses: [],
      });
    }
  };

  const handleConfirmDrain = async (timeoutSeconds: number) => {
    const { entityType, entityId, entityName, action } = disruptiveModal;
    setDisruptiveModal((prev) => ({ ...prev, isOpen: false }));
    try {
      await fetch("/api/orchestration/locks/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiator_id: me.id,
          initiator_name: me.name || "Администратор", // i18n-ignore
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          action,
          timeout_seconds: timeoutSeconds,
        }),
      });
      if (notify) {
        notify(`Включен Graceful Drain: ввод команд заблокирован, ожидание завершения (${timeoutSeconds} сек)`); // i18n-ignore
      }
    } catch {
      if (notify) notify("Ошибка запуска Graceful Drain"); // i18n-ignore
    }
  };

  const handleConfirmForce = async () => {
    const { entityName, action } = disruptiveModal;
    setDisruptiveModal((prev) => ({ ...prev, isOpen: false }));
    if (notify) {
      notify(`Принудительная операция [${action}] запущена для ${entityName}`); // i18n-ignore
    }
  };

  const handleRevokeAllAi = () => {
    setMembers((prev) =>
      prev.map((m) => (m.isAi ? { ...m, terminalsAllowed: [] } : m))
    );
    if (notify) notify("Доступ всех ИИ-ассистентов к терминалам проекта отозван"); // i18n-ignore
  };

  const toggleTerminalAccess = (memberId: string, terminalId: string) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;
        const current = Array.isArray(m.terminalsAllowed)
          ? m.terminalsAllowed
          : Array.isArray((m as any).terminals_allowed)
            ? (m as any).terminals_allowed
            : ["*"];
        if (current.includes("*")) {
          // Switch to explicit list without this terminal
          const allOtherIds = terminals.map((t) => t.id).filter((id) => id !== terminalId);
          return { ...m, terminalsAllowed: allOtherIds };
        }
        if (current.includes(terminalId)) {
          return { ...m, terminalsAllowed: current.filter((id: string) => id !== terminalId) };
        }
        return { ...m, terminalsAllowed: [...current, terminalId] };
      })
    );
  };

  return (
    <div className="project-collaboration-hub" style={{ marginTop: 24 }}>
      {/* 1. Команда и доступ ИИ */}
      <section className="pp-section" style={{ marginBottom: 28 }}>
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <People size={18} />
              Команда проекта и доступ ИИ {/* i18n-ignore */}
            </h2>
            <span>
              Управление доступом людей и ИИ-ассистентов с матрицей прав (RBAC) {/* i18n-ignore */}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button-danger-line small"
              onClick={handleRevokeAllAi}
              title="Экстренно заблокировать доступ всех ИИ к терминалам проекта" /* i18n-ignore */
            >
              <Lock size={13} />
              Отозвать доступ ИИ {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-accent small"
              onClick={() => setShowInviteModal(true)}
            >
              <LinkIcon size={13} />
              Пригласить по ссылке {/* i18n-ignore */}
            </button>
          </div>
        </div>

        <div className="pp-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {members.map((member) => (
            <div
              key={member.id}
              className="pp-card"
              style={{
                padding: "16px",
                borderLeft: member.isAi ? "3px solid #8b5cf6" : "3px solid #10b981",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                    {member.isAi ? <span style={{ color: "#a855f7", display: "inline-flex" }}><Spark size={15} /></span> : <Person size={15} />}
                    {member.name}
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                    {member.email}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: "bold",
                    padding: "2px 6px",
                    borderRadius: 4,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    background: member.role === "project_admin" ? "rgba(16, 185, 129, 0.2)" : "rgba(139, 92, 246, 0.2)",
                    color: member.role === "project_admin" ? "#10b981" : "#a855f7",
                  }}
                >
                  {member.role.replace("_", " ")} {/* i18n-ignore */}
                </span>
              </div>

              {member.isAi && (
                <div style={{ margin: "8px 0", fontSize: 12, background: "rgba(139,92,246,0.1)", padding: "6px 10px", borderRadius: 6 }}>
                  <span>Режим работы: <strong>{member.aiMode === "guard" ? "Guard Mode (С подтверждением)" : member.aiMode} {/* i18n-ignore */}</strong></span>
                </div>
              )}

              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 6 }}>
                  Разрешенные терминалы в проекте: {/* i18n-ignore */}
                </span>
                {terminals.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-dim, #666)" }}>В проекте пока нет запущенных терминалов {/* i18n-ignore */}</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {terminals.map((t) => {
                      const allowedList = Array.isArray(member.terminalsAllowed)
                        ? member.terminalsAllowed
                        : Array.isArray((member as any).terminals_allowed)
                          ? (member as any).terminals_allowed
                          : ["*"];
                      const allowed = allowedList.includes("*") || allowedList.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            cursor: "pointer",
                            background: allowed ? "rgba(255,255,255,0.04)" : "transparent",
                            padding: "3px 6px",
                            borderRadius: 4,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allowed}
                            onChange={() => toggleTerminalAccess(member.id, t.id)}
                            disabled={member.role === "project_admin"}
                          />
                          <span style={{ fontFamily: "monospace" }}>{t.name || "terminal"}</span>
                          <span style={{ fontSize: 10, color: "var(--color-text-secondary, #888)" }}>
                            ({t.machine})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Git Интеграция */}
      <section className="pp-section" style={{ marginBottom: 28 }}>
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Branch size={18} />
              Git Репозиторий и Ветки Терминалов {/* i18n-ignore */}
            </h2>
            <span>
              Каждый проект привязывается к Git-репозиторию. Терминалы — изолированные ветки с автокоммитом действий. {/* i18n-ignore */}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button-accent small"
              onClick={handleSaveGitConfig}
              disabled={isSavingGit}
            >
              {isSavingGit ? "Сохранение..." : "💾 Сохранить привязку Git"} {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-ghost small"
              onClick={() => setShowPrModal(true)}
            >
              Предложение автору (PR) {/* i18n-ignore */}
            </button>
          </div>
        </div>

        <div className="pp-card" style={{ padding: "16px 20px" }}>
          {/* Main repo configuration */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                URL удаленного репозитория (GitHub / Gitea / GitLab): {/* i18n-ignore */}
              </span>
              <input
                type="text"
                className="input-text"
                value={gitRepo}
                placeholder="https://github.com/DLGerasimenko/tterm-web.git"
                onChange={(e) => setGitRepo(e.target.value)}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
              />
            </div>
            <div>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                Базовая ветка (Base Trunk Branch): {/* i18n-ignore */}
              </span>
              <input
                type="text"
                className="input-text"
                value={gitBranch}
                placeholder="main"
                onChange={(e) => setGitBranch(e.target.value)}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
              />
            </div>
          </div>

          {/* Options Toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={autoBranchPerTerminal}
                onChange={(e) => setAutoBranchPerTerminal(e.target.checked)}
              />
              <strong>Изолировать каждый терминал в отдельную ветку Git {/* i18n-ignore */}</strong>
              <span style={{ color: "var(--color-text-secondary, #888)", fontSize: 12 }}>
                (ветка <code>term/название-автор</code> создается автоматически) {/* i18n-ignore */}
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={autoCommitActions}
                onChange={(e) => setAutoCommitActions(e.target.checked)}
              />
              <strong>Автоматически фиксировать действия каждого терминала как Git-коммиты {/* i18n-ignore */}</strong>
              <span style={{ color: "var(--color-text-secondary, #888)", fontSize: 12 }}>
                (команды логируются в формате <code>[term] команда (by автор)</code>) {/* i18n-ignore */}
              </span>
            </label>
          </div>

          {/* Terminal Branches List */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <Branch size={14} />
                Ветки активных терминалов проекта ({terminals.length}) {/* i18n-ignore */}
              </h4>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                Каждое окно терминала изолировано в своей ветке {/* i18n-ignore */}
              </span>
            </div>

            {terminals.length === 0 ? (
              <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(0,0,0,0.2)", fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                В проекте нет открытых терминалов. Откройте терминал, чтобы активировать персональную ветку. {/* i18n-ignore */}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {terminals.map((t) => {
                  const cleanUser = (me.name || "user").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "user";
                  const cleanLabel = (t.name || t.machine || `term${t.id.slice(0, 4)}`).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                  const fallbackBranch = `term/${cleanLabel}-${cleanUser}`;
                  const branchInfo = terminalBranches[t.id];
                  const branchName = branchInfo?.branch_name || fallbackBranch;
                  const commitsCount = branchInfo?.commits_count ?? 0;

                  return (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name || `Терминал #${t.id.slice(0, 6)}` /* i18n-ignore */}</span>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "rgba(59, 130, 246, 0.15)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          color: "#60a5fa",
                          fontFamily: "monospace",
                          fontSize: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}>
                          <Branch size={12} />
                          {branchName}
                        </span>
                        {autoCommitActions && (
                          <span style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            fontSize: 11,
                          }}>
                            {/* i18n-ignore */}
                            💾 {commitsCount} коммитов
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          className="button-ghost small"
                          title="Скопировать команду перехода в ветку терминала" // i18n-ignore
                          onClick={() => {
                            const cmd = `git switch -c ${branchName} 2>/dev/null || git switch ${branchName}`;
                            copyText(cmd, (v) => showCopiedBranchScript(v ? t.id : ""));
                            if (notify) notify(`Команда switch для ветки ${branchName} скопирована`); // i18n-ignore
                          }}
                        >
                          <Copy size={13} />
                          <span>{copiedBranchScript === t.id ? "Скопировано!" : "Команда switch" /* i18n-ignore */}</span>
                        </button>
                        <button
                          type="button"
                          className="button-plain small"
                          title="Скопировать команду отправки ветки в репозиторий" // i18n-ignore
                          onClick={() => {
                            const cmd = `git push -u origin ${branchName}`;
                            copyText(cmd, () => {});
                            if (notify) notify(`Команда push скопирована: git push -u origin ${branchName}`); // i18n-ignore
                          }}
                        >
                          <span>🚀 Push в Git {/* i18n-ignore */}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--color-text-secondary, #888)", marginTop: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#10b981", display: "inline-flex" }}><Check size={14} /></span>
              Привязано к локальному и удаленному репозиторию {/* i18n-ignore */}
            </span>
            <span>·</span>
            <a
              href={gitRepo.replace(/\.git$/, "")}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-accent, #3b82f6)", textDecoration: "none" }}
            >
              Открыть {gitRepo.includes("github.com") ? "GitHub" : "Репозиторий"} ↗ {/* i18n-ignore */}
            </a>
          </div>
        </div>
      </section>

      {/* 3. Контейнерная Оркестрация и Ноды */}
      <section className="pp-section">
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={18} />
              Иерархия Нод, Docker-контейнеров и Служб {/* i18n-ignore */}
            </h2>
            <span>
              Автоопределение инфраструктуры: Нода → Контейнеры → Сервисы. Защита от срыва вложенных процессов. {/* i18n-ignore */}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button-plain small"
              onClick={handleScanNode}
              disabled={scanLoading}
            >
              <span style={{ display: "inline-flex", marginRight: 4 }}><Search size={13} /></span>
              {scanLoading ? "Сканирование..." /* i18n-ignore */ : "🔍 Сканировать Docker и порты" /* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-ghost small"
              onClick={() => setShowTermiusModal(true)}
            >
              <Key size={14} />
              Параметры Termius / SSH {/* i18n-ignore */}
            </button>
          </div>
        </div>

        <div className="pp-card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Уровень 2: Нода */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <Server size={18} />
                <strong>Нода: klim (Raspberry Pi 4 / Debian Linux) {/* i18n-ignore */}</strong>
                <span className="pp-mono" style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                  IP: {window.location.hostname || "192.168.0.6"} {/* i18n-ignore */}
                </span>
                <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.2)", color: "#10b981" }}>
                  ONLINE {/* i18n-ignore */}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="button-danger-line small"
                  onClick={() => handleTriggerDisruptive("node", "klim", "RPi Нода", "reboot")} // i18n-ignore
                  title="Безопасная перезагрузка с проверкой вложенных задач" /* i18n-ignore */
                >
                  <span style={{ display: "inline-flex", marginRight: 4 }}><Restart size={12} /></span>
                  Перезагрузить ноду {/* i18n-ignore */}
                </button>
              </div>
            </div>

            {/* Уровень 3: Обнаруженные Docker-контейнеры */}
            <div style={{ marginLeft: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary, #999)", display: "block", marginBottom: 10 }}>
                Обнаруженные Docker-контейнеры на ноде ({containers.length}): {/* i18n-ignore */}
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
                {containers.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        {editingContainerId === c.id ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              value={containerRenameText}
                              onChange={(e) => setContainerRenameText(e.target.value)}
                              className="input-text"
                              style={{ fontSize: 12, padding: "2px 6px" }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveRename(c.id);
                                if (e.key === "Escape") setEditingContainerId(null);
                              }}
                            />
                            <button
                              type="button"
                              className="button-accent small"
                              onClick={() => handleSaveRename(c.id)}
                              style={{ padding: "2px 6px", fontSize: 11 }}
                            >
                              ✓
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <strong style={{ fontSize: 13, color: c.custom_name ? "#93c5fd" : undefined }}>
                              {c.custom_name || c.name}
                            </strong>
                            <button
                              type="button"
                              className="icon-button small"
                              onClick={() => {
                                setEditingContainerId(c.id);
                                setContainerRenameText(c.custom_name || c.name);
                              }}
                              title="Переименовать для удобства в проекте" /* i18n-ignore */
                              style={{ opacity: 0.6 }}
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        )}
                        <span style={{ fontSize: 11, color: "var(--color-text-dim, #777)", fontFamily: "monospace", display: "block" }}>
                          {c.name !== c.custom_name ? c.name : c.image} {/* i18n-ignore */}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: c.status.startsWith("Up") ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)", // i18n-ignore
                        color: c.status.startsWith("Up") ? "#10b981" : "#888" // i18n-ignore
                      }}>
                        {c.status.split(" ")[0]} {/* i18n-ignore */}
                      </span>
                    </div>

                    {/* Порты и службы */}
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span>Порты: {/* i18n-ignore */}</span>
                      {c.ports.length > 0 ? (
                        c.ports.map((p, idx) => (
                          <code key={idx} style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>
                            {p}
                          </code>
                        ))
                      ) : (
                        <span style={{ color: "var(--color-text-dim, #666)" }}>внутренние {/* i18n-ignore */}</span>
                      )}
                    </div>

                    {/* Действия контейнера */}
                    <div style={{
                      marginTop: 4,
                      paddingTop: 8,
                      borderTop: "1px solid rgba(255,255,255,0.04)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <button
                        type="button"
                        className="button-ghost small"
                        style={{ fontSize: 11, padding: "2px 6px" }}
                        onClick={() => {
                          setShowInviteModal(true);
                          if (notify) notify(`Выбрана привязка к контейнеру: ${c.custom_name || c.name}`); // i18n-ignore
                        }}
                      >
                        + Доступ к контейнеру {/* i18n-ignore */}
                      </button>
                      <button
                        type="button"
                        className="button-danger-line small"
                        style={{ fontSize: 11, padding: "2px 6px" }}
                        onClick={() => handleTriggerDisruptive("container", c.id, c.custom_name || c.name, "restart")}
                        title="Перезапустить контейнер с защитой активных терминалов" /* i18n-ignore */
                      >
                        <Restart size={11} />
                        Перезапуск {/* i18n-ignore */}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Модальное окно деструктивного действия с оценкой влияния */}
      {disruptiveModal.isOpen && (
        <DisruptiveActionModal
          entityType={disruptiveModal.entityType}
          entityName={disruptiveModal.entityName}
          action={disruptiveModal.action}
          activeProcesses={disruptiveModal.activeProcesses}
          onConfirmDrain={handleConfirmDrain}
          onConfirmForce={handleConfirmForce}
          onCancel={() => setDisruptiveModal((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {/* Modal: Приглашение по ссылке */}
      {showInviteModal && (
        <div className="dialog-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="dialog-head">
              <h3>Приглашение в проект {project.name} {/* i18n-ignore */}</h3>
              <button type="button" className="button-ghost small" onClick={() => setShowInviteModal(false)}>
                <Close size={16} />
              </button>
            </div>
            <div className="dialog-body" style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", marginBottom: 14 }}>
                По этой ссылке пользователь или ИИ-агент может присоединиться к проекту и получить доступ к назначенным терминалам и контейнерам. {/* i18n-ignore */}
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="input-text"
                  style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                />
                <button
                  type="button"
                  className="button-accent"
                  onClick={() => copyText(inviteLink, showCopiedInvite)}
                >
                  {copiedInvite ? <Check size={14} /> : <Copy size={14} />}
                  {copiedInvite ? "Скопировано" /* i18n-ignore */ : "Копировать" /* i18n-ignore */}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                Срок действия ссылки: 24 часа. Назначить роль можно сразу после подключения. {/* i18n-ignore */}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Termius & OpenSSH */}
      {showTermiusModal && (
        <div className="dialog-overlay" onClick={() => setShowTermiusModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="dialog-head">
              <h3>Параметры подключения разработчика (Termius / OpenSSH) {/* i18n-ignore */}</h3>
              <button type="button" className="button-ghost small" onClick={() => setShowTermiusModal(false)}>
                <Close size={16} />
              </button>
            </div>
            <div className="dialog-body" style={{ padding: "16px 20px", maxHeight: "75vh", overflowY: "auto" }}>
              {/* Termius */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong>1. Импорт в Termius (One-click JSON) {/* i18n-ignore */}</strong>
                  <button
                    type="button"
                    className="button-plain small"
                    onClick={() => copyText(termiusJson, showCopiedTermius)}
                  >
                    {copiedTermius ? <Check size={14} /> : <Copy size={14} />}
                    {copiedTermius ? "Скопировано" /* i18n-ignore */ : "Копировать JSON" /* i18n-ignore */}
                  </button>
                </div>
                <pre style={{
                  background: "rgba(0,0,0,0.4)",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "monospace",
                  overflowX: "auto"
                }}>
                  {termiusJson}
                </pre>
              </div>

              {/* SSH Config */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong>2. Файл ~/.ssh/config {/* i18n-ignore */}</strong>
                  <button
                    type="button"
                    className="button-plain small"
                    onClick={() => copyText(sshConfigSnippet, showCopiedSshConfig)}
                  >
                    {copiedSshConfig ? <Check size={14} /> : <Copy size={14} />}
                    {copiedSshConfig ? "Скопировано" /* i18n-ignore */ : "Копировать конфиг" /* i18n-ignore */}
                  </button>
                </div>
                <pre style={{
                  background: "rgba(0,0,0,0.4)",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "monospace",
                  overflowX: "auto"
                }}>
                  {sshConfigSnippet}
                </pre>
              </div>

              {/* One-liner */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong>3. Подключение в одну строку (CLI) {/* i18n-ignore */}</strong>
                  <button
                    type="button"
                    className="button-plain small"
                    onClick={() => copyText(sshCmd, showCopiedSshCmd)}
                  >
                    {copiedSshCmd ? <Check size={14} /> : <Copy size={14} />}
                    {copiedSshCmd ? "Скопировано" /* i18n-ignore */ : "Копировать команду" /* i18n-ignore */}
                  </button>
                </div>
                <pre style={{
                  background: "rgba(0,0,0,0.4)",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "monospace"
                }}>
                  {sshCmd}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pull Request Proposal */}
      {showPrModal && (
        <div className="dialog-overlay" onClick={() => setShowPrModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="dialog-head">
              <h3>Предложение слияния для Дениса Герасименко (tTerm upstream) {/* i18n-ignore */}</h3>
              <button type="button" className="button-ghost small" onClick={() => setShowPrModal(false)}>
                <Close size={16} />
              </button>
            </div>
            <div className="dialog-body" style={{ padding: "16px 20px", maxHeight: "75vh", overflowY: "auto" }}>
              <p style={{ fontSize: 13, lineHeight: "1.5", marginBottom: 12 }}>
                Файл <code>PULL_REQUEST_PROPOSAL.md</code> подготовлен и содержит подробное описание интеграции ИИ-агентов, точечного RBAC-доступа, Windows агента и MCP сервера. {/* i18n-ignore */}
              </p>
              <div style={{
                background: "rgba(0,0,0,0.3)",
                padding: "12px 16px",
                borderRadius: 8,
                fontSize: 12,
                lineHeight: "1.6",
                marginBottom: 16
              }}>
                <div><strong>Ветка разработки:</strong> <code>feature/mcp-ai-integration</code> {/* i18n-ignore */}</div>
                <div><strong>Контакты для автора:</strong> Telegram: <code>@eklimov84</code> {/* i18n-ignore */}</div>
                <div><strong>Ключевые доработки:</strong> MCP Server, Scoped AI Access, Guard Mode, TerminalHeader, Windows PowerShell Agent, Hierarchical RBAC {/* i18n-ignore */}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <a
                  href="https://github.com/DLGerasimenko/tterm-web/pulls"
                  target="_blank"
                  rel="noreferrer"
                  className="button-accent"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  Открыть Pull Requests на GitHub ↗ {/* i18n-ignore */}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
