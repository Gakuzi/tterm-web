// Settings (0.1.4), the other page behind the menu of the account at the
// bottom of the sidebar, as approved on the canvas of 21.10: what was on
// the account page besides the name and the plan. The theme and how much of
// a project's color the sidebar shows; the trusted devices with Forget and
// Forget all devices; support's address at the bottom (from 0.1.5 only it:
// the Terms of Service and the Privacy Policy are on the site and at
// signing up). In the app before signing in (local.ts) there is no account
// and so no devices, and the choices are kept on this computer. In the app
// signed in (0.1.14), This computer comes between the two: whether tTerm
// Web and the phone open it (ThisComputer.tsx). In the app, signed in or
// not (0.1.15), Updates: how tTerm for Mac takes its new versions
// (Updates.tsx). Tabs stay above it; Close or Esc goes back. The language
// is not here (0.1.16): it is in the account's menu, after Settings. From
// 0.1.17 Keys, before Devices: the vault of SSH keys (Keys.tsx).

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadAccount, type AccountInfo, type Project, type ProjectTint, type Theme } from "./api";
import { PageHead, SUPPORT, useEscCloses } from "./Account";
import { DevicesSection } from "./Devices";
import { useT } from "./i18n";
import { Monitor, Moon, Sun } from "./icons";
import { KeysSection } from "./Keys";
import { InApp } from "./local";
import { ThisComputerSection } from "./ThisComputer";
import { UpdatesSection } from "./Updates";

interface Props {
  /** The app before signing in: no account, the choices kept here. */
  local: boolean;
  /** In the app signed in: the machine it runs on, and its project. */
  here: { name: string; project: string } | null;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  tint: ProjectTint;
  onTint: (tint: ProjectTint) => void;
  /** The session ended from here (a device forgotten), and why. */
  onSignedOut: (note: string) => void;
  onClose: () => void;
  notify: (text: string) => void;
  /** The projects, for the servers each key opens. */
  projects: Project[];
}

const THEMES: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "system", label: "settings.theme_system", icon: <Monitor size={14} /> },
  { value: "light", label: "settings.theme_light", icon: <Sun size={14} /> },
  { value: "dark", label: "settings.theme_dark", icon: <Moon size={14} /> },
];

const TINTS: { value: ProjectTint; label: string }[] = [
  { value: "badge", label: "settings.tint_badge" },
  { value: "block", label: "settings.tint_block" },
];

export function Settings(props: Props) {
  const { local } = props;
  const { inApp } = useContext(InApp);
  const t = useT();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const nothingTyped = useRef(false);

  useEffect(() => {
    // Devices are the account's: before signing in there are none to load.
    if (local) return;
    loadAccount().then(setInfo)
      .catch((error: Error) => setProblem(error.message));
  }, [local]);

  useEscCloses(props.onClose, nothingTyped);

  const support = info?.legal.support ?? SUPPORT;

  return (
    <main className="account-view" aria-labelledby="st-title">
      <PageHead title={t("settings.title")} id="st-title" onClose={props.onClose} />

      <section className="account-section" aria-labelledby="st-appearance">
        <div className="account-section-head">
          <h2 id="st-appearance">{t("settings.appearance")}</h2>
          <p>
            {local ? t("settings.appearance_local") : t("settings.appearance_account")}
          </p>
        </div>
        <div className="account-card theme-card">
          <span className="theme-label">{t("settings.theme")}</span>
          <div className="segmented" role="group" aria-label={t("settings.theme")}>
            {THEMES.map((m) => (
              <button key={m.value} type="button"
                aria-pressed={props.theme === m.value}
                onClick={() => props.onTheme(m.value)}>
                {m.icon}
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="account-card theme-card">
          <span className="theme-label">{t("settings.tints")}</span>
          <div className="segmented" role="group" aria-label={t("settings.tints")}>
            {TINTS.map((m) => (
              <button key={m.value} type="button"
                aria-pressed={props.tint === m.value}
                onClick={() => props.onTint(m.value)}>
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!local && props.here && <ThisComputerSection here={props.here} />}

      {!local && <KeysSection projects={props.projects} notify={props.notify} />}

      {inApp && <UpdatesSection />}

      {!local && (info ? (
        <DevicesSection devices={info.devices} onSignedOut={props.onSignedOut}
          notify={props.notify} />
      ) : (
        <section className="account-section" aria-labelledby="st-devices">
          <div className="account-section-head">
            <h2 id="st-devices">{t("devices.title")}</h2>
          </div>
          <div className="account-card devices-card">
            {problem ? <div className="error-box" role="alert">{problem}</div>
              : <div className="waiting"><span className="spinner" />{t("common.loading")}</div>}
          </div>
        </section>
      ))}

      <footer className="account-foot">
        <span className="account-links">
          <a href={`mailto:${support}`}>{support}</a>
        </span>
      </footer>
    </main>
  );
}
