// Asking before what cannot be undone: removing a machine, ending a
// terminal that runs. Cancel has the keys, so that Enter by habit does
// nothing; the red button does it. A machine closed on this device
// (0.1.28) is removed only once the window has opened the keys: until then
// there is no red button.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBriefly } from "./briefly";
import { useT } from "./i18n";
import { Check, Close, Copy } from "./icons";
import { useVaultWindowUp, vaultWindowUp } from "./VaultDialogs";

interface Props {
  title: string;
  /** A line under the title: where the thing is. */
  sub?: string;
  children: ReactNode;
  /** The red button's words: "Remove MacBook-Pro". */
  confirm: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  /** What has the keys first, if not Cancel: a field to fill in (0.1.20,
   * why something is redacted). */
  start?: string;
  /** The red button waits for that field. */
  ready?: boolean;
  /** No red button yet: what it does waits for something the window
   * itself asks for first, the keys of a machine closed on this device
   * (04.11). Once it is there, Cancel has the keys again. */
  blocked?: boolean;
}

export function Confirm(props: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLElement>(null);
  const cancel = useRef(props.onCancel);
  cancel.current = props.onCancel;

  const start = props.start ?? ".confirm-cancel";
  useEffect(() => {
    box.current?.querySelector<HTMLElement>(start)?.focus();
    const onKey = (event: KeyboardEvent) => {
      // A vault window over this one (the Mac asked, say) takes Esc itself.
      if (event.key === "Escape" && !vaultWindowUp()) {
        event.preventDefault();
        cancel.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);

  // The keys opened in the window, or a vault window over it closed (the
  // Keep question after the password): the red button is there, and Cancel
  // has the keys again, as when it opened, unless something in the window
  // has them.
  const covered = useVaultWindowUp();
  useEffect(() => {
    const here = box.current;
    if (covered || props.blocked || !here || here.contains(document.activeElement)) return;
    here.querySelector<HTMLElement>(".confirm-cancel")?.focus();
  }, [covered, props.blocked]);

  const go = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await props.onConfirm();
    } catch (e) {
      setProblem((e as Error).message || t("confirm.no_answer"));
      setBusy(false);
    }
  };

  return (
    <div className="scrim">
      <section ref={box} className="dialog confirm-dialog" role="alertdialog"
        aria-modal="true" aria-labelledby="cf-title" tabIndex={-1}>
        <div className="dialog-head">
          <div className="dialog-title">
            <h2 id="cf-title">{props.title}</h2>
            {props.sub && <p className="dialog-note">{props.sub}</p>}
          </div>
          <button type="button" className="icon-button small" aria-label={t("common.close")}
            onClick={props.onCancel}>
            <Close size={16} />
          </button>
        </div>
        <div className="confirm-body">{props.children}</div>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="button-row">
          {!props.blocked && (
            <button type="button" className="button-danger big"
              disabled={busy || props.ready === false}
              onClick={() => void go()}>
              {props.confirm}
            </button>
          )}
          <button type="button" className="button-plain confirm-cancel"
            onClick={props.onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}

/** After a server is removed: the command that takes tTerm Web's access back
 * on the server itself, to copy. */
export function Removed(props: {
  name: string;
  cleanup: string;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const t = useT();
  const box = useRef<HTMLElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  // Copied, with a check, for a moment after Copy (0.1.13); then Copy again.
  const [copied, showCopied] = useBriefly<true>();

  useEffect(() => {
    box.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.cleanup);
      showCopied(true);
    } catch {
      props.notify(t("confirm.copy_failed"));
    }
  };

  return (
    <div className="scrim">
      <section ref={box} className="dialog confirm-dialog" role="dialog"
        aria-modal="true" aria-labelledby="rm-title" tabIndex={-1}>
        <div className="dialog-head">
          <div className="dialog-title">
            <h2 id="rm-title">{t("confirm.removed", { name: props.name })}</h2>
          </div>
          <button type="button" className="icon-button small" aria-label={t("common.close")}
            onClick={props.onClose}>
            <Close size={16} />
          </button>
        </div>
        <div className="confirm-body">
          <p>
            {t("confirm.removed_text")}
          </p>
          <div className="command-box">
            <code>{props.cleanup}</code>
            <button type="button" className="button-accent" onClick={copy}>
              {copied ? <Check size={14} className="pressed-mark" /> : <Copy size={14} />}
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
          <p className="hint">
            {t("confirm.user_stays", { user: "tterm",
              command: "sudo userdel -r tterm && sudo rm -f /etc/sudoers.d/tterm" })}
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button-plain" onClick={props.onClose}>
            {t("common.done")}
          </button>
        </div>
      </section>
    </div>
  );
}
