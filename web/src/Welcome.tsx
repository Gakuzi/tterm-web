// The first screen: nothing is connected yet, and it should be clear what to
// do. From the approved mockup "Первый вход", without the passkey offer and
// the invitations line: sign-in and teams come in later stages.

import type { MachineKind, Me, Project } from "./api";
import { useT } from "./i18n";
import { ArrowRight, Computer, Logo, Server } from "./icons";

interface Props {
  me: Me;
  personal: Project | undefined;
  onAdd: (kind: MachineKind) => void;
}

export function Welcome({ me, personal, onAdd }: Props) {
  const t = useT();
  return (
    <main className="welcome">
      <div className="welcome-head">
        <Logo size={40} />
        <h1>{t("welcome.title", { name: me.firstName })}</h1>
        <p className="lead">
          {t("welcome.lead")}
        </p>
      </div>

      <section className="connect" aria-labelledby="w-connect">
        <h2 id="w-connect">{t("welcome.connect")}</h2>
        <div className="connect-cards">
          <button type="button" className="connect-card"
            onClick={() => onAdd("server")}>
            <span className="card-top">
              <span className="tile" aria-hidden="true"><Server size={20} /></span>
              <span className="arrow"><ArrowRight /></span>
            </span>
            <span className="card-text">
              <span className="card-title">{t("welcome.server")}</span>
              <span className="card-note">
                {t("welcome.server_note")}
              </span>
            </span>
            <span className="chips">
              <span className="chip">Linux</span>
              <span className="chip">{t("welcome.one_command")}</span>
            </span>
          </button>
          <button type="button" className="connect-card"
            onClick={() => onAdd("computer")}>
            <span className="card-top">
              <span className="tile" aria-hidden="true">
                <Computer size={20} />
              </span>
              <span className="arrow"><ArrowRight /></span>
            </span>
            <span className="card-text">
              <span className="card-title">{t("welcome.computer")}</span>
              <span className="card-note">
                {t("welcome.computer_note")}
              </span>
            </span>
            <span className="chips">
              <span className="chip">macOS</span>
              <span className="chip">Linux</span>
              <span className="chip">{t("welcome.no_ports")}</span>
            </span>
          </button>
        </div>
      </section>

      <ol className="steps" aria-label={t("welcome.how")}>
        <li>
          <span className="step-number" aria-hidden="true">1</span>
          <span className="step-text">
            <strong>{t("welcome.step_add")}</strong>
            <span>{t("welcome.step_add_text")}</span>
          </span>
        </li>
        <li>
          <span className="step-number" aria-hidden="true">2</span>
          <span className="step-text">
            <strong>{t("welcome.step_open")}</strong>
            <span>{t("welcome.step_open_text")}</span>
          </span>
        </li>
        <li>
          <span className="step-number" aria-hidden="true">3</span>
          <span className="step-text">
            <strong>{t("welcome.step_team")}</strong>
            <span>{t("welcome.step_team_text")}</span>
          </span>
        </li>
      </ol>

      {personal && (
        <p className="footnote">
          {t("welcome.footnote", { project: personal.name, code: personal.code })}
        </p>
      )}
    </main>
  );
}
