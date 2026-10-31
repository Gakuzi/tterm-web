// The account page (0.0.10), from 0.1.4 one of two pages behind the menu of
// the account at the bottom of the sidebar, as approved on the canvas of
// 21.10: the name, which the person changes here, the address and how to
// change it; the plan and what counts against it; how to delete the
// account. The theme, project colors, devices and support's address are on
// Settings (Settings.tsx), and Sign out is in the menu itself. Tabs stay
// above it; Close or Esc goes back.
//
// From 0.1.7 one's own photo too, as approved on the canvas of 23.10: the
// photo, or the initials, with a camera on it; Change photo and Remove
// photo, or Add a photo; the photo is cut to a circle in PhotoDialog.

import { useEffect, useRef, useState } from "react";
import {
  loadAccount, removePhoto, saveName, type AccountInfo, type Me,
} from "./api";
import { Face } from "./Face";
import { list, useT, type Translate } from "./i18n";
import { Camera, Close } from "./icons";
import { PhotoDialog } from "./PhotoDialog";

interface Props {
  me: Me;
  onRenamed: (named: { name: string; firstName: string; initials: string }) => void;
  /** A new photo, or null when it was removed. */
  onPhoto: (photo: string | null) => void;
  notify: (text: string) => void;
  onClose: () => void;
}

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

function Meter(props: { label: string; used: number; most: number | null }) {
  const { label, used, most } = props;
  const t = useT();
  const share = most ? Math.min(100, (used / most) * 100) : 0;
  return (
    <div className="meter">
      <span className="meter-text">
        <strong>{label}</strong>
        <span>
          {most !== null ? t("account.used_of", { used, limit: most })
            : t("account.used_no_limit", { used })}
        </span>
      </span>
      {most !== null && (
        <span className="meter-bar" aria-hidden="true">
          <span className={used > 0 ? "meter-fill some" : "meter-fill"}
            style={{ width: `${share}%` }} />
        </span>
      )}
    </div>
  );
}

/** Esc goes back, unless a dialog or the palette is open over the page, or
 * a field has the keys (its own Esc puts it back). Account and Settings
 * alike. */
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

/** The title of Account and Settings, with Close and its Esc. */
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

export function Account(props: Props) {
  const { me } = props;
  const t = useT();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(me.name);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editingNow = useRef(false);
  editingNow.current = editing;
  const nameInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  /** The photo chosen, loaded, while it is being cut to a circle. */
  const [cropping, setCropping] = useState<HTMLImageElement | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    loadAccount().then(setInfo)
      .catch((error: Error) => setProblem(error.message));
  }, []);

  useEscCloses(props.onClose, editingNow);

  useEffect(() => {
    if (editing) nameInput.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(me.name);
    setNameProblem(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setNameProblem(null);
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

  const support = info?.legal.support ?? SUPPORT;

  return (
    <main className="account-view" aria-labelledby="ac-title">
      <PageHead title={t("account.title")} id="ac-title" onClose={props.onClose} />

      <section className="account-card profile-card" aria-label={t("account.profile")}>
        <div className="profile-row">
          <button type="button" className="profile-photo" onClick={choosePhoto}
            title={me.photo ? t("account.change_photo") : t("account.add_photo")}
            aria-label={me.photo ? t("account.change_photo") : t("account.add_photo")}>
            <Face initials={me.initials} photo={me.photo} className="huge mine" />
            <span className="photo-badge" aria-hidden="true"><Camera size={13} /></span>
          </button>
          {editing ? (
            <form className="profile-edit" onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}>
              <label className="profile-label">
                <span>{t("account.your_name")}</span>
                <input ref={nameInput} className="text-input" name="name"
                  autoComplete="name" maxLength={100} value={draft}
                  disabled={saving}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEdit();
                    }
                  }} />
              </label>
              <span className="button-row profile-buttons">
                <button type="submit" className="button-accent"
                  disabled={saving || !draft.trim()}>
                  {saving ? t("account.saving") : t("common.save")}
                </button>
                <button type="button" className="button-plain quiet"
                  disabled={saving} onClick={cancelEdit}>
                  {t("common.cancel")}
                </button>
              </span>
            </form>
          ) : (
            <>
              <span className="profile-text">
                <strong>{me.name}</strong>
                {me.email && <span>{me.email}</span>}
              </span>
              <button type="button" className="button-plain small"
                onClick={startEdit}>
                {t("account.edit_name")}
              </button>
            </>
          )}
        </div>
        {nameProblem && <div className="error-box" role="alert">{nameProblem}</div>}
        <div className="profile-photo-row">
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
          <span className="hint">{t("account.photo_hint")}</span>
        </div>
        {photoProblem && <div className="error-box" role="alert">{photoProblem}</div>}
        <input ref={fileInput} type="file" accept={PHOTO_TYPES.join(",")} hidden
          aria-label={t("account.choose_photo")}
          onChange={(event) => {
            chosen(event.target.files?.[0]);
            // The same file chosen again is news too.
            event.target.value = "";
          }} />
        <p className="profile-note">
          {t.rich("account.address_note", {
            email: support,
            link: (inner) => <a href={`mailto:${support}`}>{inner}</a>,
          })}
        </p>
      </section>

      <section className="account-section" aria-labelledby="ac-plan">
        <div className="account-section-head">
          <h2 id="ac-plan">{t("account.plan")}</h2>
          <p>
            {t("account.plan_note")}
          </p>
        </div>
        <div className="account-card plan-card">
          {info ? (
            <>
              <div className="plan-line">
                <span className="plan-badge">{info.plan.name}</span>
                <span>{limitsText(info.plan.limits, t)}</span>
              </div>
              <div className="meters">
                <Meter label={t("account.machines")} used={info.usage.machines}
                  most={info.plan.limits.machines} />
                <Meter label={t("account.open_terminals")} used={info.usage.terminals}
                  most={info.plan.limits.terminals} />
              </div>
            </>
          ) : problem ? (
            <div className="error-box" role="alert">{problem}</div>
          ) : (
            <div className="waiting"><span className="spinner" />{t("common.loading")}</div>
          )}
        </div>
      </section>

      {cropping && (
        <PhotoDialog image={cropping}
          onSaved={(photo) => {
            setCropping(null);
            props.onPhoto(photo);
            props.notify(t("account.photo_saved"));
          }}
          onCancel={() => setCropping(null)} />
      )}

      <footer className="account-foot">
        <span className="hint">
          {t("account.delete_note", { email: support })}
        </span>
      </footer>
    </main>
  );
}
