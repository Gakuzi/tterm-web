// A terminal on the page, under its tab: the feed of blocks with tTerm's own
// input line (the line mode, from 0.0.5) or the classic terminal of 0.0.4,
// where every key goes straight to the shell. The switch is under the input
// line; the choice is kept per browser.
//
// Every open tab has its view on the page at once, the others hidden behind
// the current one: switching is instant, and nothing is measured again, so
// no program in them is told of a new size.
//
// The terminal lives in the core. Closing the tab, reloading the page or
// losing the connection leaves it running; coming back attaches again. A
// computer that sleeps leaves it waiting, away, until it is back.

import { useEffect, useRef, useState } from "react";
import { endTerminal, terminalInfo, type TerminalInfo,
  type TerminalState } from "./api";
import { shortPath } from "./BlockView";
import { ClassicTerminal, type ViewEvents } from "./ClassicTerminal";
import { FeedTerminal } from "./FeedTerminal";
import { useFoundBlock, wentThere } from "./found";
import { useT } from "./i18n";
import { ModeToggle } from "./InputLine";
import type { Shown } from "./theme";
import { since } from "./time";

type Mode = "line" | "classic";
const MODE_KEY = "tterm.mode";

function rememberedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "classic" ? "classic" : "line";
  } catch {
    return "line";
  }
}

function rememberMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // A convenience; the line mode is the default anyway.
  }
}

/** What the tab shows of its terminal. */
export interface TabStatus {
  label: string;
  machine: string;
  /** The directory it is in, shortened. */
  where: string;
  state: TerminalState;
  away: boolean;
  running: boolean;
}

interface Props {
  terminalId: string;
  /** The tab in front; the others are on the page, hidden. */
  active: boolean;
  shownTheme: Shown;
  onStatus: (id: string, status: TabStatus) => void;
  onCloseTab: (id: string) => void;
  /** A new terminal on the machine, in this ended one's tab. */
  onOpenNew: (machineId: string, instead: string) => void;
  onChanged: () => void;
  notify: (text: string) => void;
  /** Whether the machine is still in tTerm Web: one removed gets no new
   * terminal. */
  machineThere: (machineId: string) => boolean;
  /** A command search put here (0.1.7), for the line: not run. */
  paste: { text: string; n: number } | null;
}

