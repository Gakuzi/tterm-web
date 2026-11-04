// Settings (0.1.4), from 0.1.27 a window over the page, as the owner asked on
// 03.11 with a screenshot of Claude's own settings (row 133, the canvas of
// 03.11, version 107): on the left a search and the sections in groups, on
// the right the one chosen, in rows. The page under it stays as it was; ×,
// Esc or a click beside the window closes it. Its address is the section's,
// /settings/<section>, so that a section can be linked to; switching
// sections takes the same step in the history, so that Back closes it.
//
// Preferences: General (the theme, project colors, the language, which the
// account's menu has too), Account and Plan (from 0.1.27 here, not a page of
// their own; payment will come under the plan). Security: Keys (0.1.17) and
// Devices. In tTerm for Mac also its own: This computer (0.1.14, signed in)
// and Updates (0.1.15). Before signing in, in the app, there is no account:
// General and Updates, the choices kept on this computer.
//
// On a phone the window is the screen: the sections first, then the one
// chosen, with the way back to them.
//
// While it is open, nothing under it takes the keys: App.tsx makes the page
// inert, and opens the window only when no other window is open, since two
// would stack in the order they are drawn, not the one they opened in.

import {
  useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import {
  loadAccount, type AccountInfo, type Me, type Project, type ProjectTint, type Theme,
} from "./api";
import { AccountPane, planLine, PlanPane, SUPPORT } from "./Account";
import { DevicesSection } from "./Devices";
import { LANGUAGES, useT, type Lang } from "./i18n";
import {
  Card, ChevronDown, ChevronLeft, ChevronRight, Close, Computer, Devices, Download, Gear,
  Key, Monitor, Moon, Person, Search, Spark, Sun,
} from "./icons";
import { KeysSection } from "./Keys.tsx";
import { AiSection } from "./AiSection";
import { InApp } from "./local";
import { Group, Row, SearchWords } from "./SettingsRows";
import { searchWords, sectionsFound, type SettingsSection } from "./settingsSearch";
import { ThisComputerSection } from "./ThisComputer";
import { UpdatesSection, UpdateState } from "./Updates";

/** The window is the screen below this width, as on a phone. */
const NARROW = "(max-width: 640px)";

/** How long a close waits for the history before another may go. */
const CLOSING_MS = 1000;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(NARROW);
    if (!media) return;
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return narrow;
}

