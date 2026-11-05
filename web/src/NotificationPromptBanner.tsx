import { useEffect, useState } from "react";
import { Bell, Close } from "./icons";
import {
  getNotificationSettings,
  getNotificationStatus,
  playNotificationChime,
  promptNotificationPermission,
  type NotificationStatus,
} from "./notifications";

interface NotificationPromptBannerProps {
  notify?: (text: string) => void;
}

const DISMISS_KEY = "tterm.notify.prompt_dismissed_at";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function NotificationPromptBanner({ notify }: NotificationPromptBannerProps) {
  const [status, setStatus] = useState<NotificationStatus>(getNotificationStatus());
  const [dismissed, setDismissed] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const current = getNotificationStatus();
    setStatus(current);

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

    // Show banner only if permission is default and notifications are enabled
    const settings = getNotificationSettings();
    if (current.permission === "default" && settings.enabled) {
      setDismissed(false);
    } else {
      setDismissed(true);
    }
  }, []);

  const handleRequestPermission = async () => {
    setRequesting(true);
    try {
      const res = await promptNotificationPermission(notify);
      setStatus(getNotificationStatus());
      if (res.granted) {
        setDismissed(true);
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleTestSound = () => {
    playNotificationChime(true);
    notify?.("🔊 Тестовый звуковой сигнал воспроизведён (Web Audio Synth)"); // i18n-ignore
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  };

  if (dismissed || status.permission === "granted") {
    return null;
  }

  return (
    <div className="notify-prompt-banner" role="alert">
      <div className="notify-prompt-banner-icon">
        <Bell size={18} />
      </div>
      <div className="notify-prompt-banner-body">
        <strong className="notify-prompt-banner-title">
          {/* i18n-ignore */}
          Включите уведомления о завершении фоновых команд и процессов
        </strong>
        <p className="notify-prompt-banner-desc">
          {/* i18n-ignore */}
          Браузер пришлёт системное оповещение и звуковой сигнал, когда завершится долгая сборка или скрипт (даже если вкладка свёрнута).
        </p>
      </div>
      <div className="notify-prompt-banner-actions">
        <button
          type="button"
          className="button-plain small"
          onClick={() => void handleRequestPermission()}
          disabled={requesting}
        >
          <Bell size={13} />
          <span>{requesting ? "Запрос…" : "Включить уведомления"}</span> {/* i18n-ignore */}
        </button>
        <button
          type="button"
          className="button-ghost small"
          onClick={handleTestSound}
          title="Проверить звук" /* i18n-ignore */
        >
          <span>🔊 Звук</span> {/* i18n-ignore */}
        </button>
        <button
          type="button"
          className="icon-button small"
          onClick={handleDismiss}
          title="Скрыть" /* i18n-ignore */
          aria-label="Скрыть" /* i18n-ignore */
        >
          <Close size={14} />
        </button>
      </div>
    </div>
  );
}