export function TerminalView(props: Props) {
  const { terminalId, active, shownTheme, onStatus } = props;
  const t = useT();
  const [info, setInfo] = useState<TerminalInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [ending, setEnding] = useState(false);
  const [mode, setMode] = useState<Mode>(rememberedMode);
  const [, setTick] = useState(0);
  const changed = useRef(props.onChanged);
  changed.current = props.onChanged;

  // A block search opened here (0.1.7) is shown in Line, where blocks are.
  // The mode chosen for other terminals stays as it was.
  const found = useFoundBlock(terminalId);
  useEffect(() => {
    if (found && !wentThere(found.n)) setMode("line");
  }, [found?.n]);

  // What the terminal is, even before the socket says it.
  useEffect(() => {
    let live = true;
    terminalInfo(terminalId)
      .then((found) => {
        if (!live) return;
        if (found) setInfo((now) => now ?? found);
        else setMissing(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [terminalId]);

  const state: TerminalState = missing ? "gone" : info?.state ?? "connecting";
  const isEnded = state === "ended" || state === "gone";
  const away = !isEnded && !!info?.away;
  const where = info?.cwd ? shortPath(info.cwd, info.home) : "";

  // The tab follows it.
  useEffect(() => {
    onStatus(terminalId, {
      label: info?.label ?? t("terminal_view.terminal"),
      machine: info?.machine ?? "",
      where,
      state,
      away,
      running: running && !isEnded,
    });
  }, [terminalId, onStatus, info?.label, info?.machine, where, state, away,
    running, isEnded, t]);

  // A computer going away or coming back is news for the lists too.
  const wasAway = useRef(away);
  useEffect(() => {
    if (wasAway.current !== away) changed.current();
    wasAway.current = away;
  }, [away]);

  // "Away for 3 minutes" goes on counting.
  useEffect(() => {
    if (!away) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, [away]);

  const events: ViewEvents = {
    attached: (terminal) => {
      setInfo(terminal);
      setMissing(false);
      setRunning(!!terminal.running);
    },
    marker: (event) => {
      setRunning(event.t === "C");
      if (event.t === "P") {
        setInfo((now) => now && { ...now, cwd: event.cwd, home: event.home,
          branch: event.branch });
      }
    },
    state: (terminal) => {
      setInfo(terminal);
      if (terminal.state === "ended") {
        setRunning(false);
        changed.current();
      }
    },
    gone: (terminal) => {
      setRunning(false);
      if (terminal) setInfo(terminal);
      else setMissing(true);
      changed.current();
    },
  };

  // A shell that does not mark where commands start has no blocks.
  const noBlocks = info?.state === "open" && info.blocks === false
    ? t("terminal_view.no_blocks") : undefined;
  const shownMode: Mode = noBlocks ? "classic" : mode;
  const choose = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    rememberMode(next);
  };
  const end = () => {
    setEnding(true);
    endTerminal(terminalId)
      .catch(() => props.notify(t("terminal_view.end_failed")))
      .finally(() => setEnding(false));
  };
  const machine = info?.machine;

  return (
    <div className={active ? "terminal-view" : "terminal-view behind"}
      inert={!active}>
      <div className={`terminal-area ${shownMode === "line" ? "feed-mode"
        : "classic-mode"}${isEnded ? " ended" : ""}`}>
        {shownMode === "classic" ? (
          <>
            <div className="classic-wrap">
              <ClassicTerminal key={`c-${terminalId}`} terminalId={terminalId}
                shownTheme={shownTheme} ended={isEnded} active={active}
                events={events} paste={props.paste} notify={props.notify} />
            </div>
            {!isEnded && (
              <footer className="classic-footer">
                <div className="input-hints">
                  <span>{t("terminal_view.classic_hint")}</span>
                  <span className="amber">{t("terminal_view.classic_warning")}</span>
                </div>
                <ModeToggle mode="classic" disabled={noBlocks}
                  onLine={() => choose("line")} onClassic={() => {}} />
              </footer>
            )}
          </>
        ) : (
          <FeedTerminal key={`f-${terminalId}`} terminalId={terminalId}
            shownTheme={shownTheme} ended={isEnded} active={active}
            events={events} machine={machine} home={info?.home ?? ""}
            onClassic={() => choose("classic")} notify={props.notify}
            paste={props.paste} />
        )}
        {state === "connecting" && !missing && (
          <div className="terminal-note" role="status">
            <span className="spinner" aria-hidden="true" />
            {machine === undefined ? t("terminal_view.connecting_unknown")
              : t("terminal_view.connecting", { machine })}
          </div>
        )}
        {away && info && (
          <div className="away-note" role="status">
            <span className="dot away" aria-hidden="true" />
            <div className="away-text">
              <strong>{t("terminal_view.away", { machine: info.machine })}</strong>
              <span>
                {info.awaySince
                  ? t("terminal_view.away_since", { since: since(info.awaySince, t) })
                  : t("terminal_view.away_text")}
              </span>
            </div>
            <button type="button" className="button-plain" disabled={ending}
              onClick={end}>
              {t("terminal_view.end")}
            </button>
          </div>
        )}
        {isEnded && (
          <div className="terminal-ended" role="status">
            <div className="ended-text">
              <strong>{missing && !info ? t("terminal_view.no_such")
                : t("terminal_view.ended")}</strong>
              <span>{info?.reason ?? t("terminal_view.not_running")}</span>
            </div>
            <div className="button-row">
              {info && props.machineThere(info.machineId) && (
                <button type="button" className="button-accent big"
                  onClick={() => props.onOpenNew(info.machineId, terminalId)}>
                  {t("terminal_view.open_new", { machine: info.machine })}
                </button>
              )}
              <button type="button" className="button-plain"
                onClick={() => props.onCloseTab(terminalId)}>
                {t("terminal_view.close_tab")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
