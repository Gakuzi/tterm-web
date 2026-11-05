// Modal dialog that explains browser push restrictions on insecure HTTP origins
// and guides user to audio chime, tab flashing, and Telegram Push Notification Bot.

import { useEffect, useState } from "react";
import { copyToClipboard } from "./clipboard";
import { Check, Close, Copy, Plane, Warning } from "./icons";
import { playNotificationChime } from "./notifications";

interface NotificationHttpNoticeModalProps {
  open?: boolean;
  onClose?: () => void;
  notify?: (text: string) => void;
  onConfigureTelegram?: () => void;
}

export function NotificationHttpNoticeModal(props: NotificationHttpNoticeModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [soundTested, setSoundTested] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }

    const handleOpenEvent = (event: Event) => {
      const customEv = event as CustomEvent<{ origin?: string }>;
      if (customEv.detail?.origin) {
        setOrigin(customEv.detail.origin);
      }
      setInternalOpen(true);
    };

    window.addEventListener("tterm:show-http-notify-modal", handleOpenEvent);
    return () => {
      window.removeEventListener("tterm:show-http-notify-modal", handleOpenEvent);
    };
  }, []);

  const isOpen = props.open !== undefined ? props.open : internalOpen;

  const handleClose = () => {
    setInternalOpen(false);
    props.onClose?.();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentOrigin = origin || (typeof window !== "undefined" ? window.location.origin : "http://localhost:8290");
  const chromeFlagUrl = "chrome://flags/#unsafely-treat-insecure-origin-as-secure";

  const handleTestSound = () => {
    playNotificationChime(true);
    setSoundTested(true);
    props.notify?.("🔊 Тестовый звуковой сигнал успешно воспроизведён (Web Audio Synth)"); // i18n-ignore
    setTimeout(() => setSoundTested(false), 3000);
  };

  const handleCopyOrigin = async () => {
    await copyToClipboard(currentOrigin);
    setCopiedOrigin(true);
    props.notify?.(`Скопировано в буфер: ${currentOrigin}`); // i18n-ignore
    setTimeout(() => setCopiedOrigin(false), 2000);
  };

  const handleCopyFlag = async () => {
    await copyToClipboard(chromeFlagUrl);
    setCopiedFlag(true);
    props.notify?.("Скопирован адрес флага Chrome!"); // i18n-ignore
    setTimeout(() => setCopiedFlag(false), 2000);
  };

  const handleGoTelegram = () => {
    handleClose();
    if (props.onConfigureTelegram) {
      props.onConfigureTelegram();
    } else {
      window.dispatchEvent(new CustomEvent("tterm:open-settings-section", { detail: { section: "telegram" } }));
    }
  };

  return (
    <div className="scrim" onClick={handleClose}>
      <section
        className="dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="http-notify-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <div className="dialog-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#f59e0b", display: "inline-flex" }}>
              <Warning size={22} />
            </span>
            <h3 id="http-notify-title" style={{ margin: 0, fontSize: 16 }}>
              {/* i18n-ignore */}
              Ограничение системных push-окон на HTTP
            </h3>
          </div>
          <button
            type="button"
            className="icon-button small"
            aria-label="Закрыть" /* i18n-ignore */
            onClick={handleClose}
          >
            <Close size={16} />
          </button>
        </div>

        <div className="help-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            {/* i18n-ignore */}
            Браузеры (Chrome, Safari, Firefox) по стандартам W3C блокируют системные всплывающие окна ОС на незащищенных HTTP IP-адресах (<code>{currentOrigin}</code>). Поэтому диалог разрешения не появляется на экране.
          </p>

          <div
            style={{
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: 8,
              padding: "12px 14px",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, color: "#10b981", marginBottom: 6 }}>
              {/* i18n-ignore */}
              ✅ tTerm автоматически активировал для вас:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink)" }}>
              {/* i18n-ignore */}
              <li>🔊 <strong>Звуковые сигналы</strong> (Web Audio Synth) — звучат при завершении фоновых задач, даже если вкладка свёрнута.</li>
              {/* i18n-ignore */}
              <li>🔔 <strong>Мигание заголовка вкладки</strong> — визуально сигнализирует в браузере о завершении процессов.</li>
              {/* i18n-ignore */}
              <li>💬 <strong>Всплывающие уведомления в приложении</strong> (in-app toasts).</li>
            </ul>
          </div>

          <div
            style={{
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Plane size={16} className="text-accent" />
              <strong style={{ fontSize: 13, color: "#60a5fa" }}>
                {/* i18n-ignore */}
                📱 100% надёжная доставка: Telegram Бот
              </strong>
            </div>
            <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "var(--dim)", lineHeight: 1.4 }}>
              {/* i18n-ignore */}
              Telegram Бот мгновенно присылает уведомления на ваш телефон и компьютер с названием команды, временем выполнения и статусом, независимо от протокола HTTP/HTTPS!
            </p>
            <button
              type="button"
              className="button-accent small"
              onClick={handleGoTelegram}
            >
              <Plane size={14} />
              {/* i18n-ignore */}
              <span>Настроить Telegram Бот</span>
            </button>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: "var(--dim)",
            }}
          >
            <strong style={{ color: "var(--ink)", display: "block", marginBottom: 4 }}>
              {/* i18n-ignore */}
              💡 Для Google Chrome / Chromium (опционально):
            </strong>
            <p style={{ margin: "0 0 8px 0", lineHeight: 1.4 }}>
              {/* i18n-ignore */}
              Если вы хотите включить нативные окна ОС без HTTPS:
            </p>
            <ol style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
              {/* i18n-ignore */}
              <li>Откройте в Chrome: <code>{chromeFlagUrl}</code></li>
              {/* i18n-ignore */}
              <li>Выберите <strong>Enabled</strong> и укажите адрес: <code>{currentOrigin}</code></li>
              {/* i18n-ignore */}
              <li>Нажмите <strong>Relaunch</strong> для перезапуска Chrome.</li>
            </ol>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button-ghost small"
                onClick={handleCopyOrigin}
              >
                {copiedOrigin ? <Check size={13} /> : <Copy size={13} />}
                {/* i18n-ignore */}
                <span>{copiedOrigin ? "Скопировано!" : `Копировать адрес ${currentOrigin}`}</span>
              </button>
              <button
                type="button"
                className="button-ghost small"
                onClick={handleCopyFlag}
              >
                {copiedFlag ? <Check size={13} /> : <Copy size={13} />}
                {/* i18n-ignore */}
                <span>{copiedFlag ? "Скопировано!" : "Копировать адрес флага"}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="button-row end" style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button
            type="button"
            className="button-ghost small"
            onClick={handleTestSound}
          >
            {soundTested ? <Check size={14} /> : null}
            {/* i18n-ignore */}
            <span>{soundTested ? "Звук воспроизведён 🔊" : "🔊 Проверить звук"}</span>
          </button>
          <button
            type="button"
            className="button-plain small"
            onClick={handleClose}
          >
            {/* i18n-ignore */}
            Понятно
          </button>
        </div>
      </section>
    </div>
  );
}
