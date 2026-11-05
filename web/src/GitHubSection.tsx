// GitHub OAuth & Repository Orchestration Section for tTerm Settings and Account.
// Allows users to connect their personal GitHub account via OAuth or PAT,
// authoring all git commits, terminal branches, and pull requests under their identity.

import { useEffect, useState } from "react";
import {
  configureGitHubOAuthApp,
  connectGitHubToken,
  createGitHubRepository,
  disconnectGitHub,
  getGitHubAuthUrl,
  getGitHubStatus,
  getVaultData,
  githubOAuthCallback,
  listGitHubRepositories,
  saveVaultSecrets,
  type GitHubRepo,
  type GitHubStatus,
} from "./api";
import { copyToClipboard } from "./clipboard";
import { Check, Copy, GitHub, Link, Warning } from "./icons";
import { Group, Row } from "./SettingsRows";

interface Props {
  notify: (text: string) => void;
  compact?: boolean;
  projects?: Array<{ id: string; name: string; code?: string }>;
}

export function GitHubSection(props: Props) {
  const { notify } = props;
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Repositories state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showRepoCreate, setShowRepoCreate] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("Managed by tTerm"); // i18n-ignore
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);

  // Project bindings state
  const [projectBindings, setProjectBindings] = useState<Record<string, string>>({});
  const [selectedProjectForRepo, setSelectedProjectForRepo] = useState<Record<string, string>>({});
  const [bindingRepo, setBindingRepo] = useState<string | null>(null);


  // OAuth App custom config toggle
  const [showOAuthConfig, setShowOAuthConfig] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [savingOAuth, setSavingOAuth] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(key);
      notify("Скопировано в буфер обмена"); // i18n-ignore
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const loadStatus = async () => {
    try {
      setErrorMsg(null);
      let st = await getGitHubStatus();
      if (!st.is_authenticated) {
        try {
          const vault = await getVaultData();
          if (vault.ok && vault.secrets?.github_token) {
            const connectRes = await connectGitHubToken(vault.secrets.github_token);
            if (connectRes.ok && (connectRes as any).username) {
              st = {
                ok: true,
                is_authenticated: true,
                username: (connectRes as any).username,
                name: (connectRes as any).name,
                email: (connectRes as any).email,
                avatar_url: (connectRes as any).avatar_url,
                html_url: (connectRes as any).html_url,
                public_repos: (connectRes as any).public_repos || 0,
                total_private_repos: (connectRes as any).total_private_repos || 0,
                scopes: (connectRes as any).scopes || [],
                masked_token: (connectRes as any).masked_token,
                connected_at: (connectRes as any).connected_at,
              };
            }
          }
        } catch {
          // Cloud vault read fallback
        }
      }
      setStatus(st);
      void loadGitConfigs();
      if (st.is_authenticated) {
        void loadRepos();
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRepos = async () => {
    setLoadingRepos(true);
    try {
      const list = await listGitHubRepositories();
      setRepos(list);
    } catch {
      // Ignored if repos failed
    } finally {
      setLoadingRepos(false);
    }
  };

  const loadGitConfigs = async () => {
    try {
      const res = await fetch("/api/orchestration/git-configs", { headers: { "x-tterm": "1" } });
      if (res.ok) {
        const data = await res.json();
        if (data.configs) {
          const map: Record<string, string> = {};
          for (const [pid, cfg] of Object.entries(data.configs)) {
            if ((cfg as any).repo_url) {
              const cleanUrl = (cfg as any).repo_url.toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
              map[cleanUrl] = pid;
            }
          }
          setProjectBindings(map);
        }
      }
    } catch {}
  };

  const handleBindRepoToProject = async (repo: GitHubRepo, projectId: string) => {
    if (!projectId) {
      notify("Пожалуйста, выберите проект для привязки"); // i18n-ignore
      return;
    }
    const targetProject = props.projects?.find((p) => p.id === projectId);
    const projName = targetProject ? targetProject.name : projectId;
    const repoUrl = repo.html_url.endsWith(".git") ? repo.html_url : `${repo.html_url}.git`;
    setBindingRepo(repo.name);
    try {
      const res = await fetch(`/api/orchestration/projects/${projectId}/git-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          project_id: projectId,
          repo_url: repoUrl,
          provider: "github",
          default_branch: repo.default_branch || "main",
          auto_branch_per_terminal: true,
          auto_commit_actions: true,
          use_github_notes: true,
          notes_folder_in_repo: "docs",
          auto_sync_commits_as_notes: true,
        }),
      });

      // Also ensure notes-config is saved
      await fetch(`/api/orchestration/projects/${projectId}/notes-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tterm": "1" },
        body: JSON.stringify({
          use_github_as_notes: true,
          notes_folder_in_repo: "docs",
          commits_as_notes: true,
        }),
      });

      if (res.ok) {
        notify(`Репозиторий ${repo.name} успешно привязан к проекту "${projName}"!`); // i18n-ignore
        const cleanUrl = repo.html_url.toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
        setProjectBindings((prev) => ({ ...prev, [cleanUrl]: projectId }));
        setSelectedProjectForRepo((prev) => ({ ...prev, [repo.name]: projectId }));
        await loadGitConfigs();
      } else {
        notify("Ошибка при сохранении привязки репозитория"); // i18n-ignore
      }
    } catch {
      notify("Сетевая ошибка при привязке репозитория"); // i18n-ignore
    } finally {
      setBindingRepo(null);
    }
  };


  // Check URL query parameters for OAuth callback (?code=...&state=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      // Clear code from URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      const redirectUri = window.location.origin + window.location.pathname;
      setConnecting(true);
      githubOAuthCallback(code, redirectUri)
        .then((st) => {
          setStatus(st);
          notify(`GitHub успешно привязан: @${st.username || "пользователь"}`); // i18n-ignore
          void loadRepos();
        })
        .catch((err) => {
          setErrorMsg((err as Error).message);
          notify("Ошибка авторизации через GitHub"); // i18n-ignore
        })
        .finally(() => {
          setConnecting(false);
          setLoading(false);
        });
    } else {
      void loadStatus();
    }
  }, []);

  const handleOAuthLogin = async () => {
    setErrorMsg(null);
    setConnecting(true);
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const res = await getGitHubAuthUrl(redirectUri);
      if (res.auth_url) {
        window.location.href = res.auth_url;
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
      setConnecting(false);
    }
  };

  const handleConnectToken = async () => {
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      setErrorMsg("Пожалуйста, введите токен GitHub (PAT)"); // i18n-ignore
      return;
    }
    setErrorMsg(null);
    setConnecting(true);
    try {
      const st = await connectGitHubToken(cleanToken);
      void saveVaultSecrets({ github_token: cleanToken });
      setStatus(st);
      setTokenInput("");
      notify(`GitHub аккаунт подключен: @${st.username || "пользователь"}`); // i18n-ignore
      void loadRepos();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Отключить GitHub аккаунт от tTerm?")) return; // i18n-ignore
    setDisconnecting(true);
    setErrorMsg(null);
    try {
      await disconnectGitHub();
      setStatus({ ok: true, is_authenticated: false });
      setRepos([]);
      notify("GitHub аккаунт успешно отключен"); // i18n-ignore
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveOAuthConfig = async () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim()) {
      setErrorMsg("Укажите Client ID и Client Secret"); // i18n-ignore
      return;
    }
    setSavingOAuth(true);
    setErrorMsg(null);
    try {
      await configureGitHubOAuthApp(clientIdInput.trim(), clientSecretInput.trim());
      notify("OAuth credentials GitHub успешно сохранены"); // i18n-ignore
      setShowOAuthConfig(false);
      void loadStatus();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSavingOAuth(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) {
      notify("Укажите имя репозитория"); // i18n-ignore
      return;
    }
    setCreatingRepo(true);
    try {
      const res = await createGitHubRepository({
        name: newRepoName.trim(),
        description: newRepoDesc.trim(),
        private: newRepoPrivate,
      });
      notify(`Репозиторий ${res.repo?.full_name || newRepoName} успешно создан!`); // i18n-ignore
      setNewRepoName("");
      setShowRepoCreate(false);
      void loadRepos();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setCreatingRepo(false);
    }
  };

  if (loading) {
    return (
      <div className="waiting" style={{ padding: "32px 16px" }}>
        <span className="spinner" />
        <span>Загрузка статуса GitHub...</span> {/* i18n-ignore */}
      </div>
    );
  }

  return (
    <>
      <Group
        title="Интеграция GitHub" /* i18n-ignore */
        note="Привязка личного аккаунта GitHub для автоматического выполнения коммитов, создания веток и Pull Request от вашего имени." /* i18n-ignore */
      >
        {errorMsg && (
          <div className="error-box" role="alert" style={{ marginBottom: "16px" }}>
            <Warning size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {status?.is_authenticated ? (
          // ================= CONNECTED STATUS =================
          <>
            <Row
              label="Статус подключения" /* i18n-ignore */
              note="Все операции с GitHub в проектах и терминалах выполняются от имени этого пользователя." /* i18n-ignore */
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    backgroundColor: "rgba(70, 185, 92, 0.15)",
                    color: "var(--green-ink, #46B95C)",
                    border: "1px solid var(--green, #46B95C)",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "14px",
                    fontSize: "11px",
                    letterSpacing: "0.5px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Check size={12} />
                  СВЯЗАН {/* i18n-ignore */}
                </span>
                <button
                  type="button"
                  className="button-plain small quiet"
                  disabled={disconnecting}
                  onClick={() => void handleDisconnect()}
                  title="Отвязать GitHub от личного кабинета" /* i18n-ignore */
                  style={{ color: "var(--red, #E5534B)" }}
                >
                  {disconnecting ? "Отключение..." : "Отвязать GitHub [Отключить]"} {/* i18n-ignore */}
                </button>
              </div>
            </Row>

            <Row
              label="Профиль GitHub" /* i18n-ignore */
              note={status.email ? status.email : `ID: @${status.username}`} /* i18n-ignore */
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {status.avatar_url ? (
                  <img
                    src={status.avatar_url}
                    alt={status.username || "Avatar"} /* i18n-ignore */
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      border: "2px solid var(--sep, #3A3F48)",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      backgroundColor: "var(--surface, #16181C)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid var(--sep, #3A3F48)",
                    }}
                  >
                    <GitHub size={22} />
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 600, color: "var(--ink, #EDEFF3)" }}>
                    {status.name || status.username}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--dim, #9AA0AA)" }}>
                    @{status.username} • {status.public_repos ?? 0} репозиториев {/* i18n-ignore */}
                  </div>
                </div>
                {status.html_url && (
                  <a
                    href={status.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="button-plain small"
                    style={{ marginLeft: "auto", textDecoration: "none" }}
                    title="Открыть страницу профиля на GitHub" /* i18n-ignore */
                  >
                    <Link size={13} />
                    <span>Профиль</span> {/* i18n-ignore */}
                  </a>
                )}
              </div>
            </Row>

            <Row
              label="Токен доступа" /* i18n-ignore */
              note={`Предоставленные скоупы: ${status.scopes?.join(", ") || "repo, user"}`} /* i18n-ignore */
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <code
                  style={{
                    backgroundColor: "var(--surface, #16181C)",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--line, #262A31)",
                    fontSize: "12px",
                    color: "var(--amber, #E9A33F)",
                  }}
                >
                  {status.masked_token || "ghp_••••••••••••"} {/* i18n-ignore */}
                </code>
                {status.masked_token && (
                  <button
                    type="button"
                    className="button-plain small"
                    onClick={() => void copy("token", status.masked_token!)}
                    title="Скопировать маску токена" /* i18n-ignore */
                  >
                    {copied === "token" ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            </Row>

            <Row
              label="Управление репозиториями" /* i18n-ignore */
              note="Создание новых репозиториев и просмотр доступных прямо из tTerm." /* i18n-ignore */
            >
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="button-accent small"
                  onClick={() => setShowRepoCreate(!showRepoCreate)}
                >
                  {showRepoCreate ? "Скрыть" : "+ Создать репозиторий"} {/* i18n-ignore */}
                </button>
                <button
                  type="button"
                  className="button-plain small"
                  disabled={loadingRepos}
                  onClick={() => void loadRepos()}
                >
                  {loadingRepos ? "Обновление..." : "Обновить список"} {/* i18n-ignore */}
                </button>
              </div>
            </Row>

            {/* Modal/Box for creating repository */}
            {showRepoCreate && (
              <div
                style={{
                  backgroundColor: "var(--surface, #16181C)",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--line, #262A31)",
                  marginTop: "8px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "8px", color: "var(--ink, #EDEFF3)" }}>
                  Создать репозиторий от имени @{status.username} {/* i18n-ignore */}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="Имя репозитория (например, backend-service)" /* i18n-ignore */
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="text-input"
                    placeholder="Описание репозитория (необязательно)" /* i18n-ignore */
                    value={newRepoDesc}
                    onChange={(e) => setNewRepoDesc(e.target.value)}
                  />
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      color: "var(--ink, #EDEFF3)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newRepoPrivate}
                      onChange={(e) => setNewRepoPrivate(e.target.checked)}
                    />
                    <span>Сделать репозиторий приватным (Private)</span> {/* i18n-ignore */}
                  </label>
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button
                      type="button"
                      className="button-accent small"
                      disabled={creatingRepo || !newRepoName.trim()}
                      onClick={() => void handleCreateRepo()}
                    >
                      {creatingRepo ? "Создание на GitHub..." : "Создать репозиторий на GitHub"} {/* i18n-ignore */}
                    </button>
                    <button
                      type="button"
                      className="button-plain small quiet"
                      onClick={() => setShowRepoCreate(false)}
                    >
                      Отмена {/* i18n-ignore */}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Repositories list preview */}
            {repos.length > 0 && (
              <div
                style={{
                  backgroundColor: "var(--surface, #16181C)",
                  borderRadius: "8px",
                  border: "1px solid var(--line, #262A31)",
                  padding: "12px 16px",
                  marginTop: "8px",
                  maxHeight: "220px",
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--dim, #9AA0AA)",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Репозитории пользователя ({repos.length}) {/* i18n-ignore */}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {repos.slice(0, 15).map((r) => {
                    const cleanUrl = r.html_url.toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
                    const boundProjectId = projectBindings[cleanUrl];
                    const boundProject = boundProjectId && props.projects ? props.projects.find((p) => p.id === boundProjectId) : null;
                    const chosenProjectId = selectedProjectForRepo[r.name] ?? boundProjectId ?? "";

                    return (
                      <div
                        key={r.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          padding: "8px 10px",
                          borderRadius: "6px",
                          backgroundColor: "var(--ground, #0D0E11)",
                          fontSize: "13px",
                          border: boundProject ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid transparent", /* i18n-ignore */
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontWeight: 600, color: "var(--ink, #EDEFF3)" }}>{r.name}</span>
                            {r.private && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  backgroundColor: "var(--amber-tint, rgba(233, 163, 63, .12))",
                                  color: "var(--amber, #E9A33F)",
                                }}
                              >
                                private {/* i18n-ignore */}
                              </span>
                            )}
                            <span style={{ fontSize: "11px", color: "var(--faint, #7D838E)" }}>
                              ({r.default_branch})
                            </span>
                            {boundProject && (
                              <span style={{
                                fontSize: "11px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "#10b981",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                fontWeight: 600,
                              }}>
                                ✓ Привязан к: {boundProject.name} {/* i18n-ignore */}
                              </span>
                            )}
                          </div>
                          <a
                            href={r.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="button-plain small"
                            style={{ padding: "2px 6px" }}
                            title="Открыть на GitHub" /* i18n-ignore */
                          >
                            <Link size={12} />
                          </a>
                        </div>

                        {props.projects && props.projects.length > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                            <span style={{ fontSize: 11, color: "var(--dim, #9AA0AA)" }}>Привязать к проекту: {/* i18n-ignore */}</span>
                            <select
                              className="input-select"
                              style={{ fontSize: 11, padding: "2px 6px", height: 26, borderRadius: 4, minWidth: 160 }}
                              value={chosenProjectId}
                              onChange={(e) => setSelectedProjectForRepo((prev) => ({ ...prev, [r.name]: e.target.value }))}
                            >
                              <option value="">-- Выбрать проект -- {/* i18n-ignore */}</option>
                              {props.projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.code || "P"})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="button-accent small"
                              style={{ padding: "2px 10px", height: 26, fontSize: 11 }}
                              disabled={bindingRepo === r.name || !chosenProjectId}
                              onClick={() => void handleBindRepoToProject(r, chosenProjectId)}
                            >
                              {bindingRepo === r.name ? "Сохранение..." : "Сохранить"} {/* i18n-ignore */}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          // ================= NOT CONNECTED STATUS =================
          <>
            <Row
              label="Авторизация через OAuth" /* i18n-ignore */
              note="Быстрый вход в 1 клик через официальное веб-приложение GitHub." /* i18n-ignore */
            >
              <button
                type="button"
                className="button-accent"
                disabled={connecting}
                onClick={() => void handleOAuthLogin()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 600,
                }}
              >
                <GitHub size={16} />
                <span>{connecting ? "Подключение..." : "🔗 Войти через GitHub"}</span> {/* i18n-ignore */}
              </button>
            </Row>

            <Row
              label="Альтернатива: Персональный токен (PAT)" /* i18n-ignore */
              note="Personal Access Token (classic) с правами repo и user для прямого подключения без OAuth приложения." /* i18n-ignore */
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "380px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="password"
                    className="text-input"
                    placeholder="ghp_••••••••••••••••••••••••••••••••" /* i18n-ignore */
                    value={tokenInput}
                    disabled={connecting}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleConnectToken();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button-accent"
                    disabled={connecting || !tokenInput.trim()}
                    onClick={() => void handleConnectToken()}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {connecting ? "..." : "Подключить токен"} {/* i18n-ignore */}
                  </button>
                </div>
                <div style={{ fontSize: "11px", color: "var(--dim, #9AA0AA)", lineHeight: "1.4" }}>
                  {"Создайте токен на " /* i18n-ignore */}
                  <a
                    href="https://github.com/settings/tokens" /* i18n-ignore */
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--amber, #E9A33F)", textDecoration: "underline" }}
                  >
                    {"github.com/settings/tokens" /* i18n-ignore */}
                  </a>
                  {" с правами " /* i18n-ignore */}
                  <code>repo</code>
                  {" и " /* i18n-ignore */}
                  <code>user</code>.
                </div>
              </div>
            </Row>

            {/* Optional OAuth App Credentials for server administrator */}
            <Row
              label="Параметры OAuth App (для администратора)" /* i18n-ignore */
              note="Настройка Client ID и Client Secret приложения GitHub для работы кнопки «Войти через GitHub»." /* i18n-ignore */
            >
              <button
                type="button"
                className="button-plain small"
                onClick={() => setShowOAuthConfig(!showOAuthConfig)}
              >
                {showOAuthConfig ? "Скрыть форму" : "Настроить OAuth App"} {/* i18n-ignore */}
              </button>
            </Row>

            {showOAuthConfig && (
              <div
                style={{
                  backgroundColor: "var(--surface, #16181C)",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--line, #262A31)",
                  marginBottom: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink, #EDEFF3)" }}>
                  Настройка GitHub OAuth Application {/* i18n-ignore */}
                </div>
                <div style={{ fontSize: "12px", color: "var(--dim, #9AA0AA)" }}>
                  {"Зарегистрируйте приложение в GitHub Developer Settings с Redirect URI: " /* i18n-ignore */}
                  <code style={{ color: "var(--amber, #E9A33F)" }}>
                    {typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}
                  </code>
                </div>
                <input
                  type="text"
                  className="text-input"
                  placeholder="GitHub OAuth Client ID" /* i18n-ignore */
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                />
                <input
                  type="password"
                  className="text-input"
                  placeholder="GitHub OAuth Client Secret" /* i18n-ignore */
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="button-accent small"
                    disabled={savingOAuth || !clientIdInput.trim() || !clientSecretInput.trim()}
                    onClick={() => void handleSaveOAuthConfig()}
                  >
                    {savingOAuth ? "Сохранение..." : "Сохранить параметры OAuth"} {/* i18n-ignore */}
                  </button>
                  <button
                    type="button"
                    className="button-plain small quiet"
                    onClick={() => setShowOAuthConfig(false)}
                  >
                    Отмена {/* i18n-ignore */}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Group>
    </>
  );
}
