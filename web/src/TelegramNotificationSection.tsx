// Telegram Push Notification Bot Settings & Account Section.
// Dispatches instant real-time alerts to user's mobile or desktop Telegram app
// when long-running commands, docker builds, or server tasks finish.
// Works 100% reliably regardless of plain HTTP or HTTPS context.

import { useEffect, useState } from "react";
import {
  deleteTelegramConfig,
  getTelegramConfig,
  saveTelegramConfig,
  testTelegramNotification,
  type TelegramConfigStatus,
} from "./api";
import { Check, Lock, Plane, Trash, Unlock, Warning } from "./icons";
import { playNotificationChime } from "./notifications";
import { Group, Row } from "./SettingsRows";

interface TelegramNotificationSectionProps {
  notify: (text: string) => void;
  compact?: boolean;
}

export function TelegramNotificationSection(props: TelegramNotificationSectionProps) {
  const { notify } = props;

  const [loading, setLoading] = useState(true);
  void loading;
  const [status, setStatus] = useState<TelegramConfigStatus | null>(null);

  // Form input state
  const [tokenInput, setTokenInput] = useState("");
  const [chatIdInput, setChatIdInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Action states
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; text?: string } | null>(null);

  const loadConfig = async () => {
    try {
      const cfg = await getTelegramConfig();
      setStatus(cfg);
      if (cfg.configured && cfg.chat_id) {
        setChatIdInput(cfg.chat_id);
      }
    } catch {
      // Standalone or offline backend
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleSave = async () => {
    const token = tokenInput.trim();
    const chat = chatIdInput.trim();

    if (!status?.configured && (!token || !chat)) {
      notify("⚠️ Укажите токен бота Telegram и ваш Chat ID"); // i18n-ignore
      return;
    }

    setIsSaving(true);
    setTestResult(null);
    try {
      const res = await saveTelegramConfig({
        bot_token: token || undefined,
        chat_id: chat || undefined,
        enabled: true,
      });
      setStatus(res);
      setIsEditing(false);
      setTokenInput("");
      playNotificationChime(true);
      notify("✅ Настройки Telegram Бота успешно сохранены в Encrypted Vault!"); // i18n-ignore
    } catch (e) {
      notify(`❌ Ошибка сохранения: ${(e as Error).message}`); // i18n-ignore
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!status?.configured) return;
    const nextEnabled = !status.enabled;
    try {
      const res = await saveTelegramConfig({
        enabled: nextEnabled,
      });
      setStatus(res);
      notify(nextEnabled ? "🔔 Telegram уведомления включены" : "🔕 Telegram уведомления временно приостановлены"); // i18n-ignore
    } catch (e) {
      notify(`Ошибка: ${(e as Error).message}`); // i18n-ignore
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const token = tokenInput.trim() || undefined;
      const chat = chatIdInput.trim() || undefined;
      const res = await testTelegramNotification({ bot_token: token, chat_id: chat });
      if (res.delivered) {
        playNotificationChime(true);
        setTestResult({ success: true, text: "Сообщение успешно доставлено в Telegram! 🚀" }); // i18n-ignore
        notify("✅ Тестовое уведомление доставлено в ваш Telegram!"); // i18n-ignore
      } else {
        playNotificationChime(false);
        setTestResult({ success: false, text: res.message || "Ошибка отправки в Telegram" }); // i18n-ignore
        notify(`⚠️ Не удалось доставить: ${res.message || "проверьте токен и chat ID"}`); // i18n-ignore
      }
    } catch (e) {
      playNotificationChime(false);
      setTestResult({ success: false, text: (e as Error).message });
      notify(`❌ Ошибка проверки Telegram: ${(e as Error).message}`); // i18n-ignore
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Отключить Telegram Бота уведомлений от вашего аккаунта?")) { // i18n-ignore
      return;
    }
    setIsDeleting(true);
    try {
      await deleteTelegramConfig();
      setStatus({ ok: true, configured: false, enabled: false, chat_id: "", masked_token: "" });
      setTokenInput("");
      setChatIdInput("");
      setIsEditing(false);
      setTestResult(null);
      notify("🗑 Telegram Бот отключен"); // i18n-ignore
    } catch (e) {
      notify(`Ошибка удаления: ${(e as Error).message}`); // i18n-ignore
    } finally {
      setIsDeleting(false);
    }
  };

  const isConfigured = Boolean(status?.configured);

  return (
    <Group
      title={"Telegram Бот Уведомлений (Multi-Device Push)" /* i18n-ignore */}
      note={
        /* i18n-ignore */
        "Мгновенная доставка уведомлений о завершении команд на мобильный телефон или десктоп через официального Telegram бота. Работает на 100% надёжно независимо от протокола HTTP или HTTPS."
      }
    >
      <Row
        label={"Статус подключения" /* i18n-ignore */}
        note={
          isConfigured
            ? status?.enabled
              ? `Бот активен • Chat ID: ${status?.chat_id || "—"}` /* i18n-ignore */
              : "Уведомления через Telegram временно отключены" /* i18n-ignore */
            : "Telegram Бот не настроен" /* i18n-ignore */
        }
        words={"telegram бот статус пуш телефон уведомления чат" /* i18n-ignore */}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {isConfigured ? (
            <>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: status?.enabled ? "#10b981" : "#eab308",
                  background: status?.enabled ? "rgba(16, 185, 129, 0.12)" : "rgba(234, 179, 8, 0.12)",
                  padding: "3px 10px",
                  borderRadius: 6,
                }}
              >
                <Plane size={14} />
                {status?.enabled ? "Подключено 🟢" : "Приостановлено 🟡"} {/* i18n-ignore */}
              </span>
              <button
                type="button"
                className="button-ghost small"
                onClick={handleToggleEnabled}
              >
                {status?.enabled ? "Приостановить ⏸" : "Возобновить ▶️"} {/* i18n-ignore */}
              </button>
            </>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--dim)",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "3px 10px",
                borderRadius: 6,
              }}
            >
              ⚪ Не настроено {/* i18n-ignore */}
            </span>
          )}
        </div>
      </Row>

      {/* Instructions & Quick Links */}
      <Row
        label={"Инструкция по настройке" /* i18n-ignore */}
        note={"Простая настройка в 2 шага за 1 минуту" /* i18n-ignore */}
        words={"инструкция botfather userinfobot telegram помощь" /* i18n-ignore */}
      >
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--dim)" }}>
          <div style={{ marginBottom: 4 }}>
            {/* i18n-ignore */}
            1. Напишите <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "underline" }}>@BotFather</a> в Telegram команду <code>/newbot</code> и скопируйте полученный <strong>Bot Token</strong>.
          </div>
          <div>
            {/* i18n-ignore */}
            2. Напишите <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "underline" }}>@userinfobot</a> в Telegram, чтобы мгновенно узнать ваш <strong>Chat ID</strong> (цифры).
          </div>
        </div>
      </Row>

      {/* Form Fields: Token & Chat ID */}
      {(!isConfigured || isEditing) ? (
        <>
          <Row
            label={"Bot Token" /* i18n-ignore */}
            note={isConfigured ? `Текущий токен: ${status?.masked_token}` : "API токен бота от @BotFather"} /* i18n-ignore */
            words={"токен api bot token бот телеграм" /* i18n-ignore */}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%", maxWidth: 360 }}>
              <input
                type={showToken ? "text" : "password"}
                className="input-text"
                placeholder={isConfigured ? "Оставьте пустым, чтобы не менять" : "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"} /* i18n-ignore */
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
              <button
                type="button"
                className="icon-button small"
                title={showToken ? "Скрыть токен" : "Показать токен"} /* i18n-ignore */
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <Unlock size={14} /> : <Lock size={14} />}
              </button>
            </div>
          </Row>

          <Row
            label={"Chat ID" /* i18n-ignore */}
            note={"Ваш персональный ID от @userinfobot (например: 123456789)" /* i18n-ignore */}
            words={"chat id чат айди пользователь telegram" /* i18n-ignore */}
          >
            <div style={{ width: "100%", maxWidth: 360 }}>
              <input
                type="text"
                className="input-text"
                placeholder="123456789" /* i18n-ignore */
                value={chatIdInput}
                onChange={(e) => setChatIdInput(e.target.value)}
                style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
            </div>
          </Row>

          <Row
            label={"Действия" /* i18n-ignore */}
            words={"сохранить применить отмена telegram" /* i18n-ignore */}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="button-accent small"
                disabled={isSaving}
                onClick={handleSave}
              >
                <Plane size={13} />
                <span>{isSaving ? "Сохранение…" : "Сохранить бота"}</span> {/* i18n-ignore */}
              </button>
              {isConfigured && (
                <button
                  type="button"
                  className="button-plain small"
                  onClick={() => {
                    setIsEditing(false);
                    setTokenInput("");
                  }}
                >
                  Отмена {/* i18n-ignore */}
                </button>
              )}
            </div>
          </Row>
        </>
      ) : (
        <Row
          label={"Учётные данные" /* i18n-ignore */}
          note={`Токен: ${status?.masked_token} • Chat: ${status?.chat_id}`} /* i18n-ignore */
          words={"токен chat id редактировать изменить удалить" /* i18n-ignore */}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="button-ghost small"
              onClick={() => setIsEditing(true)}
            >
              Изменить ✏️ {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className="button-ghost small text-danger"
              disabled={isDeleting}
              onClick={handleDelete}
              title="Отключить Telegram бота" /* i18n-ignore */
            >
              <Trash size={13} />
              <span>{isDeleting ? "Удаление…" : "Отключить"}</span> {/* i18n-ignore */}
            </button>
          </div>
        </Row>
      )}

      {/* Test Notification Button & Status */}
      <Row
        label={"Тестовая отправка" /* i18n-ignore */}
        note={"Проверьте доставку тестового push-сообщения в Telegram прямо сейчас" /* i18n-ignore */}
        words={"тест проверка отправка пуш сообщение" /* i18n-ignore */}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="button small"
              disabled={isTesting || (!isConfigured && (!tokenInput || !chatIdInput))}
              onClick={handleTest}
            >
              <Plane size={13} />
              <span>{isTesting ? "Отправка в Telegram…" : "🚀 Отправить тестовое уведомление в Telegram"}</span> {/* i18n-ignore */}
            </button>
          </div>

          {testResult && (
            <div
              style={{
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: testResult.success ? "#10b981" : "#ef4444",
                background: testResult.success ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              {testResult.success ? <Check size={14} /> : <Warning size={14} />}
              <span>{testResult.text}</span>
            </div>
          )}
        </div>
      </Row>
    </Group>
  );
}