interface Props {
  /** The section chosen; "" for none, which is General, or on a phone the
   * list of sections. */
  section: SettingsSection | "";
  onSection: (section: SettingsSection | "") => void;
  onClose: () => void;
  /** The app before signing in: no account, the choices kept here. */
  local: boolean;
  /** In the app signed in: the machine it runs on, and its project. */
  here: { name: string; project: string } | null;
  me: Me;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  tint: ProjectTint;
  onTint: (tint: ProjectTint) => void;
  language: Lang;
  onLanguage: (lang: Lang) => void;
  onRenamed: (named: { name: string; firstName: string; initials: string }) => void;
  onPhoto: (photo: string | null) => void;
  /** The session ended from here (a device forgotten), and why. */
  onSignedOut: (note: string) => void;
  notify: (text: string) => void;
  /** The projects, for the servers each key opens. */
  projects: Project[];
  /** Write to support: deleting the account goes through it. */
  onSupport: () => void;
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

/** Settings › General: how tTerm looks, and its language. */
function GeneralPane(props: Props) {
  const t = useT();
  return (
    <>
      <Group title={t("settings.appearance")}
        note={props.local ? t("settings.appearance_saved_local") : t("settings.appearance_saved")}>
        <Row label={t("settings.theme")}
          note={props.local ? t("settings.theme_note_local") : t("settings.theme_note")}
          words={THEMES.map((m) => t(m.label)).join(" ")}>
          <div className="segmented" role="group" aria-label={t("settings.theme")}>
            {THEMES.map((m) => (
              <button key={m.value} type="button" aria-pressed={props.theme === m.value}
                onClick={() => props.onTheme(m.value)}>
                {m.icon}
                {t(m.label)}
              </button>
            ))}
          </div>
        </Row>
        <Row label={t("settings.tints")} note={t("settings.tints_note")}
          words={TINTS.map((m) => t(m.label)).join(" ")}>
          <div className="segmented" role="group" aria-label={t("settings.tints")}>
            {TINTS.map((m) => (
              <button key={m.value} type="button" aria-pressed={props.tint === m.value}
                onClick={() => props.onTint(m.value)}>
                {t(m.label)}
              </button>
            ))}
          </div>
        </Row>
      </Group>
      <Group title={t("language.item")}>
        <Row label={t("settings.language")} note={t("settings.language_note")}
          words={LANGUAGES.map((l) => l.name).join(" ")}>
          <span className="settings-select">
            <select aria-label={t("settings.language")} value={props.language}
              onChange={(event) => props.onLanguage(event.target.value as Lang)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </span>
        </Row>
      </Group>
    </>
  );
}

export function Settings(props: Props) {
  const { local } = props;
  const { inApp } = useContext(InApp);
  const updating = useContext(UpdateState).update !== null;
  const t = useT();
  const narrow = useNarrow();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const editing = useRef(false);
  const scrim = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;

  useEffect(() => {
    // The account's: before signing in there is none to load.
    if (local) return;
    loadAccount().then(setInfo)
      .catch((error: Error) => setProblem(error.message));
  }, [local]);

  const support = info?.legal.support ?? SUPPORT;

  // The sections there are here, in their groups, with the words the search
  // finds each by: its name, and its groups and rows as they show, so that a
  // section the search leaves has a row it lights, and the other way round.
  const groups = useMemo(() => {
    const item = (key: SettingsSection, icon: ReactNode, title: string, words: string[]) =>
      ({ key, icon, title, words: [title, ...words].join(" ") });
    const general = item("general", <Gear size={18} />, t("settings.general"), [
      t("settings.appearance"),
      local ? t("settings.appearance_saved_local") : t("settings.appearance_saved"),
      t("settings.theme"), local ? t("settings.theme_note_local") : t("settings.theme_note"),
      ...THEMES.map((m) => t(m.label)),
      t("settings.tints"), t("settings.tints_note"), ...TINTS.map((m) => t(m.label)),
      t("language.item"), t("settings.language"), t("settings.language_note"),
      ...LANGUAGES.map((l) => l.name)]);
    const preferences = local ? [general] : [
      general,
      item("account", <Person size={18} />, t("account.title"), [
        t("account.profile"), t("account.photo"), t("account.photo_hint"), t("account.name"),
        t("account.email"), t("account.address_note", { email: support }).replace(/<\/?link>/g, ""),
        t("account.delete_title"), t("account.delete"),
        t("account.delete_note", { email: support })]),
      item("plan", <Card size={18} />, t("account.plan"), [
        info ? planLine(info, t) : "", t("account.plan_note"), t("account.machines"),
        t("account.open_terminals"), t("settings.payment"), t("settings.payment_row"),
        t("settings.payment_note")]),
    ];
    const out = [{ title: t("settings.group_preferences"), items: preferences }];
    if (!local) {
      out.push({
        title: t("settings.group_security"), items: [
          item("keys", <Key size={18} />, t("keys.title"), [t("settings.keys_words")]),
          item("devices", <Devices size={18} />, t("devices.title"), [
            t("devices.forget_all"), t("settings.devices_words")]),
          item("ai", <Spark size={18} />, "AI & MCP", [ // i18n-ignore
            "ai", "mcp", "agents", "cursor", "claude", "терминал", "ии"]), // i18n-ignore
        ],
      });
    }
    // In the app its own: This computer, signed in, and Updates, once the
    // app has said how it updates (Updates.tsx).
    const app = inApp ? [
      ...(!local && props.here ? [item("computer", <Computer size={18} />,
        t("this_computer.title"), [t("settings.computer_words")])] : []),
      ...(updating ? [item("updates", <Download size={18} />, t("updates.title"),
        [t("settings.updates_words")])] : []),
    ] : [];
    if (app.length) out.push({ title: t("app_link.mac"), items: app });
    return out;
  }, [t, local, inApp, props.here, updating, support, info]);
  const all = groups.flatMap((g) => g.items);
  const searching = query.trim() !== "";
  const found = searching ? sectionsFound(all, query, t.lang) : all.map((s) => s.key);
  const there = (key: SettingsSection | "") => all.some((s) => s.key === key);
  // The section shown: with words typed, the one chosen if the search leaves
  // it, or else the first it leaves, and none when it leaves none; with none
  // typed, the one chosen, or General; on a phone, none until one is chosen.
  const chosen = there(props.section) ? props.section as SettingsSection : null;
  const shown: SettingsSection | null = searching
    ? (chosen && found.includes(chosen) ? chosen : found[0] ?? null)
    : chosen ?? (narrow ? null : "general");
  const inside = narrow && chosen !== null;
  const paneShown = shown !== null && (!narrow || inside);
  const words = useMemo(() => searchWords(query, t.lang), [query, t.lang]);
  /** The section last chosen: back on a phone's list, the keys go to it. */
  const lastChosen = useRef<SettingsSection | null>(null);
  if (chosen) lastChosen.current = chosen;

  // Before signing in there is no account: its sections give way to none
  // chosen, in the same step of the history, so that signing in later does
  // not open one of them there. Updates, which comes once the app has said
  // how it updates, waits for it.
  const onSection = useRef(props.onSection);
  onSection.current = props.onSection;
  useEffect(() => {
    if (local && props.section && props.section !== "general" && props.section !== "updates") {
      onSection.current("");
    }
  }, [local, props.section]);

  // One close is enough: going back in the history takes a moment, and a
  // second Esc or click meanwhile would go one step further back.
  const closing = useRef(false);
  const closeOnce = () => {
    if (closing.current) return;
    closing.current = true;
    window.setTimeout(() => {
      closing.current = false;
    }, CLOSING_MS);
    close.current();
  };
  const closeNow = useRef(closeOnce);
  closeNow.current = closeOnce;

  // Esc while it is on top: a dialog over it (Write to support, a photo being
  // cut, a key being added) has the key first, and so does the name being
  // typed. Words in the search go first, wherever the keys are; then Esc
  // closes the window. It hears the key before anything else does, so that
  // nothing under it takes the key too.
  const searched = useRef(false);
  searched.current = query !== "";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || editing.current) return;
      const scrims = document.querySelectorAll(".scrim");
      if (scrims[scrims.length - 1] !== scrim.current ||
          document.querySelector(".palette-backdrop")) return;
      event.preventDefault();
      event.stopPropagation();
      if (searched.current) setQuery("");
      else if (!event.repeat) closeNow.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // The keys come to the section shown in the list, and on a phone to the
  // way back once one is chosen. A section that comes later (Updates, once
  // the app has said how it updates) takes them too, unless they are
  // elsewhere by then: in the search, say.
  useEffect(() => {
    window.requestAnimationFrame(() => {
      const root = box.current;
      if (!root) return;
      const now = document.activeElement;
      if (now && now !== document.body && root.contains(now) &&
          !now.classList.contains("settings-item")) return;
      const at = inside ? root.querySelector<HTMLElement>(".settings-top .back")
        : root.querySelector<HTMLElement>(".settings-item[aria-selected='true']") ??
          (lastChosen.current
            ? root.querySelector<HTMLElement>(`#st-tab-${lastChosen.current}`) : null) ??
          root.querySelector<HTMLElement>(".settings-item");
      at?.focus();
    });
  }, [inside, shown]);

  const pane = (section: SettingsSection): ReactNode => {
    switch (section) {
      case "general":
        return <GeneralPane {...props} />;
      case "account":
        return (
          <AccountPane me={props.me} support={support} onRenamed={props.onRenamed}
            onPhoto={props.onPhoto} notify={props.notify} onSupport={props.onSupport}
            editing={editing} />
        );
      case "plan":
        return <PlanPane info={info} problem={problem} />;
      case "keys":
        return <KeysSection projects={props.projects} notify={props.notify} />;
      case "devices":
        return info ? (
          <DevicesSection devices={info.devices} onSignedOut={props.onSignedOut}
            onForgotten={(id) => setInfo((was) => (was
              ? { ...was, devices: was.devices.filter((d) => d.id !== id) } : was))}
            notify={props.notify} />
        ) : (
          <section className="account-section">
            <div className="account-section-head"><h2>{t("devices.title")}</h2></div>
            <div className="account-card devices-card">
              {problem ? <div className="error-box" role="alert">{problem}</div>
                : <div className="waiting"><span className="spinner" />{t("common.loading")}</div>}
            </div>
          </section>
        );
      case "computer":
        return props.here ? <ThisComputerSection here={props.here} /> : null;
      case "updates":
        return <UpdatesSection />;
      case "ai":
        return <AiSection notify={props.notify} />;
    }
  };

  const nav = (
    <nav className="settings-nav" aria-label={t("settings.sections")}>
      <label className={query ? "settings-search typed" : "settings-search"}>
        <Search size={16} />
        <input type="search" value={query} placeholder={t("settings.search")}
          aria-label={t("settings.search")}
          onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="settings-items" role="tablist" aria-orientation="vertical"
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const items = [...(box.current?.querySelectorAll<HTMLElement>(".settings-item") ?? [])];
          const at = items.indexOf(document.activeElement as HTMLElement);
          if (at < 0 || !items.length) return;
          event.preventDefault();
          items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
        }}>
        {groups.map((group) => {
          const items = group.items.filter((s) => found.includes(s.key));
          if (!items.length) return null;
          return (
            <div key={group.title} className="settings-group" role="presentation">
              <div className="settings-group-title" role="presentation">{group.title}</div>
              {items.map((s) => (
                <button key={s.key} type="button" role="tab" id={`st-tab-${s.key}`}
                  aria-selected={!narrow && s.key === shown}
                  aria-controls={paneShown ? "st-pane" : undefined}
                  className={!narrow && s.key === shown ? "settings-item current" : "settings-item"}
                  onClick={() => props.onSection(s.key)}>
                  {s.icon}
                  <span className="settings-item-name">{s.title}</span>
                  <ChevronRight size={15} className="settings-more" />
                </button>
              ))}
            </div>
          );
        })}
        {!found.length && <p className="settings-nothing">{t("settings.nothing")}</p>}
      </div>
    </nav>
  );

  const title = inside && shown ? all.find((s) => s.key === shown)?.title ?? t("settings.title")
    : t("settings.title");
  return (
    <div ref={scrim} className="scrim settings-scrim" onMouseDown={(event) => {
      if (event.target === event.currentTarget && event.button === 0) closeOnce();
    }}>
      <section ref={box} className="dialog settings-dialog" role="dialog" aria-modal="true"
        aria-labelledby="st-title">
        <div className={inside ? "settings-top inside" : "settings-top"}>
          {inside && (
            <button type="button" className="icon-button back" aria-label={t("common.back")}
              title={t("common.back")} onClick={() => props.onSection("")}>
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 id="st-title">{title}</h2>
          <button type="button" className="icon-button" aria-label={t("common.close")}
            title={t("common.close")} onClick={closeOnce}>
            <Close size={17} />
          </button>
        </div>
        <div className="settings-body">
          {(!narrow || !inside) && nav}
          {shown && paneShown && (
            <div className="settings-pane" id="st-pane" role="tabpanel"
              aria-labelledby={narrow ? "st-title" : `st-tab-${shown}`}>
              <SearchWords.Provider value={{ words, lang: t.lang }}>
                {pane(shown)}
              </SearchWords.Provider>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
