// New project and Add machine in the app before signing in (0.1.5, as on
// the canvas of 22.10, version 65): they are there as after signing in, so
// that the person sees what tTerm has, and open this instead. What comes
// with an account, drawn dashed as not here yet; what the Free plan gives;
// Sign in, the same as in the account's menu.

import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "./i18n";
import { Close, Computer, People, Person, Server } from "./icons";

/** What was asked for: a machine, or a project. */
export type Need = "machine" | "project";

/** The Free plan, which a new account gets, as the core has it: a change
 * there wants these words changed too. */
const FREE = { machines: 50, terminals: 24 };

interface Card {
  icon: ReactNode;
  title: string;
  text: string;
  /** A word on what is not there yet. */
  pill?: string;
}

const WHAT: Record<Need, { title: string; note: string; cards: Card[]; plan: string; stays: string }> = {
  machine: {
    title: "need_account.machine_title",
    note: "need_account.machine_note",
    cards: [
      { icon: <Server size={16} />, title: "need_account.server",
        text: "need_account.server_text" },
      { icon: <Computer size={16} />, title: "need_account.computer",
        text: "need_account.computer_text" },
    ],
    plan: "need_account.machine_plan",
    stays: "need_account.machine_stays",
  },
  project: {
    title: "need_account.project_title",
    note: "need_account.project_note",
    cards: [
      { icon: <Person size={16} />, title: "need_account.personal",
        text: "need_account.personal_text" },
      { icon: <People size={16} />, title: "need_account.shared", pill: "need_account.soon",
        text: "need_account.shared_text" },
    ],
    plan: "need_account.project_plan",
    stays: "need_account.project_stays",
  },
};

export function NeedAccount(props: {
  need: Need;
  onSignIn: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const box = useRef<HTMLElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  const what = WHAT[props.need];

  useEffect(() => {
    // The window itself has the keys: Enter by habit signs nobody in.
    box.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="scrim">
      <section ref={box} className="dialog need-dialog" role="dialog"
        aria-modal="true" aria-labelledby="na-title" aria-describedby="na-note"
        tabIndex={-1}>
        <div className="dialog-head">
          <div className="dialog-title">
            <h2 id="na-title">{t(what.title)}</h2>
            <p className="dialog-note" id="na-note">{t(what.note)}</p>
          </div>
          <button type="button" className="icon-button small"
            aria-label={t("common.close")} onClick={props.onClose}>
            <Close size={16} />
          </button>
        </div>
        <ul className="need-cards">
          {what.cards.map((card) => (
            <li key={card.title} className="need-card">
              <span className="need-card-head">
                <span className="need-icon" aria-hidden="true">{card.icon}</span>
                <strong>{t(card.title)}</strong>
                {card.pill && <span className="need-pill">{t(card.pill)}</span>}
              </span>
              <span>{t(card.text)}</span>
            </li>
          ))}
        </ul>
        <div className="need-plan">
          <span className="plan-badge">Free</span>
          <span className="need-plan-text">
            <strong>{t(what.plan, {
              machines: t("need_account.plan_machines", { n: FREE.machines }),
              terminals: t("need_account.plan_terminals", { n: FREE.terminals }),
            })}</strong>
            <span>{t(what.stays)}</span>
          </span>
        </div>
        <div className="button-row need-buttons">
          <button type="button" className="button-plain" onClick={props.onClose}>
            {t("need_account.not_now")}
          </button>
          <button type="button" className="button-accent" onClick={props.onSignIn}>
            {t("common.sign_in")}
          </button>
        </div>
      </section>
    </div>
  );
}
