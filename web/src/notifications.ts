// Web Push Notifications, Multi-Device Broadcast & Audio Chime System for tTerm

export interface AppNotification {
  id: string;
  type: "command_finished" | "drain_lock" | "appeal" | "comment";
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  entityId?: string;
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  thresholdSec: number;
  nativeNotification: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  sound: true,
  thresholdSec: 10,
  nativeNotification: true,
};

// ------------------------------------------------ LocalStorage Keys
const KEY_PREFIX = "tterm.notify.";
const KEY_ENABLED = `${KEY_PREFIX}enabled`;
const KEY_SOUND = `${KEY_PREFIX}sound`;
const KEY_THRESHOLD = `${KEY_PREFIX}threshold`;
const KEY_NATIVE = `${KEY_PREFIX}native`;
const KEY_DEVICE_ID = `${KEY_PREFIX}device_id`;
const KEY_DEVICE_NAME = `${KEY_PREFIX}device_name`;
const WATCHING_PREFIX = `${KEY_PREFIX}watching.`; // i18n-ignore

// ------------------------------------------------ Settings Helpers
export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
  const enabledStr = localStorage.getItem(KEY_ENABLED);
  const soundStr = localStorage.getItem(KEY_SOUND);
  const threshStr = localStorage.getItem(KEY_THRESHOLD);
  const nativeStr = localStorage.getItem(KEY_NATIVE);

  return {
    enabled: enabledStr !== null ? enabledStr === "true" : DEFAULT_NOTIFICATION_SETTINGS.enabled,
    sound: soundStr !== null ? soundStr === "true" : DEFAULT_NOTIFICATION_SETTINGS.sound,
    thresholdSec: threshStr !== null ? parseInt(threshStr, 10) || DEFAULT_NOTIFICATION_SETTINGS.thresholdSec : DEFAULT_NOTIFICATION_SETTINGS.thresholdSec,
    nativeNotification: nativeStr !== null ? nativeStr === "true" : DEFAULT_NOTIFICATION_SETTINGS.nativeNotification,
  };
}

export function saveNotificationSettings(partial: Partial<NotificationSettings>): NotificationSettings {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
  const current = getNotificationSettings();
  const next: NotificationSettings = { ...current, ...partial };

  localStorage.setItem(KEY_ENABLED, String(next.enabled));
  localStorage.setItem(KEY_SOUND, String(next.sound));
  localStorage.setItem(KEY_THRESHOLD, String(next.thresholdSec));
  localStorage.setItem(KEY_NATIVE, String(next.nativeNotification));

  window.dispatchEvent(new CustomEvent("tterm:notify-settings-changed", { detail: next }));
  return next;
}

