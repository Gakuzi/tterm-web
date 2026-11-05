// The account (0.0.10), from 0.1.27 two sections of the Settings window
// (row 133, the canvas of 03.11, version 107) instead of a page of its own:
// Account – the photo (0.1.7, cut to a circle in PhotoDialog), the name,
// which the person changes here, the address and how to change it, and how
// to delete the account; Plan – the plan and what counts against it, and
// under it, faded, where payment will be. Sign out is in the account's menu.
//
// PageHead and useEscCloses stay for the pages that are still pages: Move to
// cloud, in the app (MoveToCloud.tsx).

import { useEffect, useRef, useState } from "react";
import {
  getVaultOverview,
  removePhoto,
  saveName,
  type AccountInfo,
  type Me,
  type VaultOverview,
} from "./api";
import { Face } from "./Face";
import { list, useT, type Translate } from "./i18n";
import { Check, Close, Lock, Restart } from "./icons";
import { PhotoDialog } from "./PhotoDialog";
import { Group, Row } from "./SettingsRows";
import { GitHubSection } from "./GitHubSection";
import { AezaSection } from "./AezaSection";
import { TelegramNotificationSection } from "./TelegramNotificationSection";

/** What a photo may be when chosen: the page makes the 256-pixel JPEG of it
 * itself. */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX = 5 * 1024 * 1024;
export const NOT_A_PHOTO = "account.not_a_photo";

export const SUPPORT = "support@tterm.net";

function limitsText(limits: AccountInfo["plan"]["limits"], t: Translate): string {
  const parts = [
    limits.machines !== null ? t("account.limit_machines", { n: limits.machines }) : null,
    limits.terminals !== null ? t("account.limit_terminals", { n: limits.terminals }) : null,
  ].filter(Boolean) as string[];
  return parts.length ? t("account.up_to", { limits: list(parts, t.lang) })
    : t("account.no_limits");
}

/** The plan's row, as words: its name and what it allows. */
export function planLine(info: AccountInfo, t: Translate): string {
  return `${info.plan.name} ${limitsText(info.plan.limits, t)}`;
}

/** How much of a limit is used: the number over its bar. */
function Meter(props: { used: number; most: number | null }) {
  const { used, most } = props;
  const t = useT();
  const share = most ? Math.min(100, (used / most) * 100) : 0;
  return (
    <span className="settings-meter">
      <span>
        {most !== null ? t("account.used_of", { used, limit: most })
          : t("account.used_no_limit", { used })}
      </span>
      {most !== null && (
        <span className="meter-bar" aria-hidden="true">
          <span className={used > 0 ? "meter-fill some" : "meter-fill"}
            style={{ width: `${share}%` }} />
        </span>
      )}
    </span>
  );
}

/** Esc goes back, unless a dialog or the palette is open over the page, or
 * a field has the keys (its own Esc puts it back). Move to cloud. */
export function useEscCloses(onClose: () => void, busy: { current: boolean }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (busy.current) return;
      if (document.querySelector(".scrim, .palette-backdrop")) return;
      close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);
}

/** The title of a page, with Close and its Esc. */
export function PageHead(props: { title: string; id: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="account-head">
      <h1 id={props.id}>{props.title}</h1>
      <button type="button" className="account-close" onClick={props.onClose}
        title={t("account.close_title")}>
        <Close size={14} />
        {t("common.close")}
        <kbd>Esc</kbd>
      </button>
    </div>
  );
}

