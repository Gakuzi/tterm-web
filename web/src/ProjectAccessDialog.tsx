import { useState, useEffect } from "react";
import {
  getTerminalAccess, updateTerminalAccess, revokeTerminalAi,
  type Me,
} from "./api";
import {
  Check, Close, Copy, Layers, Lock,
  Pencil, People, Plus, Restart, Server, Spark, Trash
} from "./icons";
import { useBriefly } from "./briefly";
import { copyToClipboard } from "./clipboard";
import { DisruptiveActionModal, type ActiveProcess } from "./DisruptiveActionModal";

export interface ProjectMember {
  id: string;
  name: string;
  email: string;
  role: "project_admin" | "node_admin" | "container_developer" | "service_operator";
  is_ai: boolean;
  terminals_allowed: string[];
  containers_allowed: string[];
  ai_mode?: "execute" | "guard" | "readonly";
}

export interface DiscoveredContainer {
  id: string;
  name: string;
  custom_name?: string;
  image: string;
  status: string;
  ports: string[];
}

interface Props {
  terminalId?: string;
  machineName?: string;
  terminalLabel?: string;
  projectId?: string;
  projectName?: string;
  me: Me;
  onClose: () => void;
  notify: (text: string) => void;
}

const ROLE_LABELS: Record<ProjectMember["role"], { title: string; badge: string; desc: string }> = {
  project_admin: {
    title: "Владелец / Администратор проекта", // i18n-ignore
    badge: "Админ проекта", // i18n-ignore
    desc: "Полный доступ ко всей инфраструктуре, нодам, контейнерам и управлению командой", // i18n-ignore
  },
  node_admin: {
    title: "Администратор сервера / ноды", // i18n-ignore
    badge: "Админ ноды", // i18n-ignore
    desc: "Управление физическим хостом, запуск/остановка контейнеров и терминалов на ноде", // i18n-ignore
  },
  container_developer: {
    title: "Разработчик контейнера", // i18n-ignore
    badge: "Разработчик", // i18n-ignore
    desc: "Доступ к терминалу строго внутри выделенного Docker-контейнера", // i18n-ignore
  },
  service_operator: {
    title: "Оператор сервиса (без shell)", // i18n-ignore
    badge: "Оператор", // i18n-ignore
    desc: "Доступ к портам, логам и метрикам сервиса без прямого доступа к командной строке", // i18n-ignore
  },
};

