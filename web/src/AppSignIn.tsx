// In tTerm for the computer (0.1.6): signing in with the browser, as on the
// approved canvas (version 63). The welcome on the app's first start, with
// Sign in with your browser and Later; and the window that waits while the
// person signs in in the browser and allows this computer there, with the
// code the browser shows too. The app's engine does the signing in; this
// asks it how it goes, and when it is done the page starts over signed in.

import { useEffect, useRef, useState } from "react";
import { appLinkState, cancelAppLink, signInApp } from "./api";
import { useT } from "./i18n";
import { Logo } from "./icons";

const SUPPORT = "support@tterm.net";
/** How often the window asks the engine how signing in goes. */
const ASK_MS = 1000;

export function AppWelcome(props: { onSignIn: () => void; onLater: () => void }) {
  const t = useT();
  return (
    <main className="signin app-welcome" aria-label={t("app_signin.welcome_label")}>
      <header className="signin-brand">
        <Logo size={36} />
        <span aria-hidden="true">tTerm</span>
      </header>
      <div className="signin-middle">
        <section className="signin-card">
          <div className="signin-form">
            <h1>{t("app_signin.welcome_title")}</h1>
            <p className="signin-lead">
              {t("app_signin.welcome_lead")}
            </p>
            <button type="button" className="button-accent big wide app-welcome-in"
              onClick={props.onSignIn}>
              {t("app_signin.browser")}
            </button>
            <button type="button" className="button-plain big wide app-welcome-later"
              onClick={props.onLater}>
              {t("app_signin.later")}
            </button>
            <p className="app-welcome-note">
              {t("app_signin.welcome_note")}
            </p>
          </div>
        </section>
      </div>
      <footer className="signin-footer">
        <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
      </footer>
    </main>
  );
}

interface LinkProps {
  /** The code the browser shows too. */
  code: string;
  /** Over: signed in (the page starts over), or not, and why. */
  onDone: () => void;
  onOver: (why: string | null) => void;
}

export function AppLinkWindow(props: LinkProps) {
  const t = useT();
  const box = useRef<HTMLElement>(null);
  const over = useRef(props.onOver);
  over.current = props.onOver;
  const done = useRef(props.onDone);
  done.current = props.onDone;
  const [problem, setProblem] = useState<string | null>(null);

  const cancel = () => {
    cancelAppLink().catch(() => {});
    over.current(null);
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  useEffect(() => {
    box.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        cancelRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    let stopped = false;
    const ask = () => {
      appLinkState()
        .then((now) => {
          if (stopped) return;
          if (now.state === "done") {
            stopped = true;
            done.current();
          } else if (now.state === "waiting") {
            timer = window.setTimeout(ask, ASK_MS);
          } else {
            stopped = true;
            over.current(now.state === "cancelled"
              ? t("app_signin.cancelled")
              : now.error ?? null);
          }
        })
        .catch(() => {
          if (!stopped) timer = window.setTimeout(ask, ASK_MS);
        });
    };
    let timer = window.setTimeout(ask, ASK_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const again = () => {
    setProblem(null);
    signInApp(true).catch((error: Error) => setProblem(error.message));
  };

  return (
    <div className="scrim">
      <section ref={box} className="dialog app-link" role="dialog"
        aria-modal="true" aria-labelledby="al-title" aria-describedby="al-note"
        tabIndex={-1}>
        <h2 id="al-title">{t("app_signin.link_title")}</h2>
        <p id="al-note">
          {t("app_signin.link_note", { host: "app.tterm.net" })}
        </p>
        <span className="app-link-code">{props.code}</span>
        <span className="app-link-small">
          {t("app_signin.until_then")}
        </span>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="app-link-buttons">
          <button type="button" className="button-plain" onClick={again}>
            {t("app_signin.open_again")}
          </button>
          <button type="button" className="button-plain app-link-cancel"
            onClick={cancel}>
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}