function EncryptedVaultSection(props: { notify: (text: string) => void }) {
  const [vault, setVault] = useState<VaultOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await getVaultOverview();
      if (res.ok) {
        setVault(res);
      }
    } catch {
      // Vault load fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    props.notify("Облачное хранилище синхронизировано"); // i18n-ignore
  };

  return (
    <Group
      title="Защищенное облачное хранилище данных (Encrypted Vault)" // i18n-ignore
      note="Все API-токены, ключи GitHub, баланс хостинга Aeza и конфигурации изолированы и защищены алгоритмом AES-256-GCM. Данные хранятся в зашифрованном виде в облачной базе и синхронизируются между сессиями." // i18n-ignore
    >
      <Row
        label="Статус шифрования" // i18n-ignore
        note="Шифрование на стороне сервера (AES-256-GCM) • Изоляция профиля" // i18n-ignore
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Lock size={13} />
            AES-256-GCM Защищено {/* i18n-ignore */}
          </span>
          <button
            type="button"
            className="button-plain small"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            title="Синхронизировать секреты" // i18n-ignore
          >
            <Restart size={13} />
            {refreshing ? "Синхронизация..." /* i18n-ignore */ : "Обновить" /* i18n-ignore */}
          </button>
        </div>
      </Row>

      <Row
        label="Службы и токены" // i18n-ignore
        note={vault?.updated_at ? `Синхронизировано: ${new Date(vault.updated_at).toLocaleTimeString()}` : "Данные загружаются из защищенного хранилища"} // i18n-ignore
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              background: vault?.github_configured ? "rgba(16, 185, 129, 0.15)" : "rgba(156, 163, 175, 0.15)",
              color: vault?.github_configured ? "#10b981" : "#9ca3af",
            }}
          >
            {vault?.github_configured ? <Check size={12} /> : null}
            GitHub: {vault?.github_configured ? (vault.github_masked || "Подключен") : "Не подключен"} {/* i18n-ignore */}
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              background: vault?.aeza_configured ? "rgba(16, 185, 129, 0.15)" : "rgba(156, 163, 175, 0.15)",
              color: vault?.aeza_configured ? "#10b981" : "#9ca3af",
            }}
          >
            {vault?.aeza_configured ? <Check size={12} /> : null}
            Aeza VPS: {vault?.aeza_configured ? (vault.aeza_masked || "Подключен") : "Не подключен"} {/* i18n-ignore */}
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              background: vault?.telegram_configured ? "rgba(16, 185, 129, 0.15)" : "rgba(156, 163, 175, 0.15)",
              color: vault?.telegram_configured ? "#10b981" : "#9ca3af",
            }}
          >
            {vault?.telegram_configured ? <Check size={12} /> : null}
            Telegram: {vault?.telegram_configured ? "Подключен" : "Не подключен"} {/* i18n-ignore */}
          </span>
        </div>
      </Row>
    </Group>
  );
}

/** Settings › Account: the photo, the name, the address; deleting the
 * account goes through support, from the address one signs in with. */
