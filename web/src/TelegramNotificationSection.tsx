// Telegram Unified Bot & Web App Hub Profile Binding Section.
// Single-button account binding for multi-device push notifications and Web App access.

import { useEffect, useState } from "react";
import {
  getTelegramBindLink,
  getTelegramProfileStatus,
  testTelegramNotification,
  unbindTelegramProfile,
  type TelegramProfileStatus,
} from "./api";
import { Check, Plane, Trash, Warning } from "./icons";
import { playNotificationChime } from "./notifications";
import { Group, Row } from "./SettingsRows";

interface TelegramNotificationSectionProps {
  notify: (text: string) => void;
  compact?: boolean;
}

export function TelegramNotificationSection(props: TelegramNotificationSectionProps) {
  const { notify } = props;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<TelegramProfileStatus | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isUnbinding, setIsUnbinding] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; text?: string } | null>(null);

  const loadStatus = async () => {
    try {
      const res = await getTelegramProfileStatus();
      setStatus(res);
    } catch {
      // Standalone or offline backend
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleBind = async () => {
    setIsLinking(true);
    try {
      const res = await getTelegramBindLink();
      if (res.bind_url) {
        window.open(res.bind_url, "_blank");
        notify("🚀 Перейдите в Telegram и нажмите кнопку «Запустить» (/start) для завершения привязки"); // i18n-ignore

        // Start background polling to automatically detect when user clicks /start in Telegram
        let tries = 0;
        const interval = setInterval(async () => {
          tries += 1;
          try {
            const next = await getTelegramProfileStatus();
            if (next.bound) {
              clearInterval(interval);
              setStatus(next);
              setIsLinking(false);
              playNotificationChime(true);
              notify("✅ Telegram-профиль успешно привязан к вашему аккаунту!"); // i18n-ignore
            }
          } catch {
            // Ignore error during polling
          }
          if (tries >= 30) {
            clearInterval(interval);
            setIsLinking(false);
          }
        }, 2500);
      } else {
        setIsLinking(false);
      }
    } catch (e) {
      notify(`❌ Ошибка получения ссылки привязки: ${(e as Error).message}`); // i18n-ignore
      setIsLinking(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testTelegramNotification({});
      if (res.delivered) {
        playNotificationChime(true);
        setTestResult({ success: true, text: "Уведомление доставлено в ваш Telegram! 🚀" }); // i18n-ignore
        notify("✅ Тестовое уведомление доставлено в ваш Telegram!"); // i18n-ignore
      } else {
        playNotificationChime(false);
        setTestResult({ success: false, text: res.message || "Ошибка отправки в Telegram" }); // i18n-ignore
        notify(`⚠️ Не удалось доставить: ${res.message || "проверьте статус бота"}`); // i18n-ignore
      }
    } catch (e) {
      playNotificationChime(false);
      setTestResult({ success: false, text: (e as Error).message });
      notify(`❌ Ошибка проверки: ${(e as Error).message}`); // i18n-ignore
    } finally {
      setIsTesting(false);
    }
  };

  const handleUnbind = async () => {
    if (!window.confirm("Отвязать ваш Telegram-профиль от этого аккаунта tTerm?")) { // i18n-ignore
      return;
    }
    setIsUnbinding(true);
    try {
      await unbindTelegramProfile();
      setStatus((prev) => (prev ? { ...prev, bound: false, chat_id: null, username: null } : null));
      setTestResult(null);
      notify("🗑 Telegram-профиль успешно отвязан"); // i18n-ignore
    } catch (e) {
      notify(`Ошибка отвязки: ${(e as Error).message}`); // i18n-ignore
    } finally {
      setIsUnbinding(false);
    }
  };

  const isBound = Boolean(status?.bound);
  const botUsername = status?.bot_username || "ttermnofbot";
  const botLink = status?.bot_link || `https://t.me/${botUsername}`;

  return (
    <Group
      title={"Telegram-бот, Web App и Push-уведомления" /* i18n-ignore */}
      note={
        /* i18n-ignore */
        "Единый бот для авторизации без паролей, моментальных push-уведомлений, подтверждения опасных команд и запуска терминала внутри Telegram."
      }
    >
      <Row
        label={"Статус профиля" /* i18n-ignore */}
        note={
          loading
            ? "Проверка статуса…" /* i18n-ignore */
            : isBound
            ? `@${status?.username || status?.chat_id} • Chat ID: ${status?.chat_id || "—"}` /* i18n-ignore */
            : "Telegram-профиль не привязан" /* i18n-ignore */
        }
        words={"telegram бот статус привязка профиль webapp пуш" /* i18n-ignore */}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {loading ? (
            <span style={{ fontSize: 12, color: "var(--dim)" }}>Загрузка…</span> /* i18n-ignore */
          ) : isBound ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.12)",
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              <Check size={14} />
              <span>Подключён 🟢</span> {/* i18n-ignore */}
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--dim)",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              ⚪ Не привязан {/* i18n-ignore */}
            </span>
          )}
        </div>
      </Row>

      {!isBound ? (
        <Row
          label={"Привязка и синхронизация в 1 клик" /* i18n-ignore */}
          note={
            /* i18n-ignore */
            "Вы вошли в tTerm по почте. Нажмите кнопку, чтобы привязать официального бота @" +
            botUsername +
            /* i18n-ignore */
            ". Аккаунты мгновенно объединятся: вы сможете запускать tTerm прямо в Telegram (Web App) сразу под вашим профилем и проектами без повторного ввода кодов, а также получать оперативные уведомления о терминалах."
          }
          words={"привязать подключить telegram бот синхронизация webapp" /* i18n-ignore */}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="button-accent"
              disabled={isLinking || loading}
              onClick={handleBind}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: 13,
                background: "linear-gradient(135deg, #E09F3E 0%, #d48b28 100%)",
                borderColor: "#E09F3E",
                color: "#1A1A1A",
              }}
            >
              <Plane size={15} />
              <span>{isLinking ? "Связывание с Telegram…" : "✈️ Привязать Telegram-бота"}</span> {/* i18n-ignore */}
            </button>
          </div>
        </Row>
      ) : (
        <>
          <Row
            label={"Действия и доступ" /* i18n-ignore */}
            note={`Официальный бот: @${botUsername}` /* i18n-ignore */}
            words={"бот чат открыть telegram webapp отвязать" /* i18n-ignore */}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className="button small"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                }}
              >
                <Plane size={14} />
                <span>Открыть бота в Telegram ↗</span> {/* i18n-ignore */}
              </a>

              <button
                type="button"
                className="button-ghost small text-danger"
                disabled={isUnbinding}
                onClick={handleUnbind}
                title="Отвязать Telegram-профиль" /* i18n-ignore */
              >
                <Trash size={13} />
                <span>{isUnbinding ? "Отвязка…" : "Отвязать"}</span> {/* i18n-ignore */}
              </button>
            </div>
          </Row>

          <Row
            label={"Проверка доставки" /* i18n-ignore */}
            note={"Отправьте тестовое push-уведомление в Telegram прямо сейчас" /* i18n-ignore */}
            words={"тест проверка отправка пуш сообщение" /* i18n-ignore */}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              <button
                type="button"
                className="button-ghost small"
                disabled={isTesting}
                onClick={handleTest}
              >
                <Plane size={13} />
                <span>{isTesting ? "Отправка в Telegram…" : "🚀 Отправить тестовое уведомление"}</span> {/* i18n-ignore */}
              </button>

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
        </>
      )}
    </Group>
  );
}
