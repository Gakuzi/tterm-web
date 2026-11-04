// Web Push Notifications & Audio Chime System for tTerm

export interface AppNotification {
  id: string;
  type: "command_finished" | "drain_lock" | "appeal" | "comment";
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  entityId?: string;
}

// Generates a pleasant notification chime using native Web Audio API
export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Harmonic arpeggio (A5 -> E6)
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // AudioContext blocked or not supported
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  }
  return false;
}

export function showPushNotification(title: string, body: string, entityId?: string) {
  playNotificationChime();

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.svg",
        tag: entityId || "tterm-general",
      });
    } catch {
      // Fallback
    }
  }
}