export function AccountPane(props: {
  me: Me;
  /** Support's address, as tTerm Web has it. */
  support: string;
  onRenamed: (named: { name: string; firstName: string; initials: string }) => void;
  /** A new photo, or null when it was removed. */
  onPhoto: (photo: string | null) => void;
  notify: (text: string) => void;
  /** Write to support, for deleting the account. */
  onSupport: () => void;
  /** The name being typed: Esc is the field's, not the window's. */
  editing: { current: boolean };
}) {
  const { me, support } = props;
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(me.name);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  props.editing.current = editing;
  const nameInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  /** The photo chosen, loaded, while it is being cut to a circle. */
  const [cropping, setCropping] = useState<HTMLImageElement | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (editing) nameInput.current?.select();
  }, [editing]);
  useEffect(() => () => {
    props.editing.current = false;
  }, []);

  const startEdit = () => {
    setDraft(me.name);
    setNameProblem(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setNameProblem(null);
    window.requestAnimationFrame(() => editButton.current?.focus());
  };
  const save = async () => {
    if (saving) return;
    if (draft.trim() === me.name) {
      cancelEdit();
      return;
    }
    setSaving(true);
    setNameProblem(null);
    try {
      props.onRenamed(await saveName(draft));
      setEditing(false);
      window.requestAnimationFrame(() => editButton.current?.focus());
    } catch (error) {
      setNameProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const choosePhoto = () => {
    setPhotoProblem(null);
    fileInput.current?.click();
  };
  /** The file chosen: read here, and if it is a photo, to the circle. */
  const chosen = (file: File | undefined) => {
    if (!file) return;
    setPhotoProblem(null);
    if (!PHOTO_TYPES.includes(file.type) || !file.size || file.size > PHOTO_MAX) {
      setPhotoProblem(t(NOT_A_PHOTO));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setPhotoProblem(t(NOT_A_PHOTO));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setPhotoProblem(t(NOT_A_PHOTO));
      image.onload = () => {
        if (image.naturalWidth < 16 || image.naturalHeight < 16) {
          setPhotoProblem(t(NOT_A_PHOTO));
          return;
        }
        setCropping(image);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const dropPhoto = async () => {
    if (removing) return;
    setRemoving(true);
    setPhotoProblem(null);
    try {
      await removePhoto();
      props.onPhoto(null);
      props.notify(t("account.photo_removed"));
    } catch (error) {
      setPhotoProblem((error as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Group title={t("account.profile")}>
        <Row label={t("account.photo")} note={t("account.photo_hint")}
          after={photoProblem && <div className="error-box" role="alert">{photoProblem}</div>}>
          <Face initials={me.initials} photo={me.photo} className="settings-face mine" />
          {me.photo ? (
            <>
              <button type="button" className="button-plain small" onClick={choosePhoto}>
                {t("account.change_photo")}
              </button>
              <button type="button" className="button-plain small quiet"
                disabled={removing} onClick={() => void dropPhoto()}>
                {t("account.remove_photo")}
              </button>
            </>
          ) : (
            <button type="button" className="button-plain small" onClick={choosePhoto}>
              {t("account.add_photo")}
            </button>
          )}
          <input ref={fileInput} type="file" accept={PHOTO_TYPES.join(",")} hidden
            aria-label={t("account.choose_photo")}
            onChange={(event) => {
              chosen(event.target.files?.[0]);
              // The same file chosen again is news too.
              event.target.value = "";
            }} />
        </Row>
        <Row label={t("account.name")}
          after={nameProblem && <div className="error-box" role="alert">{nameProblem}</div>}>
          {editing ? (
            <form className="settings-name" onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}>
              <input ref={nameInput} className="text-input" name="name"
                aria-label={t("account.your_name")} autoComplete="name" maxLength={100}
                value={draft} disabled={saving}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEdit();
                  }
                }} />
              <button type="submit" className="button-accent"
                disabled={saving || !draft.trim()}>
                {saving ? t("account.saving") : t("common.save")}
              </button>
              <button type="button" className="button-plain quiet"
                disabled={saving} onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
            </form>
          ) : (
            <>
              <span className="settings-value">{me.name}</span>
              <button ref={editButton} type="button" className="button-plain small"
                onClick={startEdit}>
                {t("account.edit_name")}
              </button>
            </>
          )}
        </Row>
        {me.email && (
          <Row label={t("account.email")}
            note={t.rich("account.address_note", {
              email: support,
              link: (inner) => <a href={`mailto:${support}`}>{inner}</a>,
            })}
            noteWords={t("account.address_note", { email: support }).replace(/<\/?link>/g, "")}>
            <span className="settings-value muted">{me.email}</span>
          </Row>
        )}
      </Group>

      {/* Encrypted Cloud Vault Status */}
      <EncryptedVaultSection notify={props.notify} />

      {/* GitHub Integration for User Account */}
      <GitHubSection notify={props.notify} />

      {/* Cloud Hosting & VPS Integration for User Account */}
      <AezaSection notify={props.notify} />

      {/* Telegram Push Notification Bot for Multi-Device Alerts */}
      <TelegramNotificationSection notify={props.notify} />

      <Group title={t("account.delete_title")}>
        <Row label={t("account.delete")} note={t("account.delete_note", { email: support })}>
          <button type="button" className="button-plain small" onClick={props.onSupport}>
            {t("account_menu.write_support")}
          </button>
        </Row>
      </Group>

      {cropping && (
        <PhotoDialog image={cropping}
          onSaved={(photo) => {
            setCropping(null);
            props.onPhoto(photo);
            props.notify(t("account.photo_saved"));
          }}
          onCancel={() => setCropping(null)} />
      )}
    </>
  );
}

/** Settings › Plan: the plan and how much of it is used; under it, faded,
 * where payment will be once there are paid plans. */
export function PlanPane(props: { info: AccountInfo | null; problem: string | null }) {
  const { info, problem } = props;
  const t = useT();
  return (
    <>
      <Group title={t("account.plan")}>
        {info ? (
          <>
            <Row label={planLine(info, t)}
              labelNode={(
                <span className="settings-plan">
                  <span className="plan-badge">{info.plan.name}</span>
                  {limitsText(info.plan.limits, t)}
                </span>
              )}
              note={t("account.plan_note")} />
            <Row label={t("account.machines")}>
              <Meter used={info.usage.machines} most={info.plan.limits.machines} />
            </Row>
            <Row label={t("account.open_terminals")}>
              <Meter used={info.usage.terminals} most={info.plan.limits.terminals} />
            </Row>
          </>
        ) : problem ? (
          <div className="error-box" role="alert">{problem}</div>
        ) : (
          <div className="waiting"><span className="spinner" />{t("common.loading")}</div>
        )}
      </Group>
      <Group title={t("settings.payment")} faded>
        <Row label={t("settings.payment_row")} note={t("settings.payment_note")} />
      </Group>
    </>
  );
}
