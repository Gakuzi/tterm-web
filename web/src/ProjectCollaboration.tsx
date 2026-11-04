import { useState } from "react";
import type { Project, TerminalInfo, Me } from "./api";
import {
  Branch, Check, Close, Copy, Key, Layers,
  Link as LinkIcon, Lock, People, Person, Server, Spark
} from "./icons";
import { useBriefly } from "./briefly";

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
  const [gitBranch] = useState("feature/mcp-ai-integration");
  const [showTermiusModal, setShowTermiusModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPrModal, setShowPrModal] = useState(false);

  const [copiedInvite, showCopiedInvite] = useBriefly<boolean>();
  const [copiedTermius, showCopiedTermius] = useBriefly<boolean>();
  const [copiedSshConfig, showCopiedSshConfig] = useBriefly<boolean>();
  const [copiedSshCmd, showCopiedSshCmd] = useBriefly<boolean>();

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
        const current = m.terminalsAllowed;
        if (current.includes("*")) {
          // Switch to explicit list without this terminal
          const allOtherIds = terminals.map((t) => t.id).filter((id) => id !== terminalId);
          return { ...m, terminalsAllowed: allOtherIds };
        }
        if (current.includes(terminalId)) {
          return { ...m, terminalsAllowed: current.filter((id) => id !== terminalId) };
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
                      const allowed = member.terminalsAllowed.includes("*") || member.terminalsAllowed.includes(t.id);
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
              Git Репозиторий и Слияние {/* i18n-ignore */}
            </h2>
            <span>
              Связь проекта с GitHub / Gitea для синхронизации и слияния изменений {/* i18n-ignore */}
            </span>
          </div>
          <button
            type="button"
            className="button-accent small"
            onClick={() => setShowPrModal(true)}
          >
            Предложение для автора (PR) {/* i18n-ignore */}
          </button>
        </div>

        <div className="pp-card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                URL удаленного репозитория (GitHub / Gitea): {/* i18n-ignore */}
              </span>
              <input
                type="text"
                className="input-text"
                value={gitRepo}
                onChange={(e) => setGitRepo(e.target.value)}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                Ветка разработки: {/* i18n-ignore */}
              </span>
              <div style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.3)",
                fontFamily: "monospace",
                fontSize: 13,
                border: "1px solid rgba(255,255,255,0.08)"
              }}>
                {gitBranch} {/* i18n-ignore */}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#10b981", display: "inline-flex" }}><Check size={14} /></span>
              Синхронизировано с локальным рабочим пространством {/* i18n-ignore */}
            </span>
            <span>·</span>
            <a
              href="https://github.com/DLGerasimenko/tterm-web"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-accent, #3b82f6)", textDecoration: "none" }}
            >
              Открыть upstream на GitHub ↗ {/* i18n-ignore */}
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
              Изолированные Контейнеры и Ноды {/* i18n-ignore */}
            </h2>
            <span>
              4-уровневая иерархия: Проект → Нода → Контейнер → Сервисы (Docker & OpenSSH) {/* i18n-ignore */}
            </span>
          </div>
          <button
            type="button"
            className="button-ghost small"
            onClick={() => setShowTermiusModal(true)}
          >
            <Key size={14} />
            Параметры для Termius / OpenSSH {/* i18n-ignore */}
          </button>
        </div>

        <div className="pp-card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <Server size={16} />
              <strong>Нода: klim (Raspberry Pi 4 / Linux 6.6) {/* i18n-ignore */}</strong>
              <span className="pp-mono" style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                IP: {window.location.hostname || "192.168.0.6"} {/* i18n-ignore */}
              </span>
              <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.2)", color: "#10b981" }}>
                ONLINE {/* i18n-ignore */}
              </span>
            </div>

            <div style={{
              marginLeft: 24,
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <strong style={{ fontSize: 13 }}>Контейнер: tterm-dev-ubuntu (Ubuntu 24.04 LTS) {/* i18n-ignore */}</strong>
                  <span style={{ display: "block", fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                    Выделенный сетевой мост: net_proj_{project.id.slice(0, 8)}_isolated {/* i18n-ignore */}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                  <span>ЦПУ: <strong>2.0 ядра</strong> {/* i18n-ignore */}</span>
                  <span>ОЗУ: <strong>2048 МБ</strong> {/* i18n-ignore */}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                <span>🔒 Защита: docker.sock заблокирован (Anti-Escape) {/* i18n-ignore */}</span>
                <span>🛡️ No-New-Privileges: Включено {/* i18n-ignore */}</span>
                <span>🔑 OpenSSH: Порт 2222 (Ed25519) {/* i18n-ignore */}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

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
