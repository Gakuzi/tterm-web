import { useEffect, useRef, useState } from "react";
import {
  startCloudDeploy,
  getCloudDeployStatus,
  testCloudDeployEmail,
  type CloudDeployTask,
} from "./api";
import { copyToClipboard } from "./clipboard";
import {
  Alert,
  Branch,
  Check,
  Close,
  Copy,
  Cross,
  Globe,
  Key,
  Layers,
  Lock,
  Mail,
  Server,
  TerminalIcon,
} from "./icons";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeAezaServices?: any[];
  defaultHost?: string;
  defaultEmail?: string;
}

export function CloudDeployModal({
  isOpen,
  onClose,
  activeAezaServices = [],
  defaultHost = "",
  defaultEmail = "admin@example.com",
}: Props) {
  const [view, setView] = useState<"config" | "deploying" | "completed" | "failed">("config");

  // Form State
  const [host, setHost] = useState(defaultHost);
  const [port, setPort] = useState(22);
  const [user, setUser] = useState("root");
  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [repoUrl, setRepoUrl] = useState("https://github.com/Gakuzi/tterm-web.git");
  const [branch, setBranch] = useState("feature/mcp-ai-orchestration-v1");
  const [adminEmail, setAdminEmail] = useState(defaultEmail);
  const [simulationMode, setSimulationMode] = useState(false);
  const [selectedAezaId, setSelectedAezaId] = useState<string>("");

  // Execution State
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<CloudDeployTask | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const handleCancelDeploy = async () => {
    if (!taskId) return;
    try {
      await fetch(`/api/orchestration/cloud-deploy/cancel/${taskId}`, { method: "POST" });
      const res = await getCloudDeployStatus(taskId);
      if (res.ok && res.task) {
        setTask(res.task);
        setView("failed");
      }
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  };

  // Sync defaultHost if provided
  useEffect(() => {
    if (defaultHost && !host) {
      setHost(defaultHost);
    }
  }, [defaultHost, host]);

  // When Aeza service selected, auto-fill IP and user
  const handleAezaSelect = (serviceId: string) => {
    setSelectedAezaId(serviceId);
    if (!serviceId) return;
    const s = activeAezaServices.find((item) => String(item.id) === serviceId);
    if (s) {
      const ip = s.ip || (s.ips && s.ips[0]) || s.ipv4 || "";
      if (ip) setHost(ip);
      setUser("root");
    }
  };

  // Poll status when deploying
  useEffect(() => {
    if (!taskId || (view !== "deploying" && view !== "completed" && view !== "failed")) {
      return;
    }

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const res = await getCloudDeployStatus(taskId);
        if (!isSubscribed) return;
        if (res.ok && res.task) {
          setTask(res.task);
          if (res.task.status === "completed") {
            setView("completed");
          } else if (res.task.status === "failed") {
            setView("failed");
          }
        }
      } catch (err) {
        console.error("Deploy polling error:", err);
      }
    }, 1500);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [taskId, view]);

  // Auto-scroll logs
  useEffect(() => {
    if (view === "deploying" || view === "completed" || view === "failed") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [task?.logs?.length, view]);

  const handleStartDeploy = async () => {
    if (!host) {
      alert("Пожалуйста, укажите IP-адрес или выберите сервер Aeza VPS"); // i18n-ignore
      return;
    }
    if (!adminEmail) {
      alert("Укажите email администратора для доставки проверочного кода"); // i18n-ignore
      return;
    }

    setIsStarting(true);
    try {
      const res = await startCloudDeploy({
        host,
        port,
        user,
        password: authType === "password" ? password : undefined,
        private_key: authType === "key" ? privateKey : undefined,
        repo_url: repoUrl,
        branch,
        admin_email: adminEmail,
        simulation_mode: simulationMode,
      });

      if (res.ok && res.task_id) {
        setTaskId(res.task_id);
        setView("deploying");
      } else {
        alert("Не удалось запустить процесс развертывания"); // i18n-ignore
      }
    } catch (err: any) {
      alert(`Ошибка старта: ${err?.message || err}`); // i18n-ignore
    } finally {
      setIsStarting(false);
    }
  };

  const handleCopyLogs = async () => {
    if (task?.logs) {
      await copyToClipboard(task.logs.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyCredentials = async () => {
    const creds = [
      `tTerm URL: ${task?.result_url || `http://${host}:8290`}`, // i18n-ignore
      `Admin Email: ${adminEmail}`, // i18n-ignore
      task?.verification_code ? `Код верификации: ${task.verification_code}` : "", // i18n-ignore
      task?.generated_secrets?.app_secret ? `APP_SECRET: ${task.generated_secrets.app_secret}` : "",
    ].filter(Boolean).join("\n");

    await copyToClipboard(creds);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const res = await testCloudDeployEmail({
        email: adminEmail,
        host,
      });
      if (res.ok) {
        setTestEmailResult(`Код отправлен: ${res.code} (${res.sent_via_smtp ? "SMTP" : "Simulation"})`); // i18n-ignore
      } else {
        setTestEmailResult(`Ошибка отправки: ${res.error || "unknown"}`); // i18n-ignore
      }
    } catch (err: any) {
      setTestEmailResult(`Ошибка: ${err?.message || err}`); // i18n-ignore
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  if (!isOpen) return null;

  const stepsList = [
    { num: 1, name: "Аудит и подключение", icon: <Server size={16} /> }, // i18n-ignore
    { num: 2, name: "Системное окружение & Docker", icon: <Layers size={16} /> }, // i18n-ignore
    { num: 3, name: "Клонирование репозитория", icon: <Branch size={16} /> }, // i18n-ignore
    { num: 4, name: "Конфигурация и секреты", icon: <Lock size={16} /> }, // i18n-ignore
    { num: 5, name: "Сборка и запуск контейнеров", icon: <TerminalIcon size={16} /> }, // i18n-ignore
    { num: 6, name: "Автоматический Health Check", icon: <Globe size={16} /> }, // i18n-ignore
    { num: 7, name: "Проверка отправки email с кодом", icon: <Mail size={16} /> }, // i18n-ignore
  ];

  if (!isOpen) return null;

  if (isMinimized) {
    const isCompleted = task?.status === "completed" || view === "completed";
    const isFailed = task?.status === "failed" || view === "failed";

    return (
      <div
        className="cloud-deploy-floating-pill"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 99999,
          background: isCompleted ? "#064e3b" : isFailed ? "#7f1d1d" : "#0f172a",
          border: `1px solid ${isCompleted ? "#10b981" : isFailed ? "#ef4444" : "rgba(16, 185, 129, 0.4)"}`,
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          color: "#f8fafc",
          maxWidth: 480,
        }}
      >
        <span style={{ fontSize: 18 }}>
          {isCompleted ? "✅" : isFailed ? "❌" : "🚀"}
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {isCompleted
              ? `Развернуто на ${host}!` /* i18n-ignore */
              : isFailed
              ? ("Развертывание прервано / ошибка" /* i18n-ignore */)
              : (`Установка на ${host || "VPS"}: ${task?.progress_pct ?? 0}%` /* i18n-ignore */)}
          </div>
          <div style={{ fontSize: 11, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isCompleted
              ? `Доступно на http://${host}:8290` /* i18n-ignore */
              : isFailed
              ? (task?.error || ("Произошла ошибка" /* i18n-ignore */))
              : (task?.steps_summary?.[task?.current_step]?.name || ("Выполняется установка..." /* i18n-ignore */))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isCompleted && (
            <a
              href={`http://${host}:8290`}
              target="_blank"
              rel="noreferrer"
              className="button-accent small"
              style={{ textDecoration: "none" }}
            >
              {"Открыть ↗" /* i18n-ignore */}
            </a>
          )}
          <button
            type="button"
            className="button-plain small"
            onClick={() => setIsMinimized(false)}
            title={"Развернуть полный ход установки" /* i18n-ignore */}
          >
            {"Развернуть ⤢" /* i18n-ignore */}
          </button>
          {!isCompleted && !isFailed && (
            <button
              type="button"
              className="button-ghost small"
              onClick={() => void handleCancelDeploy()}
              title={"Прервать ход установки" /* i18n-ignore */}
              style={{ color: "#ef4444" }}
            >
              {"✕ Прервать" /* i18n-ignore */}
            </button>
          )}
          {(isCompleted || isFailed) && (
            <button
              type="button"
              className="button-ghost small"
              onClick={() => {
                setIsMinimized(false);
                onClose();
              }}
              title={"Закрыть" /* i18n-ignore */}
            >
              <Close size={13} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 820,
          width: "94vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          borderRadius: 14,
          overflow: "hidden",
          background: "#0d131f",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            background: "linear-gradient(180deg, #161f30 0%, #0f1724 100%)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "inline-flex",
                padding: 6,
                borderRadius: 8,
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#fff",
              }}
            >
              <Server size={18} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#f8fafc" }}>
                Развертывание сервиса в 1 клик на VPS {/* i18n-ignore */}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                Полный перенос tTerm, автосборка Docker, Health Check и верификация почты {/* i18n-ignore */}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {(view === "deploying" || taskId) && (
              <button
                type="button"
                className="button-ghost small"
                onClick={() => setIsMinimized(true)}
                title={"Скрыть ход установки (свернуть в плавающее окно)" /* i18n-ignore */}
                style={{ color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <span>➖ Скрыть ход установки</span> {/* i18n-ignore */}
              </button>
            )}
            <button
              type="button"
              className="button-ghost small"
              onClick={onClose}
              style={{ color: "#94a3b8" }}
            >
              <Close size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* VIEW: CONFIG / TARGET SELECTION */}
          {view === "config" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Aeza VPS Quick Select if available */}
              {activeAezaServices.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: 10,
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#34d399",
                      marginBottom: 6,
                    }}
                  >
                    ☁️ Быстрый выбор из активных Aeza VPS: {/* i18n-ignore */}
                  </label>
                  <select
                    value={selectedAezaId}
                    onChange={(e) => handleAezaSelect(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1e293b",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 13,
                    }}
                  >
                    <option value="">-- Выбрать запущенный VPS сервер Aeza --</option> {/* i18n-ignore */}
                    {activeAezaServices.map((srv) => (
                      <option key={srv.id} value={String(srv.id)}>
                        {srv.name || `VPS #${srv.id}`} ({srv.ip || srv.ipv4 || "IP pending"}) - {srv.status || "active"} {/* i18n-ignore */}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Host & Port */}
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    IP адрес или Домен нового хостинга: {/* i18n-ignore */}
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="e.g. 194.87.214.15" // i18n-ignore
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#161f30",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    SSH Порт: {/* i18n-ignore */}
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#161f30",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* User & Auth Method */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    SSH Пользователь: {/* i18n-ignore */}
                  </label>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="root" // i18n-ignore
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#161f30",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    Метод аутентификации: {/* i18n-ignore */}
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={`button-plain small ${authType === "password" ? "active" : ""}`}
                      onClick={() => setAuthType("password")}
                      style={{
                        flex: 1,
                        background: authType === "password" ? "#2563eb" : "#1e293b",
                        color: "#fff",
                      }}
                    >
                      <Key size={13} /> Пароль {/* i18n-ignore */}
                    </button>
                    <button
                      type="button"
                      className={`button-plain small ${authType === "key" ? "active" : ""}`}
                      onClick={() => setAuthType("key")}
                      style={{
                        flex: 1,
                        background: authType === "key" ? "#2563eb" : "#1e293b",
                        color: "#fff",
                      }}
                    >
                      <Lock size={13} /> SSH Ключ {/* i18n-ignore */}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password or Key Input */}
              {authType === "password" ? (
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    Пароль root пользователя VPS: {/* i18n-ignore */}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль сервера..." // i18n-ignore
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#161f30",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 13,
                    }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    Приватный SSH ключ (PEM / OpenSSH): {/* i18n-ignore */}
                  </label>
                  <textarea
                    rows={4}
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." // i18n-ignore
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#161f30",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  />
                </div>
              )}

              {/* Admin Email & Verification Code Notice */}
              <div
                style={{
                  padding: 12,
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                  borderRadius: 10,
                }}
              >
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#60a5fa", marginBottom: 4 }}>
                  ✉️ Email администратора для проверочного кода авторизации: {/* i18n-ignore */}
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@yourcompany.com" // i18n-ignore
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#161f30",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#f8fafc",
                    fontSize: 13,
                  }}
                />
                <p style={{ margin: "6px 0 0 0", fontSize: 11, color: "#94a3b8" }}>
                  На данный email будет отправлено автоматическое письмо с 6-значным проверочным кодом после сборки. {/* i18n-ignore */}
                </p>
              </div>

              {/* Git Repository & Branch */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    Git репозиторий: {/* i18n-ignore */}
                  </label>
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#161f30",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    Ветка: {/* i18n-ignore */}
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#161f30",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#f8fafc",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Simulation Mode Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: simulationMode ? "rgba(245, 158, 11, 0.12)" : "rgba(255, 255, 255, 0.04)",
                  border: simulationMode ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: simulationMode ? "#fbbf24" : "#e2e8f0" }}>
                    🧪 Режим симуляции (Dry-Run / Unit-test) {/* i18n-ignore */}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Позволяет мгновенно протестировать все 7 шагов развертывания без реального сервера {/* i18n-ignore */}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={simulationMode}
                  onChange={(e) => setSimulationMode(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
              </div>
            </div>
          )}

          {/* VIEW: DEPLOYING & COMPLETE & FAILED */}
          {(view === "deploying" || view === "completed" || view === "failed") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Top Banner on Completed */}
              {view === "completed" && (
                <div
                  style={{
                    padding: "16px 20px",
                    borderRadius: 12,
                    background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)",
                    border: "1px solid rgba(16, 185, 129, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        padding: 8,
                        borderRadius: "50%",
                        background: "#10b981",
                        color: "#fff",
                      }}
                    >
                      <Check size={20} />
                    </span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 16, color: "#34d399", fontWeight: 700 }}>
                        Сервис успешно развернут и протестирован! {/* i18n-ignore */}
                      </h4>
                      <p style={{ margin: "2px 0 0 0", fontSize: 13, color: "#e2e8f0" }}>
                        Готов к полноценной работе:{" "} {/* i18n-ignore */}
                        <a
                          href={task?.result_url || `http://${host}:8290`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#60a5fa", fontWeight: 600, textDecoration: "underline" }}
                        >
                          {task?.result_url || `http://${host}:8290`}
                        </a>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button-primary small"
                    onClick={handleCopyCredentials}
                    style={{ background: "#10b981", color: "#fff", fontWeight: 600 }}
                  >
                    <Copy size={14} />
                    {copied ? "Скопировано!" /* i18n-ignore */ : "Копировать доступ" /* i18n-ignore */}
                  </button>
                </div>
              )}

              {/* Top Banner on Failed */}
              {view === "failed" && (
                <div
                  style={{
                    padding: "14px 18px",
                    borderRadius: 12,
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Alert size={20} />
                  <div>
                    <strong style={{ display: "block", fontSize: 14 }}>
                      Ошибка в процессе развертывания {/* i18n-ignore */}
                    </strong>
                    <span style={{ fontSize: 12 }}>
                      {task?.error || "Проверьте детали в журнале событий ниже." /* i18n-ignore */}
                    </span>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: "#94a3b8" }}>
                    Прогресс развертывания: {/* i18n-ignore */}
                  </span>
                  <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                    {task?.progress_pct || 0}%
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 8,
                    borderRadius: 4,
                    background: "rgba(255, 255, 255, 0.1)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${task?.progress_pct || 0}%`,
                      background: view === "failed"
                        ? "#ef4444"
                        : "linear-gradient(90deg, #3b82f6 0%, #10b981 100%)",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>

              {/* 7-Step Interactive Stepper */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 10,
                }}
              >
                {stepsList.map((s) => {
                  const stepInfo = task?.steps_summary?.[s.num];
                  const stepStatus = stepInfo?.status || "pending";
                  const isDone = stepStatus === "completed";
                  const isRunning = stepStatus === "running";
                  const isFailed = stepStatus === "failed";

                  return (
                    <div
                      key={s.num}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: isDone
                          ? "rgba(16, 185, 129, 0.1)"
                          : isRunning
                          ? "rgba(59, 130, 246, 0.15)"
                          : isFailed
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(255, 255, 255, 0.03)",
                        border: isDone
                          ? "1px solid rgba(16, 185, 129, 0.3)"
                          : isRunning
                          ? "1px solid rgba(59, 130, 246, 0.4)"
                          : isFailed
                          ? "1px solid rgba(239, 68, 68, 0.4)"
                          : "1px solid rgba(255, 255, 255, 0.06)",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          padding: 6,
                          borderRadius: 6,
                          background: isDone
                            ? "#10b981"
                            : isRunning
                            ? "#2563eb"
                            : isFailed
                            ? "#ef4444"
                            : "#334155",
                          color: "#fff",
                        }}
                      >
                        {isDone ? <Check size={14} /> : isFailed ? <Cross size={14} /> : s.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: isDone ? "#34d399" : isRunning ? "#60a5fa" : isFailed ? "#f87171" : "#94a3b8",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.num}. {s.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                            marginTop: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {stepInfo?.details || (isRunning ? "Выполняется..." /* i18n-ignore */ : "В очереди" /* i18n-ignore */)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary Checklist on Completion */}
              {view === "completed" && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc", marginBottom: 8 }}>
                    📋 Сводка проверки готовности сервиса: {/* i18n-ignore */}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34d399" }}>
                      <Check size={14} /> Docker & Compose v2 запущены {/* i18n-ignore */}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34d399" }}>
                      <Check size={14} /> PostgreSQL и конфигурация .env активны {/* i18n-ignore */}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34d399" }}>
                      <Check size={14} /> Health Check HTTP 200 OK (порт 8290) {/* i18n-ignore */}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34d399" }}>
                      <Check size={14} /> Шлюз терминалов (порт 8291) открыт {/* i18n-ignore */}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34d399" }}>
                      <Check size={14} /> Email с проверочным кодом отправлен на {adminEmail} {/* i18n-ignore */}
                    </div>
                    {task?.verification_code && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fbbf24" }}>
                        🔑 Код входа: <strong>{task.verification_code}</strong> {/* i18n-ignore */}
                      </div>
                    )}
                  </div>

                  {/* Test Email Button */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="button"
                      className="button-ghost small"
                      onClick={handleSendTestEmail}
                      disabled={isSendingTestEmail}
                    >
                      <Mail size={13} />
                      {isSendingTestEmail ? "Отправка..." /* i18n-ignore */ : "Повторно отправить проверочный email с кодом" /* i18n-ignore */}
                    </button>
                    {testEmailResult && (
                      <span style={{ fontSize: 11, color: "#34d399" }}>
                        {testEmailResult}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Terminal Log Console */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
                    Журнал выполнения (Live Terminal Log): {/* i18n-ignore */}
                  </span>
                  <button
                    type="button"
                    className="button-ghost small"
                    onClick={handleCopyLogs}
                    style={{ fontSize: 11 }}
                  >
                    <Copy size={12} />
                    {copied ? "Скопировано" /* i18n-ignore */ : "Копировать логи" /* i18n-ignore */}
                  </button>
                </div>
                <div
                  style={{
                    height: 220,
                    overflowY: "auto",
                    borderRadius: 8,
                    background: "#080c14",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    padding: "10px 14px",
                    fontFamily: "JetBrains Mono, Menlo, monospace", // i18n-ignore
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  {(task?.logs || []).map((line, idx) => {
                    let color = "#cbd5e1";
                    if (line.includes("[STEP") || line.includes("[Шаг")) color = "#38bdf8";
                    else if (line.includes("OK") || line.includes("успешно") || line.includes("✅") || line.includes("🎉")) color = "#4ade80";
                    else if (line.includes("ПРЕДУПРЕЖДЕНИЕ") || line.includes("warning")) color = "#facc15";
                    else if (line.includes("ОШИБКА") || line.includes("error") || line.includes("❌")) color = "#f87171";
                    else if (line.includes("EMAIL") || line.includes("код")) color = "#c084fc";

                    return (
                      <div key={idx} style={{ color }}>
                        {line}
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 20px",
            background: "#161f30",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 10,
          }}
        >
          {view === "config" && (
            <>
              <button type="button" className="button-ghost small" onClick={onClose}>
                Отмена {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className="button-primary small"
                disabled={isStarting || !host}
                onClick={handleStartDeploy}
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  padding: "8px 18px",
                }}
              >
                🚀 Запустить развертывание в 1 клик {/* i18n-ignore */}
              </button>
            </>
          )}

          {view === "deploying" && (
            <>
              <button
                type="button"
                className="button small"
                onClick={() => setIsMinimized(true)}
                title={"Скрыть ход установки (свернуть в плавающее окно)" /* i18n-ignore */}
              >
                <span>➖ Скрыть ход установки</span> {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className="button-ghost small"
                onClick={() => void handleCancelDeploy()}
                style={{ color: "#ef4444" }}
                title={"Остановить и отменить развертывание" /* i18n-ignore */}
              >
                <span>✕ Прервать развертывание</span> {/* i18n-ignore */}
              </button>
            </>
          )}

          {view === "completed" && (
            <>
              <button type="button" className="button-ghost small" onClick={onClose}>
                Закрыть окно {/* i18n-ignore */}
              </button>
              <a
                href={task?.result_url || `http://${host}:8290`}
                target="_blank"
                rel="noreferrer"
                className="button-primary small"
                style={{
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                <Globe size={14} />
                Перейти к сервису tTerm Web {/* i18n-ignore */}
              </a>
            </>
          )}

          {view === "failed" && (
            <>
              <button type="button" className="button-ghost small" onClick={onClose}>
                Закрыть {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className="button-plain small"
                onClick={() => setView("config")}
                style={{ background: "#2563eb", color: "#fff" }}
              >
                Изменить параметры и повторить {/* i18n-ignore */}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
