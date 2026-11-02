// Get help > Write to support (0.1.25), as on the canvas of 02.11 (version
// 100): what happened, in the person's own words, and, while ticked, one
// line of technical details, shown as it will go; Send. The core mails it to
// support's address, answered to the person (core/support.py): signed in to
// the account's address, where a copy of the message goes too; in tTerm for
// Mac before signing in to the address the person types, without a copy.
// Then: Message sent, and where the answer comes.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SUPPORT } from "./Account";
import { CoreError, sendSupport, type Me } from "./api";
import { useT } from "./i18n";
import { Check, Close } from "./icons";
import { docsPage } from "./links";
import { browserOf, detailsLine, looksLikeEmail, TEXT_MAX, whereFrom } from "./support";

/** What was written and not sent, while the page is open: a window closed
 * by mistake gives it back. */
let draft = { text: "", email: "" };

/** The draft goes with the person: on signing out, or when the session
 * ends, as the drafts of notes do. */
export function forgetSupportDraft(): void {
  draft = { text: "", email: "" };
}

export function SupportDialog(props: {
  me: Me;
  /** In the app before signing in: the address is asked for (as for an
   * account without one). */
  local: boolean;
  /** In tTerm for Mac, signed in or not. */
  inApp: boolean;
  /** tTerm Web's version, and the app's, where there is one. */
  version: string;
  appVersion: string | null;
  /** How many machines the person has, in all their projects. */
  machines: number;
  onClose: () => void;
}) {
  const t = useT();
  const [text, setText] = useState(draft.text);
  const [email, setEmail] = useState(draft.email);
  const [attach, setAttach] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ email: string; copy: boolean } | null>(null);
  const emailBox = useRef<HTMLInputElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  const busy = useRef(false);
  busy.current = sending;

  useEffect(() => {
    draft = { text, email };
  }, [text, email]);

  // Where the address is asked for, the keys start there, unless the
  // draft has one already.
  const askEmail = props.local || !props.me.email;
  useEffect(() => {
    (sent ? done.current : askEmail && !email.trim() ? emailBox.current
      : textBox.current)?.focus();
  }, [sent]);
  // Not sent: the keys go back to the message, which stays as it was.
  useEffect(() => {
    if (error) textBox.current?.focus();
  }, [error]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !busy.current) {
        event.preventDefault();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The line as it will go, in the page's words: the plan as the account's
  // place in the sidebar names it.
  const plan = props.me.plan === "free" ? t("account_menu.free_plan") : props.me.plan;
  const account = [plan, t("count.machines", { n: props.machines })];
  const details = detailsLine(props.inApp || props.local
    ? [t("support.tech_mac", { version: props.appVersion ?? "" }),
      browserOf(navigator.userAgent).os,
      ...(props.local ? [t("support.tech_local")] : account)]
    : [t("support.tech_web", { version: props.version }),
      whereFrom(navigator.userAgent), ...account]);
  const ready = !!text.trim() && (!askEmail || looksLikeEmail(email));

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await sendSupport({
        text, details: attach ? details : null,
        email: askEmail ? email.trim() : undefined,
      });
      draft = { text: "", email: "" };
      setSent({ email: result.email, copy: result.copy });
    } catch (e) {
      const status = e instanceof CoreError ? e.status : 0;
      setError(status === 429 ? t("support.too_many", { address: SUPPORT })
        : status === 422 && e instanceof CoreError ? e.message
          : t("support.not_sent", { address: SUPPORT }));
    } finally {
      setSending(false);
    }
  };

  const head = (title: string, note?: ReactNode) => (
    <div className="dialog-head">
      <div className="dialog-title">
        <h2 id="support-title">{title}</h2>
        {note && <p className="dialog-note" id="support-note">{note}</p>}
      </div>
      <button type="button" className="icon-button small" disabled={sending}
        aria-label={t("common.close")} onClick={props.onClose}>
        <Close size={16} />
      </button>
    </div>
  );
  const bold = (inner: ReactNode) => <b>{inner}</b>;

  if (sent) {
    return (
      <div className="scrim">
        <section className="dialog help-dialog" role="dialog" aria-modal="true"
          aria-labelledby="support-title">
          {head(t("support.sent_title"))}
          <div className="help-sent" role="status">
            <span className="ok" aria-hidden="true"><Check size={20} /></span>
            <p id="support-sent">{t.rich(sent.copy ? "support.sent" : "support.answer_to",
              { email: sent.email, b: bold })}</p>
          </div>
          <div className="button-row end">
            <button ref={done} type="button" className="button-accent big"
              aria-describedby="support-sent" onClick={props.onClose}>
              {t("common.done")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="scrim">
      <section className="dialog help-dialog" role="dialog" aria-modal="true"
        aria-labelledby="support-title" aria-describedby="support-note">
        {head(t("support.title"), askEmail ? t("support.answer_local")
          : t.rich("support.answer_to", { email: props.me.email, b: bold }))}
        <form className="help-form" onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}>
          <div className="help-body">
          {askEmail && (
            <>
              <label className="field-label" htmlFor="support-email">{t("support.email")}</label>
              {/* Read-only, not disabled, while it goes: the keys stay here. */}
              <input ref={emailBox} id="support-email" className="text-input" type="email"
                autoComplete="email" value={email} readOnly={sending} maxLength={254}
                onChange={(event) => setEmail(event.target.value)} />
            </>
          )}
          <label className="field-label" htmlFor="support-text">{t("support.text")}</label>
          <textarea ref={textBox} id="support-text"
            className="text-input help-text" value={text} maxLength={TEXT_MAX}
            placeholder={t("support.placeholder")} readOnly={sending}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // ⌘ Enter or Ctrl+Enter sends, as in a mail app.
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }} />
          <label className="vault-check">
            <input type="checkbox" checked={attach} disabled={sending}
              aria-describedby="support-tech"
              onChange={(event) => setAttach(event.target.checked)} />
            {t("support.attach")}
          </label>
          <p id="support-tech" className={attach ? "help-tech" : "help-tech off"}>
            {t.rich("support.tech", { details, b: bold })}
          </p>
          <p className="help-docs">
            {t.rich("support.docs", {
              link: (inner) => (
                <a href={docsPage(t.lang, "")} target="_blank" rel="noreferrer">{inner}</a>
              ),
            })}
          </p>
          {error && <p className="help-error" role="alert">{error}</p>}
          </div>
          <div className="button-row end">
            <button type="button" className="button-plain" disabled={sending}
              onClick={props.onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="button-accent big" disabled={!ready || sending}>
              {sending ? t("support.sending") : t("support.send")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
