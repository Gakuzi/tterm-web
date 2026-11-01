// The one thin line on top, as approved on 11.10: the sidebar's ⟩, the tabs,
// "+" for a terminal on any machine, and "Jump to" for the palette, from
// 0.1.7 Search, as the palette searches everything (Search.tsx). From
// 0.1.0 a tab is a terminal, a note or a project's page, from any project:
// each starts with what it is and the project's code, faint.
//
// A terminal tab's dot is its machine: green on line, a turning ring while a
// command runs, a hollow ring while the computer sleeps, grey once it ended.
// A note says on the right whether what was typed is saved. From 0.1.1 the
// project's code is in its color, and a double click on a terminal's tab
// names the terminal: Enter saves, Esc cancels. From 0.1.2 the same goes in
// the sidebar and on the project's page (NameInput). From 0.1.6, in the
// app signed in, a terminal of the computer it runs on has the same amber
// square as in the sidebar; without the connection, a terminal of the
// cloud says that it waits for it. From 0.1.15, in the app with a new
// version ready, Restart to update before Search (Updates.tsx). From 0.1.20
// a tab is a machine's log too: P/web-01 log, after a clock turning back.

import { useRef, type ReactNode } from "react";
import type { ProjectColor } from "./api";
import { colorClass } from "./colors";
import { useT } from "./i18n";
import {
  Check, Close, CloudOff, Computer, Doc, History, ListCheck, Plus, Search,
} from "./icons";
import { NameInput } from "./NameInput";
import { JUMP_KEYS, type TabKind } from "./tabs";

export type Dot = "open" | "busy" | "away" | "ended";

export interface TabView {
  id: string;
  kind: TabKind;
  /** The project's code, and its color. */
  code: string;
  color?: ProjectColor;
  /** What follows the code: web-01 · 2, a note's title, a project's name. */
  label: string;
  /** A terminal's state. */
  dot?: Dot;
  /** A note with a checklist in it. */
  checklist?: boolean;
  /** A note with no title yet. */
  untitled?: boolean;
  /** What the dot means, and where the tab's terminal or note is. */
  title: string;
  closeTitle: string;
  /** A terminal still running: its machine, its name, and whether a double
   * click names it. */
  machine?: string;
  name?: string;
  canRename?: boolean;
  /** In the app signed in (0.1.6): a terminal of the computer it runs on. */
  here?: boolean;
  /** In the app without the connection: a terminal of the cloud, waiting. */
  cutOff?: boolean;
}

/** How saving goes in the note in front. */
export interface SaveLine {
  text: string;
  kind: "saved" | "saving" | "warn";
}

interface Props {
  sidebarButton: ReactNode;
  tabs: TabView[];
  current: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** The "+" list, while it is open. */
  picking: boolean;
  onPlus: () => void;
  renderPicker: (around: React.RefObject<HTMLElement | null>) => ReactNode;
  onJump: () => void;
  saving: SaveLine | null;
  /** The terminal's tab being named, if one is. */
  renaming: string | null;
  onStartRename: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onStopRename: (id: string) => void;
  /** Before Search: Restart to update, in the app (0.1.15). */
  update?: ReactNode;
}

function Lead({ tab }: { tab: TabView }) {
  if (tab.kind === "terminal") {
    return (
      <>
        <span className={`dot ${tab.dot ?? "busy"}`} aria-hidden="true" />
        {tab.here && (
          <span className="here-mark small" aria-hidden="true"><Computer size={11} /></span>
        )}
        {tab.cutOff && <CloudOff size={14} className="tab-icon cut-off" />}
      </>
    );
  }
  if (tab.kind === "note") {
    return tab.checklist ? <ListCheck size={14} className="tab-icon" />
      : <Doc size={14} className="tab-icon" />;
  }
  if (tab.kind === "log") return <History size={14} className="tab-icon" />;
  return <span className="code-chip" aria-hidden="true">{tab.code}</span>;
}

export function TabBar(props: Props) {
  const t = useT();
  const plus = useRef<HTMLDivElement>(null);
  return (
    <header className="topbar tab-bar">
      {props.sidebarButton}
      <nav className="tabs" aria-label={t("tabs.label")}>
        {props.tabs.map((tab) => {
          const current = tab.id === props.current;
          const renaming = props.renaming === tab.id && !!tab.canRename;
          return (
            <div key={tab.id}
              className={`${current ? "tab current" : "tab"} ${colorClass(tab.color)}`}>
              {renaming ? (
                <div className="tab-main renaming">
                  <Lead tab={tab} />
                  <span className="tab-label">
                    {tab.code && <span className="tab-code">{tab.code}/</span>}
                    {tab.machine} ·{" "}
                  </span>
                  <NameInput id={tab.id} name={tab.name ?? ""} className="tab-rename"
                    describedBy={`${tab.id}-tip`} onRename={props.onRename}
                    onStop={() => props.onStopRename(tab.id)} />
                </div>
              ) : (
                <button type="button" className="tab-main"
                  aria-current={current ? "page" : undefined} title={tab.title}
                  onClick={() => props.onSelect(tab.id)}
                  onDoubleClick={() => {
                    if (tab.canRename) props.onStartRename(tab.id);
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      props.onClose(tab.id);
                    }
                  }}>
                  <Lead tab={tab} />
                  <span className={tab.untitled ? "tab-label untitled" : "tab-label"}>
                    {tab.kind !== "project" && tab.code && (
                      <span className="tab-code">{tab.code}/</span>
                    )}
                    {tab.label}
                  </span>
                </button>
              )}
              {renaming && (
                <div className="tab-tip" role="tooltip" id={`${tab.id}-tip`}>
                  <strong>{t("tabs.rename_title")}</strong>
                  <span>{t("tabs.rename_hint")}</span>
                </div>
              )}
              <button type="button" className="tab-close"
                aria-label={t("tabs.close",
                  { name: `${tab.code ? `${tab.code}/` : ""}${tab.label}` })}
                title={tab.closeTitle}
                onClick={() => props.onClose(tab.id)}>
                <Close size={13} />
              </button>
            </div>
          );
        })}
        <div className="plus-wrap" ref={plus}>
          <button type="button" className="icon-button small"
            data-action="new-terminal"
            aria-label={t("tabs.new_terminal")} aria-haspopup="dialog"
            aria-expanded={props.picking}
            title={t("tabs.new_terminal_title")} onClick={props.onPlus}>
            <Plus size={16} />
          </button>
          {props.picking && props.renderPicker(plus)}
        </div>
      </nav>
      <div className="bar-right">
        {props.saving && (
          <span className={`save-line ${props.saving.kind}`} role="status">
            {props.saving.kind === "saved" && <Check size={13} />}
            {props.saving.text}
          </span>
        )}
        {props.update}
        <button type="button" className="jump" onClick={props.onJump}
          title={t("tabs.search_title")}>
          <Search size={14} />
          <span className="jump-text">{t("tabs.search")}</span>
          <kbd>{JUMP_KEYS}</kbd>
        </button>
      </div>
    </header>
  );
}
