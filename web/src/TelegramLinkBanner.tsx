import { useEffect, useState } from "react";
import { Check, Close, Plane, Mail } from "./icons";
import {
  getTelegramBindLink,
  getTelegramProfileStatus,
  linkEmailToTelegram,
  verifyEmailLinkCode,
  type TelegramProfileStatus,
} from "./api";

interface TelegramLinkBannerProps {
  notify?: (text: string) => void;
  onOpenSettings?: (section: any) => void;
}

const DISMISS_KEY = "tterm.tg_link_banner_dismissed_at";
const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export function TelegramLinkBanner({ notify, onOpenSettings }: TelegramLinkBannerProps) {
  const [status, setStatus] = useState<TelegramProfileStatus | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [linking, setLinking] = useState(false);
  const [justBound, setJustBound] = useState(false);

  // Email linking state (when inside Telegram Web App or without real email)
  const [emailInput, setEmailInput] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const isTelegramWebApp =
    typeof window !== "undefined" &&
    Boolean(
      (window as any).Telegram?.WebApp?.initData ||
        window.location.hash.includes("tgWebAppData") ||
        window.location.search.includes("tgWebApp")
    );

  useEffect(() => {
    // Check local storage dismissal
    if (typeof window !== "undefined" && window.localStorage) {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const diff = Date.now() - parseInt(dismissedAt, 10);
        if (diff < DISMISS_DURATION_MS) {
          setDismissed(true);
          return;
        }
      }
    }

    void checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const s = await getTelegramProfileStatus();
      setStatus(s);

      // If user has a real email AND Telegram connected or running in Telegram WebApp, no banner needed!
      if (s.has_real_email && (s.bound || isTelegramWebApp)) {
        setDismissed(true);
        return;
      }

      // Inside Telegram Web App: only show email link prompt if user has no real email yet
      if (isTelegramWebApp || s.is_telegram_user) {
        if (!s.has_real_email) {
          setDismissed(false);
        } else {
          setDismissed(true);
        }
        return;
      }

      // Regular browser: show connect telegram banner only if telegram is not bound yet
      if (s.bound) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    } catch {
      setDismissed(true);
    }
  };

  const handleBindTelegram = async () => {
    setLinking(true);
    try {
      const res = await getTelegramBindLink();
      if (res.bind_url) {
        window.open(res.bind_url, "_blank");
        notify?.("🚀 Откройте Telegram и нажмите кнопку «Запустить» (/start)"); // i18n-ignore

        // Poll for completion
        let tries = 0;
        const interval = setInterval(async () => {
          tries += 1;
          try {
            const next = await getTelegramProfileStatus();
            if (next.bound) {
              clearInterval(interval);
              setStatus(next);
              setJustBound(true);
              setLinking(false);
              notify?.("✅ Telegram-профиль успешно привязан к вашему аккаунту!"); // i18n-ignore
            }
          } catch {
            // Ignore poll error
          }
          if (tries > 30) {
            clearInterval(interval);
            setLinking(false);
          }
        }, 3000);
      }
    } catch (e) {
      notify?.(`❌ Ошибка получения ссылки: ${(e as Error).message}`); // i18n-ignore
      setLinking(false);
    }
  };

  const handleSendEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = emailInput.trim().toLowerCase();
    if (!mail || !mail.includes("@")) {
      notify?.("⚠️ Пожалуйста, укажите корректный email адрес"); // i18n-ignore
      return;
    }
    setSendingCode(true);
    try {
      const res = await linkEmailToTelegram(mail);
      if (res.ok) {
        setCodeSent(true);
        notify?.(`📧 Код подтверждения отправлен на ${mail}`); // i18n-ignore
      }
    } catch (err) {
      notify?.(`❌ Ошибка отправки: ${(err as Error).message}`); // i18n-ignore
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code || code.length < 5) {
      notify?.("⚠️ Введите 6-значный код подтверждения из письма"); // i18n-ignore
      return;
    }
    setVerifyingCode(true);
    try {
      const res = await verifyEmailLinkCode(emailInput.trim().toLowerCase(), code);
      if (res.ok) {
        notify?.("✅ Почта успешно привязана! Проекты и аккаунты объединены."); // i18n-ignore
        setJustBound(true);
        setDismissed(true);
        // Refresh page to load merged projects and session
        window.location.reload();
      }
    } catch (err) {
      notify?.(`❌ Ошибка проверки кода: ${(err as Error).message}`); // i18n-ignore
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  };

  if (dismissed && !justBound) {
    return null;
  }

  const botUsername = status?.bot_username || "ttermnofbot";
  const botLink = status?.bot_link || `https://t.me/${botUsername}`;
  const needsEmail = !status?.has_real_email && (isTelegramWebApp || Boolean(status?.is_telegram_user));

  // If already dismissed, or if the user already has real email and is bound or in Telegram WebApp, don't show
  if (dismissed || (status?.has_real_email && (status?.bound || isTelegramWebApp))) {
    return null;
  }

  return (
    <div
      className="telegram-link-banner"
      role="region"
      aria-label={"Telegram Integration" /* i18n-ignore */}
      style={{
        margin: "12px 16px 16px 16px",
        padding: "16px 20px",
        borderRadius: "12px",
        background: "linear-gradient(135deg, rgba(224, 159, 62, 0.08) 0%, rgba(26, 26, 26, 0.95) 100%)",
        border: "1px solid rgba(224, 159, 62, 0.35)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(224, 159, 62, 0.15)",
              color: "#E09F3E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {needsEmail ? <Mail size={20} /> : justBound || status?.bound ? <Check size={20} /> : <Plane size={20} />}
          </div>
          <div>
            <strong style={{ fontSize: "14px", color: "var(--ink)", display: "block" }}>
              {needsEmail
                ? "Привяжите электронную почту (Email)" /* i18n-ignore */
                : justBound || status?.bound
                ? `Telegram успешно подключен (@${status?.username || status?.chat_id})` /* i18n-ignore */
                : "Подключите Telegram-бота для синхронизации и Web App" /* i18n-ignore */}
            </strong>
            <span style={{ fontSize: "12px", color: "var(--dim)" }}>
              {needsEmail
                ? "Для входа в tTerm с любого браузера и объединения проектов" /* i18n-ignore */
                : status?.user_email
                ? `Текущий аккаунт: ${status.user_email}` /* i18n-ignore */
                : "Единый профиль tTerm" /* i18n-ignore */}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="button-ghost small"
          onClick={handleDismiss}
          title="Скрыть уведомление" /* i18n-ignore */
          style={{ padding: "4px 8px", color: "var(--dim)" }}
        >
          <Close size={14} />
        </button>
      </div>

      {needsEmail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.45", color: "var(--ink)" }}>
            {codeSent
              ? `Мы отправили 6-значный код подтверждения на ${emailInput}. Введите его ниже для объединения:` /* i18n-ignore */
              : "Вы вошли через Telegram. Укажите ваш email, чтобы объединить существующие серверы и открывать терминалы с любых компьютеров:" /* i18n-ignore */}
          </p>

          {!codeSent ? (
            <form onSubmit={handleSendEmailCode} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="email"
                required
                placeholder="klimov@e-klimov.ru"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(224, 159, 62, 0.4)",
                  background: "#1A1A1A",
                  color: "#EDEDED",
                  fontSize: "13px",
                  minWidth: "220px",
                }}
              />
              <button
                type="submit"
                disabled={sendingCode}
                className="button-accent small"
                style={{
                  background: "#E09F3E",
                  color: "#1A1A1A",
                  fontWeight: 600,
                  padding: "7px 14px",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {sendingCode ? "Отправка кода…" : "Получить код"} {/* i18n-ignore */}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyEmailCode} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                required
                maxLength={6}
                placeholder={"6-значный код" /* i18n-ignore */}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: "1px solid #E09F3E",
                  background: "#1A1A1A",
                  color: "#E09F3E",
                  fontWeight: "bold",
                  fontSize: "14px",
                  letterSpacing: "2px",
                  width: "140px",
                  textAlign: "center",
                }}
              />
              <button
                type="submit"
                disabled={verifyingCode}
                className="button-accent small"
                style={{
                  background: "#E09F3E",
                  color: "#1A1A1A",
                  fontWeight: 600,
                  padding: "7px 14px",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {verifyingCode ? "Проверка…" : "Подтвердить и связать"} {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className="button-ghost small"
                onClick={() => setCodeSent(false)}
                style={{ fontSize: "12px", color: "var(--dim)" }}
              >
                Изменить email {/* i18n-ignore */}
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.45", color: "var(--ink)" }}>
            {justBound || status?.bound ? (
              <span>
                {"Ваш Telegram связан с этим аккаунтом. Теперь вы можете открывать tTerm прямо внутри Telegram (Web App) со всеми вашими проектами без повторного ввода кодов, а также получать мгновенные push-оповещения." /* i18n-ignore */}
              </span>
            ) : (
              <span>
                {`Вы вошли через веб-интерфейс. Подключите официального бота @${botUsername} в один клик: аккаунты мгновенно объединятся, вы сможете открывать tTerm прямо внутри Telegram (Web App) сразу под вашим профилем и проектами без повторного ввода кодов.` /* i18n-ignore */}
              </span>
            )}
          </p>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "2px" }}>
            {justBound || status?.bound ? (
              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className="button-accent small"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#E09F3E",
                  color: "#1A1A1A",
                  fontWeight: 600,
                  textDecoration: "none",
                  padding: "6px 14px",
                  borderRadius: "6px",
                }}
              >
                <Plane size={14} />
                <span>Открыть в Telegram ↗</span> {/* i18n-ignore */}
              </a>
            ) : (
              <button
                type="button"
                className="button-accent small"
                disabled={linking}
                onClick={() => void handleBindTelegram()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "linear-gradient(135deg, #E09F3E 0%, #d48b28 100%)",
                  color: "#1A1A1A",
                  borderColor: "#E09F3E",
                  fontWeight: 600,
                  padding: "7px 16px",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <Plane size={15} />
                <span>{linking ? "Связывание с Telegram…" : "✈️ Подключить Telegram-бота"}</span> {/* i18n-ignore */}
              </button>
            )}

            {onOpenSettings && (
              <button
                type="button"
                className="button-ghost small"
                onClick={() => onOpenSettings("telegram")}
                style={{ fontSize: "12px", color: "var(--dim)" }}
              >
                Настройки бота {/* i18n-ignore */}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}