// ------------------------------------------------ Device Identification
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return "dev_node_default";
  }
  let id = localStorage.getItem(KEY_DEVICE_ID);
  if (!id) {
    id = `dev_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(KEY_DEVICE_ID, id);
  }
  return id;
}

export function getDeviceName(): string {
  if (typeof window === "undefined") return "Server Device"; // i18n-ignore
  const saved = localStorage.getItem(KEY_DEVICE_NAME);
  if (saved) return saved;

  const ua = navigator.userAgent;
  let detected = "Web Browser"; // i18n-ignore
  if (/iPhone|iPad|iPod/.test(ua)) detected = "Apple iPhone/iPad"; // i18n-ignore
  else if (/Android/.test(ua)) detected = "Android Device"; // i18n-ignore
  else if (/Macintosh/.test(ua)) detected = "MacBook / Mac"; // i18n-ignore
  else if (/Windows/.test(ua)) detected = "Windows PC"; // i18n-ignore
  else if (/Linux/.test(ua)) detected = "Linux Machine"; // i18n-ignore

  localStorage.setItem(KEY_DEVICE_NAME, detected);
  return detected;
}

// ------------------------------------------------ Watched Blocks & Commands
export function isBlockWatched(key: string): boolean {
  if (typeof window === "undefined" || !window.localStorage || !key) return false;
  return localStorage.getItem(`${WATCHING_PREFIX}${key}`) !== null;
}

export function setBlockWatched(
  key: string,
  watched: boolean,
  meta?: { command?: string; terminalId?: string; startedAt?: number }
): void {
  if (typeof window === "undefined" || !window.localStorage || !key) return;
  const storageKey = `${WATCHING_PREFIX}${key}`;
  if (watched) {
    const data = {
      watched: true,
      time: Date.now(),
      command: meta?.command || "",
      terminalId: meta?.terminalId || "",
      startedAt: meta?.startedAt || Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(data));

    // Register on backend bot
    void fetch("/api/orchestration/notifications/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tterm": "1" },
      body: JSON.stringify({
        terminal_id: meta?.terminalId || "terminal",
        block_id: key,
        command: meta?.command || "",
        initiator_device_id: getOrCreateDeviceId(),
      }),
    }).catch(() => {
      // Backend may be offline or standalone
    });
  } else {
    localStorage.removeItem(storageKey);
  }
}

export function clearBlockWatched(key: string): void {
  if (typeof window === "undefined" || !window.localStorage || !key) return;
  localStorage.removeItem(`${WATCHING_PREFIX}${key}`);
}

export function listWatchedKeys(): string[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const res: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(WATCHING_PREFIX)) {
      res.push(k.substring(WATCHING_PREFIX.length));
    }
  }
  return res;
}

// ------------------------------------------------ Audio Chime System
export function playNotificationChime(success = true) {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.sound) return;

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    if (success) {
      // Pleasant rising arpeggio (A5 -> E6)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      // Alert chime (warning lower cadence 520 -> 350)
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(349.23, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch {
    // AudioContext blocked or not supported
  }
}

// ------------------------------------------------ Tab Title Flashing
let titleFlashInterval: number | null = null;
let originalDocTitle = "";

export function flashTabTitle(alertText: string) {
  if (typeof document === "undefined" || !document.hidden) return;
  if (!originalDocTitle) originalDocTitle = document.title;
  if (titleFlashInterval) clearInterval(titleFlashInterval);

  let step = 0;
  titleFlashInterval = window.setInterval(() => {
    if (!document.hidden) {
      stopTabTitleFlashing();
      return;
    }
    document.title = step % 2 === 0 ? `🔔 ${alertText}` : originalDocTitle;
    step++;
  }, 1000);

  const onFocus = () => {
    stopTabTitleFlashing();
    window.removeEventListener("focus", onFocus);
  };
  window.addEventListener("focus", onFocus);
}

export function stopTabTitleFlashing() {
  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
  }
  if (originalDocTitle && typeof document !== "undefined") {
    document.title = originalDocTitle;
    originalDocTitle = "";
  }
}

// ------------------------------------------------ Browser Native Push & Diagnostics
export interface NotificationStatus {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  isSecureContext: boolean;
  isHttpOrigin: boolean;
  insecureHttp: boolean;
}

export function isHttpInsecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return !window.isSecureContext && window.location.protocol === "http:";
}

export function getNotificationStatus(): NotificationStatus {
  const hasWindow = typeof window !== "undefined";
  if (!hasWindow || !("Notification" in window)) {
    const isSec = hasWindow ? Boolean(window.isSecureContext) : false;
    const isHttp = hasWindow ? window.location.protocol === "http:" : false;
    return {
      supported: false,
      permission: "unsupported",
      isSecureContext: isSec,
      isHttpOrigin: isHttp,
      insecureHttp: !isSec && isHttp,
    };
  }
  const isSec = Boolean(window.isSecureContext);
  const isHttp = window.location.protocol === "http:";
  return {
    supported: true,
    permission: Notification.permission,
    isSecureContext: isSec,
    isHttpOrigin: isHttp,
    insecureHttp: !isSec && isHttp,
  };
}

export async function promptNotificationPermission(
  notify?: (text: string) => void
): Promise<{ granted: boolean; reason?: string }> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    notify?.("⚠️ Браузер не поддерживает Web Notifications API"); // i18n-ignore
    return { granted: false, reason: "unsupported" };
  }

  // Modern browsers silently block/reject requestPermission on insecure HTTP origins (e.g. http://192.168.1.100:8290)
  if (isHttpInsecureContext()) {
    saveNotificationSettings({ enabled: true, sound: true, nativeNotification: true });
    playNotificationChime(true);
    notify?.("ℹ️ На HTTP (IP-адрес) браузер блокирует нативные окна ОС. Включены звук, мигание вкладки и Telegram-бот!"); // i18n-ignore
    window.dispatchEvent(new CustomEvent("tterm:show-http-notify-modal", {
      detail: { origin: window.location.origin }
    }));
    return { granted: false, reason: "insecure_http" };
  }

  // Modern browsers require direct user interaction for requestPermission
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      saveNotificationSettings({ enabled: true, nativeNotification: true });
      playNotificationChime(true);
      try {
        new Notification("✅ tTerm: Уведомления включены!", { // i18n-ignore
          body: "Вы будете получать системные уведомления о завершении долгих процессов и фоновых сборок.", // i18n-ignore
          icon: "/favicon.svg",
        });
      } catch {
        // Fallback if Notification constructor fails in context
      }
      notify?.("✅ Системные уведомления успешно разрешены в браузере!"); // i18n-ignore
      return { granted: true };
    } else if (perm === "denied") {
      notify?.("⚠️ Уведомления отклонены. Разрешите их в настройках сайта (иконка замка в адресной строке)."); // i18n-ignore
      return { granted: false, reason: "denied" };
    }
  } catch (err) {
    // If requestPermission rejects (e.g. Insecure HTTP origin restrictions)
    console.warn("requestPermission failed:", err);
  }

  // If permission is still default or rejected due to HTTP
  if (isHttpInsecureContext()) {
    playNotificationChime(true);
    notify?.("ℹ️ На HTTP (IP-адрес) браузер блокирует нативные окна ОС. Включены звук, мигание вкладки и Telegram-бот!"); // i18n-ignore
    window.dispatchEvent(new CustomEvent("tterm:show-http-notify-modal", {
      detail: { origin: window.location.origin }
    }));
    return { granted: false, reason: "insecure_http" };
  }

  return { granted: false, reason: "cancelled" };
}

export async function requestNotificationPermission(): Promise<boolean> {
  const res = await promptNotificationPermission();
  return res.granted;
}

export function showPushNotification(
  title: string,
  body: string,
  entityId?: string,
  onClick?: () => void
) {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  playNotificationChime();
  flashTabTitle(title);

  if (settings.nativeNotification && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: "/favicon.svg",
        tag: entityId || "tterm-general",
      });
      if (onClick) {
        n.onclick = () => {
          window.focus();
          onClick();
          n.close();
        };
      }
    } catch {
      // Fallback
    }
  }
}

// ------------------------------------------------ Unified Command Completion Notifier
export function notifyCommandCompleted(params: {
  command: string;
  exitCode: number | null;
  durationSec: number;
  blockId?: string;
  terminalId?: string;
  terminalName?: string;
  inAppNotify?: (text: string) => void;
  onSelectTerminal?: (terminalId: string) => void;
}) {
  const settings = getNotificationSettings();
  const isWatched = params.blockId ? isBlockWatched(params.blockId) : false;
  const isLongRunning = settings.enabled && settings.thresholdSec > 0 && params.durationSec >= settings.thresholdSec;

  if (!isWatched && !isLongRunning) {
    return;
  }

  // Clear watch if active
  if (params.blockId) {
    clearBlockWatched(params.blockId);
  }

  const isSuccess = params.exitCode === 0 || params.exitCode === null;
  const statusLabel = isSuccess ? "успешно" : `с ошибкой (код ${params.exitCode})`; // i18n-ignore
  const title = isSuccess ? "Команда завершена" : "Команда завершилась с ошибкой"; // i18n-ignore
  const cmdTrunc = params.command.length > 40 ? `${params.command.substring(0, 37)}...` : (params.command || "Команда"); // i18n-ignore
  const body = `${cmdTrunc} завершена ${statusLabel} за ${params.durationSec} сек.`; // i18n-ignore

  // 1. Play local chime
  playNotificationChime(isSuccess);

  // 2. Native notification
  showPushNotification(title, body, params.blockId || params.terminalId, () => {
    if (params.terminalId && params.onSelectTerminal) {
      params.onSelectTerminal(params.terminalId);
    }
  });

  // 3. In-App toast
  if (params.inAppNotify) {
    params.inAppNotify(`🔔 ${cmdTrunc} (${params.durationSec}с, код ${params.exitCode ?? 0})`); // i18n-ignore
  }

  // 4. Report to backend for Multi-Device Broadcast (so user's phone / other laptops get alerted!)
  void fetch("/api/orchestration/notifications/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tterm": "1" },
    body: JSON.stringify({
      terminal_id: params.terminalId || "terminal",
      command: params.command,
      exit_code: params.exitCode ?? 0,
      duration_sec: params.durationSec,
      block_id: params.blockId,
      initiator_device_id: getOrCreateDeviceId(),
    }),
  }).catch(() => {
    // Offline or standalone
  });
}

// ------------------------------------------------ Multi-Device Web-Bot Background Stream
let botEventSource: EventSource | null = null;
let registeredDevice = false;

export function initNotificationBot(userId?: string, inAppNotify?: (text: string) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const devId = getOrCreateDeviceId();
  const devName = getDeviceName();
  const uid = userId || "default_user";

  // Register device on backend
  if (!registeredDevice) {
    registeredDevice = true;
    void fetch("/api/orchestration/notifications/register-device", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tterm": "1" },
      body: JSON.stringify({
        device_id: devId,
        name: devName,
        user_id: uid,
      }),
    }).catch(() => {});
  }

  // Connect SSE stream for multi-device push
  if (!botEventSource) {
    const streamUrl = `/api/orchestration/notifications/stream?device_id=${encodeURIComponent(devId)}&user_id=${encodeURIComponent(uid)}`;
    try {
      const es = new EventSource(streamUrl);
      botEventSource = es;

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "command_completed" && payload.data) {
            const data = payload.data;
            // If completed by another device (e.g. command ran on MacBook, broadcast to phone!)
            if (data.initiator_device_id !== devId) {
              const success = data.exit_code === 0;
              playNotificationChime(success);
              showPushNotification(
                data.title || "tTerm: Процесс завершен", // i18n-ignore
                data.body || `Команда ${data.command} завершена (${data.duration_sec}с)`, // i18n-ignore
                data.block_id || data.terminal_id
              );
              inAppNotify?.(`📱 [${data.title}] ${data.body}`);
            }
          }
        } catch {
          // Heartbeat or malformed
        }
      };

      es.onerror = () => {
        // Auto-reconnect handled by browser EventSource
      };
    } catch {
      // SSE not available
    }
  }

  return () => {
    if (botEventSource) {
      botEventSource.close();
      botEventSource = null;
    }
  };
}