export function ProjectAccessDialog(props: Props) {
  const {
    terminalId = "default-term",
    machineName = "Домашний сервер (Raspberry Pi)", // i18n-ignore
    terminalLabel = "Терминал #1", // i18n-ignore
    projectId = "default-project",
    projectName = "Главный проект", // i18n-ignore
    me,
    onClose,
    notify,
  } = props;

  // Tabs: Project & Team (Priority 1) -> Node & Docker Hierarchy -> Terminal & AI Settings
  const [activeTab, setActiveTab] = useState<"team" | "hierarchy" | "terminal">("team");

  // Members state
  const [members, setMembers] = useState<ProjectMember[]>([
    {
      id: me.id || "owner-user",
      name: me.name || "Owner", // i18n-ignore
      email: me.email || "owner@example.local",
      role: "project_admin",
      is_ai: false,
      terminals_allowed: ["*"],
      containers_allowed: ["*"],
      ai_mode: "execute",
    },
    {
      id: "ai-antigravity",
      name: "Antigravity (ИИ-Ассистент)", // i18n-ignore
      email: "ai@antigravity.internal",
      role: "container_developer",
      is_ai: true,
      terminals_allowed: [terminalId],
      containers_allowed: ["tterm-server-tterm-1"],
      ai_mode: "guard",
    },
  ]);

  // Add Member Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<ProjectMember["role"]>("container_developer");
  const [newMemberIsAi, setNewMemberIsAi] = useState(false);

  // Containers & Hierarchy
  const [containers, setContainers] = useState<DiscoveredContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [editingCid, setEditingCid] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  // Terminal AI Access
  const [aiAccess, setAiAccess] = useState(true);
  const [aiMode, setAiMode] = useState<"execute" | "guard" | "readonly">("guard");

  // Copy helper
  const [copiedInvite, showCopiedInvite] = useBriefly<boolean>();
  const [copiedSnippet, showCopiedSnippet] = useBriefly<boolean>();
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Disruptive modal
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

  // Load project members and containers automatically on mount
  useEffect(() => {
    let live = true;

    // Load terminal access
    getTerminalAccess(terminalId)
      .then((acc) => {
        if (!live) return;
        setAiAccess(acc.aiAccess);
        setAiMode(acc.aiMode);
      })
      .catch(() => {});

    // Load project members from API
    fetch(`/api/orchestration/projects/${projectId}/members`, {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.members?.length) {
          setMembers(data.members);
        }
      })
      .catch(() => {});

    // Load auto-discovered containers
    setLoadingContainers(true);
    fetch("/api/orchestration/discovery/klim", {
      headers: { "x-tterm": "1" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data?.containers?.length) {
          setContainers(data.containers);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoadingContainers(false);
      });

    return () => {
      live = false;
    };
  }, [terminalId, projectId]);

  // Save Terminal AI Access
  const handleSaveTerminalAi = async (access: boolean, mode: "execute" | "guard" | "readonly") => {
    setAiAccess(access);
    setAiMode(mode);
    try {
      await updateTerminalAccess(terminalId, { aiAccess: access, aiMode: mode });
      notify("Настройки доступа терминала сохранены"); // i18n-ignore
    } catch {
      notify("Ошибка сохранения настроек терминала"); // i18n-ignore
    }
  };

  // Revoke AI Access
  const handleRevokeAi = async () => {
    try {
      await revokeTerminalAi(terminalId);
      setAiAccess(false);
      notify("Доступ ИИ к терминалу отозван"); // i18n-ignore
    } catch {
      notify("Не удалось отозвать доступ"); // i18n-ignore
    }
  };

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;

    const newM: ProjectMember = {
      id: "user-" + Math.random().toString(36).substring(2, 9),
      name: newMemberName.trim(),
      email: newMemberEmail.trim(),
      role: newMemberRole,
      is_ai: newMemberIsAi,
      terminals_allowed: [terminalId],
      containers_allowed: ["*"],
      ai_mode: newMemberIsAi ? "guard" : "execute",
    };

    const nextMembers = [...members, newM];
    setMembers(nextMembers);
    setShowAddForm(false);
    setNewMemberName("");
    setNewMemberEmail("");

    try {
      await fetch(`/api/orchestration/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify(newM),
      });
      notify("Пользователь добавлен в проект"); // i18n-ignore
    } catch {
      notify("Пользователь добавлен локально"); // i18n-ignore
    }
  };

  // Delete Member
  const handleDeleteMember = async (userId: string, userName: string) => {
    if (!confirm(`Удалить участника ${userName} из проекта?`)) return; // i18n-ignore

    setMembers((prev) => prev.filter((m) => m.id !== userId));
    try {
      await fetch(`/api/orchestration/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        headers: { "x-tterm": "1" },
      });
      notify(`Участник ${userName} удален`); // i18n-ignore
    } catch {
      notify("Удалено из списка"); // i18n-ignore
    }
  };

  // Change Role
  const handleChangeRole = async (userId: string, newRole: ProjectMember["role"]) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m))
    );
    try {
      await fetch(`/api/orchestration/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({ role: newRole }),
      });
      notify("Роль участника обновлена"); // i18n-ignore
    } catch {}
  };

  // Toggle Terminal Allowed for Member
  const handleToggleTerminalScope = async (userId: string) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== userId) return m;
        const currentAllowed = Array.isArray(m.terminals_allowed)
          ? m.terminals_allowed
          : Array.isArray((m as any).terminalsAllowed)
            ? (m as any).terminalsAllowed
            : ["*"];
        const isAll = currentAllowed.includes("*");
        const next = isAll ? [terminalId] : ["*"];
        return { ...m, terminals_allowed: next };
      })
    );
    notify("Область доступа к терминалам изменена"); // i18n-ignore
  };

  // Rename Container
  const handleSaveContainerRename = async (cid: string) => {
    if (!renameText.trim()) {
      setEditingCid(null);
      return;
    }
    const clean = renameText.trim();
    setContainers((prev) =>
      prev.map((c) => (c.id === cid ? { ...c, custom_name: clean } : c))
    );
    setEditingCid(null);
    try {
      await fetch("/api/orchestration/discovery/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          node_id: "klim",
          entity_type: "container",
          entity_id: cid,
          custom_name: clean,
        }),
      });
      notify("Имя контейнера сохранено: " + clean); // i18n-ignore
    } catch {}
  };

  // Check Impact for Disruptive Action
  const handleTriggerImpact = async (
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

  const inviteLink = `${window.location.origin}/#invite=${projectId}&token=tt_inv_${projectId.slice(0, 8)}`;
  const mcpConfigSnippet = JSON.stringify(
    {
      url: window.location.origin,
      allowed_terminal: terminalId,
      project_id: projectId,
    },
    null,
    2
  );

  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="dialog project-access-dialog" role="dialog" aria-modal="true">
        {/* Header */}
        <header className="dialog-head">
          <div className="dialog-title-group">
            <h2 className="dialog-title">
              {/* i18n-ignore */}
              ⚙️ Настройки проекта и доступа
            </h2>
            <p className="dialog-subtitle">
              {/* i18n-ignore */}
              {projectName} · {machineName} · {terminalLabel}
            </p>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            aria-label="Закрыть" // i18n-ignore
          >
            <Close size={18} />
          </button>
        </header>

        {/* Responsive Mobile-Friendly Tabs */}
        <nav className="access-dialog-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "team"}
            className={`access-tab ${activeTab === "team" ? "active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            <People size={16} />
            <span>{/* i18n-ignore */}👥 1. Проект и команда</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "hierarchy"}
            className={`access-tab ${activeTab === "hierarchy" ? "active" : ""}`}
            onClick={() => setActiveTab("hierarchy")}
          >
            <Layers size={16} />
            <span>{/* i18n-ignore */}🏗️ 2. Docker и нода</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "terminal"}
            className={`access-tab ${activeTab === "terminal" ? "active" : ""}`}
            onClick={() => setActiveTab("terminal")}
          >
            <Spark size={16} />
            <span>{/* i18n-ignore */}💻 3. Терминал и ИИ</span>
          </button>
        </nav>

        {/* Tab 1: Project & Team Settings (Priority 1) */}
        {activeTab === "team" && (
          <div className="access-tab-content">
            <div className="access-section-head">
              <div>
                <h3 className="section-heading">{/* i18n-ignore */}Управление командой проекта</h3>
                <p className="section-subheading">
                  {/* i18n-ignore */}
                  Добавляйте коллег и ИИ-ассистентов, управляйте ролями RBAC и точечными правами к терминалам
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-accent-sm"
                  onClick={() => setShowInviteModal(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span>🔗 Пригласить по ссылке</span> {/* i18n-ignore */}
                </button>
                <button
                  type="button"
                  className="btn-secondary-sm"
                  onClick={() => setShowAddForm(!showAddForm)}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Plus size={14} />
                  <span>{showAddForm ? "Скрыть форму" : "Добавить"}</span> {/* i18n-ignore */}
                </button>
              </div>
            </div>

            {/* Add Member Form */}
            {showAddForm && (
              <form onSubmit={handleAddMember} className="member-add-card">
                <h4 className="member-form-title">{/* i18n-ignore */}Новый участник или ИИ-агент</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>{/* i18n-ignore */}Имя / Название</label>
                    <input
                      type="text"
                      required
                      placeholder="Иван Петров или Claude AI" // i18n-ignore
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>{/* i18n-ignore */}Email / Идентификатор</label>
                    <input
                      type="text"
                      required
                      placeholder="user@company.com" // i18n-ignore
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>{/* i18n-ignore */}Роль в системе</label>
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value as any)}
                    >
                      <option value="project_admin">{/* i18n-ignore */}👑 Владелец / Администратор проекта</option>
                      <option value="node_admin">{/* i18n-ignore */}🛡️ Администратор ноды</option>
                      <option value="container_developer">{/* i18n-ignore */}💻 Разработчик контейнера</option>
                      <option value="service_operator">{/* i18n-ignore */}⚙️ Оператор сервиса (без shell)</option>
                    </select>
                  </div>

                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newMemberIsAi}
                        onChange={(e) => setNewMemberIsAi(e.target.checked)}
                      />
                      <span>{/* i18n-ignore */}Это автономный ИИ-агент (Antigravity, Cursor)</span>
                    </label>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-primary-sm">
                    {/* i18n-ignore */}
                    Сохранить участника
                  </button>
                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    {/* i18n-ignore */}
                    Отмена
                  </button>
                </div>
              </form>
            )}

            {/* Members List */}
            <div className="members-list">
              {members.map((m) => {
                const roleMeta = ROLE_LABELS[m.role] || ROLE_LABELS.container_developer;
                const allowedList = Array.isArray(m.terminals_allowed)
                  ? m.terminals_allowed
                  : Array.isArray((m as any).terminalsAllowed)
                    ? (m as any).terminalsAllowed
                    : ["*"];
                const isOnlyCurrentTerm = !allowedList.includes("*");

                return (
                  <div key={m.id} className="member-row-card">
                    <div className="member-main-info">
                      <div className={`member-avatar ${m.is_ai ? "ai-avatar" : ""}`}>
                        {m.is_ai ? "🤖" : "👤"}
                      </div>
                      <div className="member-details">
                        <div className="member-name-line">
                          <strong>{m.name}</strong>
                          <span className={`member-role-badge badge-${m.role}`}>
                            {roleMeta.badge}
                          </span>
                        </div>
                        <div className="member-subline">
                          <span>{m.email}</span>
                          <span className="dot-sep">·</span>
                          <span className="scope-tag">
                            {isOnlyCurrentTerm ? `Доступ: только ${terminalLabel}` : "Доступ: все терминалы"} {/* i18n-ignore */}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="member-actions-row">
                      {/* Role selector */}
                      <select
                        className="role-inline-select"
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.id, e.target.value as any)}
                        title="Изменить роль участника" // i18n-ignore
                      >
                        <option value="project_admin">{/* i18n-ignore */}Админ проекта</option>
                        <option value="node_admin">{/* i18n-ignore */}Админ ноды</option>
                        <option value="container_developer">{/* i18n-ignore */}Разработчик</option>
                        <option value="service_operator">{/* i18n-ignore */}Оператор</option>
                      </select>

                      {/* Scoped terminal toggle */}
                      <button
                        type="button"
                        className={`btn-scope-toggle ${isOnlyCurrentTerm ? "active" : ""}`}
                        onClick={() => handleToggleTerminalScope(m.id)}
                        title={isOnlyCurrentTerm ? "Разрешить доступ ко всем терминалам" : "Ограничить доступ только текущим терминалом"} // i18n-ignore
                      >
                        <Lock size={12} />
                        <span>{isOnlyCurrentTerm ? "Только этот" : "Все окна"}</span> {/* i18n-ignore */}
                      </button>

                      {/* Delete member */}
                      {m.id !== me.id && (
                        <button
                          type="button"
                          className="btn-delete-member"
                          onClick={() => handleDeleteMember(m.id, m.name)}
                          title="Удалить участника из проекта" // i18n-ignore
                        >
                          <Trash size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Node & Docker Hierarchy (Priority 2) */}
        {activeTab === "hierarchy" && (
          <div className="access-tab-content">
            <div className="access-section-head">
              <div>
                <h3 className="section-heading">{/* i18n-ignore */}4-уровневая иерархия инфраструктуры</h3>
                <p className="section-subheading">
                  {/* i18n-ignore */}
                  Проект ➔ Физическая нода ➔ Docker-контейнеры ➔ Службы и порты
                </p>
              </div>
              <button
                type="button"
                className="btn-accent-sm"
                onClick={() =>
                  handleTriggerImpact("node", "klim", machineName, "reboot")
                }
              >
                <Restart size={14} />
                <span>{/* i18n-ignore */}Действие на ноде (Drain Lock)</span>
              </button>
            </div>

            {/* Tree Root */}
            <div className="hierarchy-tree-view">
              <div className="tree-node tree-root">
                <div className="tree-header">
                  <Server size={16} />
                  <span className="tree-title">{machineName}</span>
                  <span className="tree-ip">192.168.1.50 (Linux Node)</span> {/* i18n-ignore */}
                  <span className="status-pill online">{/* i18n-ignore */}Онлайн</span>
                </div>

                <div className="tree-children">
                  {loadingContainers && (
                    <div className="loading-state">{/* i18n-ignore */}⏳ Опрос Docker-сокета ноды…</div>
                  )}

                  {!loadingContainers && containers.length === 0 && (
                    <div className="empty-state">{/* i18n-ignore */}Контейнеры не найдены</div>
                  )}

                  {containers.map((c) => {
                    const isEditing = editingCid === c.id;
                    const displayName = c.custom_name || c.name;

                    return (
                      <div key={c.id} className="container-tree-card">
                        <div className="container-main-row">
                          <div className="container-info-col">
                            <div className="container-title-line">
                              {isEditing ? (
                                <div className="rename-inline-box">
                                  <input
                                    type="text"
                                    value={renameText}
                                    onChange={(e) => setRenameText(e.target.value)}
                                    autoFocus
                                    placeholder="Понятное имя (например, Главная БД)" // i18n-ignore
                                  />
                                  <button
                                    type="button"
                                    className="btn-save-rename"
                                    onClick={() => handleSaveContainerRename(c.id)}
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-cancel-rename"
                                    onClick={() => setEditingCid(null)}
                                  >
                                    <Close size={12} />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <strong className="container-display-name">{displayName}</strong>
                                  <span className="container-raw-name">({c.name})</span>
                                  <button
                                    type="button"
                                    className="btn-rename-icon"
                                    onClick={() => {
                                      setEditingCid(c.id);
                                      setRenameText(c.custom_name || c.name);
                                    }}
                                    title="Переименовать в понятное имя" // i18n-ignore
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="container-meta-line">
                              <span className="container-image-tag">{c.image}</span>
                              <span className="container-status-tag">{c.status}</span>
                            </div>
                          </div>

                          <div className="container-actions-col">
                            <button
                              type="button"
                              className="btn-drain-check-sm"
                              onClick={() =>
                                handleTriggerImpact(
                                  "container",
                                  c.id,
                                  c.custom_name || c.name,
                                  "restart"
                                )
                              }
                              title="Проверить влияние и мягко перезапустить (Graceful Drain)" // i18n-ignore
                            >
                              <Restart size={12} />
                              <span>{/* i18n-ignore */}Перезапуск</span>
                            </button>
                          </div>
                        </div>

                        {/* Ports / Services inside container */}
                        {c.ports && c.ports.length > 0 && (
                          <div className="container-ports-row">
                            <span className="ports-label">{/* i18n-ignore */}Службы / Порты:</span>
                            {c.ports.map((p, idx) => (
                              <span key={idx} className="port-badge">
                                🔌 {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Terminal & AI Settings (Priority 3) */}
        {activeTab === "terminal" && (
          <div className="access-tab-content">
            <div className="access-section-head">
              <div>
                <h3 className="section-heading">{/* i18n-ignore */}Доступ ИИ и изоляция терминала</h3>
                <p className="section-subheading">
                  {/* i18n-ignore */}
                  Настройка прав автономных агентов (Google Antigravity, Cursor AI, Claude) для окна {terminalLabel}
                </p>
              </div>
              <button
                type="button"
                className="btn-danger-sm"
                onClick={handleRevokeAi}
                title="Моментально заблокировать все вызовы команд ИИ в этом окне" // i18n-ignore
              >
                {/* i18n-ignore */}
                🚫 Отозвать доступ у всех ИИ
              </button>
            </div>

            {/* Scoped AI Access Toggle */}
            <div className="ai-settings-card">
              <div className="setting-toggle-row">
                <div className="toggle-text">
                  <strong>{/* i18n-ignore */}Разрешить ИИ-агентам выполнять команды в этом терминале</strong>
                  <span>{/* i18n-ignore */}Агент сможет передавать команды через MCP и протокол терминала</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={aiAccess}
                    onChange={(e) => handleSaveTerminalAi(e.target.checked, aiMode)}
                  />
                  <span className="slider round" />
                </label>
              </div>

              {/* Mode Selection */}
              {aiAccess && (
                <div className="ai-modes-grid">
                  <div
                    className={`mode-card ${aiMode === "execute" ? "selected" : ""}`}
                    onClick={() => handleSaveTerminalAi(true, "execute")}
                  >
                    <div className="mode-header">
                      <Spark size={16} />
                      <strong>{/* i18n-ignore */}⚡ Полный запуск (Execute)</strong>
                    </div>
                    <p>{/* i18n-ignore */}Агент запускает команды автономно. Вывод отображается в реальном времени с фиолетовым бейджем автора.</p>
                  </div>

                  <div
                    className={`mode-card ${aiMode === "guard" ? "selected" : ""}`}
                    onClick={() => handleSaveTerminalAi(true, "guard")}
                  >
                    <div className="mode-header">
                      <Lock size={16} />
                      <strong>{/* i18n-ignore */}🛡️ Режим подтверждения (Guard Mode)</strong>
                    </div>
                    <p>{/* i18n-ignore */}Перед каждым запуском агент запрашивает подтверждение. В терминале появляется кнопка [Разрешить].</p>
                  </div>

                  <div
                    className={`mode-card ${aiMode === "readonly" ? "selected" : ""}`}
                    onClick={() => handleSaveTerminalAi(true, "readonly")}
                  >
                    <div className="mode-header">
                      <Layers size={16} />
                      <strong>{/* i18n-ignore */}👁️ Только чтение (Read-Only)</strong>
                    </div>
                    <p>{/* i18n-ignore */}Агент видит вывод и историю экрана, но запуск команд заблокирован.</p>
                  </div>
                </div>
              )}
            </div>

            {/* MCP Config Snippet */}
            <div className="mcp-config-box">
              <div className="mcp-config-head">
                <strong>{/* i18n-ignore */}Конфигурация MCP для точечной изоляции (mcp.json)</strong>
                <button
                  type="button"
                  className="btn-secondary-sm copy-btn"
                  onClick={async () => {
                    const ok = await copyToClipboard(mcpConfigSnippet);
                    if (ok) {
                      showCopiedSnippet(true);
                      notify("Конфигурация скопирована"); // i18n-ignore
                    } else {
                      notify("Не удалось скопировать конфигурацию"); // i18n-ignore
                    }
                  }}
                >
                  {copiedSnippet ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedSnippet ? "Скопировано" : "Скопировать JSON"}</span> {/* i18n-ignore */}
                </button>
              </div>
              <pre className="code-snippet-pre">
                <code>{mcpConfigSnippet}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="dialog-foot">
          <div className="dialog-foot-info">
            <span>
              {/* i18n-ignore */}
              Участников: {members.length} · Контейнеров: {containers.length} · Терминал: {terminalLabel}
            </span>
          </div>
          <button type="button" className="btn-primary" onClick={onClose}>
            {/* i18n-ignore */}
            Готово
          </button>
        </footer>
      </section>

      {/* Disruptive Action Modal */}
      {disruptiveModal.isOpen && (
        <DisruptiveActionModal
          entityType={disruptiveModal.entityType}
          entityName={disruptiveModal.entityName}
          action={disruptiveModal.action}
          activeProcesses={disruptiveModal.activeProcesses}
          onConfirmDrain={async (timeoutSeconds: number) => {
            const { entityType, entityId, entityName, action } = disruptiveModal;
            setDisruptiveModal((prev) => ({ ...prev, isOpen: false }));
            try {
              await fetch("/api/orchestration/locks/drain", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-tterm": "1" },
                body: JSON.stringify({
                  initiator_id: me.id,
                  initiator_name: me.name || "Владелец", // i18n-ignore
                  entity_type: entityType,
                  entity_id: entityId,
                  entity_name: entityName,
                  action,
                  timeout_seconds: timeoutSeconds,
                }),
              });
              notify(`Включен Graceful Drain (${timeoutSeconds} сек)`); // i18n-ignore
            } catch {
              notify("Ошибка запуска Graceful Drain"); // i18n-ignore
            }
          }}
          onConfirmForce={() => {
            const { entityName, action } = disruptiveModal;
            setDisruptiveModal((prev) => ({ ...prev, isOpen: false }));
            notify(`Принудительное действие [${action}] запущено для ${entityName}`); // i18n-ignore
          }}
          onCancel={() => setDisruptiveModal((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {/* Invite Link Modal */}
      {showInviteModal && (
        <div className="scrim" onClick={() => setShowInviteModal(false)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pad-invite-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "520px",
              maxWidth: "100%",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div className="dialog-head" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--blue)", display: "flex" }}>
                  <People size={20} />
                </span>
                <div className="dialog-title">
                  <h2 id="pad-invite-title" style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--ink)" }}>
                    Приглашение в проект {projectName} {/* i18n-ignore */}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="icon-button small"
                onClick={() => setShowInviteModal(false)}
                aria-label="Закрыть" // i18n-ignore
              >
                <Close size={16} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--dim)", margin: 0, lineHeight: 1.4 }}>
              По этой ссылке пользователь или ИИ-агент может присоединиться к проекту {projectName} и получить доступ к назначенным терминалам. {/* i18n-ignore */}
            </p>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="text-input"
                style={{ flex: 1, fontFamily: "monospace", fontSize: 12, padding: "8px 12px" }}
              />
              <button
                type="button"
                className="button-accent"
                onClick={async () => {
                  const ok = await copyToClipboard(inviteLink);
                  if (ok) {
                    showCopiedInvite(true);
                    notify("Ссылка скопирована в буфер обмена"); // i18n-ignore
                  } else {
                    notify("Не удалось скопировать ссылку"); // i18n-ignore
                  }
                }}
              >
                {copiedInvite ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedInvite ? "Скопировано!" : "Копировать"}</span> {/* i18n-ignore */}
              </button>
            </div>

            <div style={{ fontSize: 12, color: "var(--faint)" }}>
              Срок действия ссылки: 24 часа. Назначить роль и права можно сразу после подключения. {/* i18n-ignore */}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button
                type="button"
                className="button-plain small"
                onClick={() => setShowInviteModal(false)}
              >
                Закрыть {/* i18n-ignore */}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Backwards compatibility re-export
export { ProjectAccessDialog as TerminalAccessDialog };
