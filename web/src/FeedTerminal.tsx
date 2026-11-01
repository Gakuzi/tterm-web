// The feed: every command a block, as in Warp. Under the hood it is the same
// real terminal as the classic mode: the core cuts the shell's stream into
// blocks with the markers, and the stream stays the truth.
//
// The command running now is drawn by xterm.js, so colours, progress bars
// and password prompts work as in any terminal, and keys go straight to it.
// When it ends, its screen is read back into text (render.ts) and the
// terminal is cleared for the next one. A full-screen program (vim, htop,
// less) gets the whole area, and the feed is back when it quits.
//
// Finished blocks come from the database first; the stream goes on from the
// last of them. So a reload shows the feed at once, and the command still
// running is drawn again from what the core kept of it.

import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import {
  blockOutput, loadFeed, loadHistory, type StoredBlock, type TerminalInfo,
} from "./api";
import { BlockView, shortPath, type FeedBlock } from "./BlockView";
import { DANGER_KEYS } from "./danger";
import { PRESSED_MS, toClipboard } from "./briefly";
import { FONT, FONT_SIZE, HIGH, LOW, type ViewEvents } from "./ClassicTerminal";
import { goneThere, takePaste, useFoundBlock, wentThere } from "./found";
import { useT } from "./i18n";
import { Warning } from "./icons";
import { InputLine, type Phase, type Prompt } from "./InputLine";
import { keepKeys, typingElsewhere, type Home } from "./keys";
import { markOnLine } from "./marks";
import {
  KEEP_LINES, fromBase64, plainText, readBuffer, renderOutput,
} from "./render";
import { socket, type Channel, type Confirm } from "./socket";
import type { Shown } from "./theme";
import { liveTheme, terminalTheme } from "./xtermTheme";

const LINE_HEIGHT = 1.3;
const EMPTY = new Uint8Array(0);
/** Of the running command's output, this much is kept here as it came, for
 * the one case the screen cannot be used: zsh's partial-line mark. */
const RAW_MAX = 1024 * 1024;
/** A command typed in that has not started after this long is waiting for
 * more of itself: an open quote, a heredoc. The shell's question is shown. */
const INPUT_WAIT_MS = 1500;
/** A command still running after this long gets the keys. */
const FOCUS_DELAY_MS = 400;
/** `clear` and its kin empty the feed, as they would a screen. */
const CLEARS = /^\s*(clear|reset|tput\s+(clear|reset))\s*$/;

// What this browser remembers of a feed, so that Classic and back or a
// reload leave it as it was: the blocks folded, and how far Ctrl+L cleared
// it from view (a `clear` the feed finds by itself). A convenience: without
// it a feed opens unfolded and whole.
const FOLDED_KEY = "tterm.folded";
const FOLDED_MAX = 2000;
const CLEARED_KEY = "tterm.cleared";
const CLEARED_MAX = 200;

/** Up to which block (its number) the feed is cleared from view, and the
 * cut the person chose to see past again. */
interface ClearMark {
  at?: number;
  shown?: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return (raw ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept, then: the feed works the same.
  }
}

function foldedBlocks(): Set<string> {
  const list = readJson<unknown>(FOLDED_KEY, []);
  return new Set(Array.isArray(list)
    ? list.filter((x): x is string => typeof x === "string") : []);
}

function rememberFolded(id: string, folded: boolean): void {
  const list = [...foldedBlocks()].filter((x) => x !== id);
  if (folded) list.push(id);
  writeJson(FOLDED_KEY, list.slice(-FOLDED_MAX));
}

function clearMarks(): Record<string, ClearMark> {
  const all = readJson<unknown>(CLEARED_KEY, {});
  return all && typeof all === "object" && !Array.isArray(all)
    ? all as Record<string, ClearMark> : {};
}

function rememberClear(terminalId: string, mark: ClearMark): void {
  const all = clearMarks();
  delete all[terminalId];
  all[terminalId] = mark;
  // The latest terminals only; the oldest go first.
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - CLEARED_MAX))) {
    delete all[k];
  }
  writeJson(CLEARED_KEY, all);
}

/** The block's number from its key, s123; null for one not in the stream. */
function seqOf(key: string | null): number | null {
  return key && /^s\d+$/.test(key) ? Number(key.slice(1)) : null;
}

interface Live {
  key: string;
  cols: number;
  chunks: Uint8Array[];
  size: number;
  dropped: boolean;
  command: string;
  /** It went to the second screen: a full-screen program. */
  alt: boolean;
}

interface Pending {
  command: string;
  chunks: Uint8Array[];
  timer: number;
  /** Run again on a block (0.1.13): the new block lights up for a moment,
   * wherever the feed was. */
  again?: boolean;
}

interface Props {
  terminalId: string;
  shownTheme: Shown;
  ended: boolean;
  /** Its tab is in front: only then does it take the keys. */
  active: boolean;
  /** Its machine's name, once it is known. */
  machine?: string;
  /** The home directory as tTerm Web knows it, for a terminal whose shell
   * has not said it here (one that ended in an earlier run). */
  home: string;
  events: ViewEvents;
  onClassic: () => void;
  notify: (text: string) => void;
  /** A command search put here, for the line (0.1.7): not run. */
  paste: { text: string; n: number } | null;
  /** What goes under a finished block (0.1.17): in tTerm for Mac, the strip
   * after a successful `ssh <host>`. */
  after?: (block: FeedBlock, blocks: FeedBlock[]) => ReactNode;
}

/** How many pages of earlier blocks a block found by search is looked for
 * in, at most. */
const FIND_PAGES = 40;

function fromStored(b: StoredBlock, cols: number, folded = false): FeedBlock {
  return {
    key: `s${b.seqStart}`,
    seqStart: b.seqStart,
    seqEnd: b.seqEnd,
    command: b.command,
    cwd: b.cwd,
    branch: b.branch,
    startedAt: b.startedAt,
    finishedAt: b.finishedAt,
    exitCode: b.exitCode,
    state: "done",
    cols: b.cols ?? cols,
    rendered: null,
    partial: b.partial,
    cut: b.cut,
    stored: true,
    expanded: false,
    collapsed: folded,
  };
}

function join(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const strong = (inner: ReactNode) => <strong>{inner}</strong>;

export function FeedTerminal(props: Props) {
  const { terminalId, shownTheme } = props;
  const t = useT();
  const [blocks, setBlocks] = useState<FeedBlock[]>([]);
  const [more, setMore] = useState(false);
  const [liveKey, setLiveKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("start");
  const [prompt, setPrompt] = useState<Prompt>(
    { cwd: "", home: "", branch: "", venv: "" });
  const [fullscreen, setFullscreen] = useState(false);
  const [clipRows, setClipRows] = useState(1);
  const [cellHeight, setCellHeight] = useState(17);
  const [ask, setAsk] = useState<Confirm | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [restore, setRestore] =
    useState<{ text: string; n: number; from?: "search" } | null>(null);
  /** The block up to which the feed was cleared from view. */
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef(0);
  const [loaded, setLoaded] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const parkRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const holder = useMemo(() => {
    const el = document.createElement("div");
    el.className = "live-holder";
    return el;
  }, []);
  const term = useRef<Terminal | null>(null);
  const chan = useRef<Channel | null>(null);
  const homeRef = useRef<Home | null>(null);
  const phaseRef = useRef<Phase>("start");
  const isFull = useRef(false);
  const stick = useRef(true);
  const layoutRef = useRef<() => void>(() => {});
  const measureRef = useRef<() => void>(() => {});
  const events = useRef(props.events);
  events.current = props.events;
  const notify = useRef(props.notify);
  notify.current = props.notify;
  const ended = useRef(props.ended);
  ended.current = props.ended;
  const active = useRef(props.active);
  active.current = props.active;
  const restoreN = useRef(0);
  // What the stream handlers share; none of it is drawn directly.
  const s = useRef({
    knownSeq: -1,
    live: null as Live | null,
    inputKey: null as string | null,
    pending: null as Pending | null,
    replaying: false,
    unwritten: 0,
    info: null as TerminalInfo | null,
    prompt: { cwd: "", home: "", branch: "", venv: "" } as Prompt,
  });

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const putBack = useCallback((text: string) => {
    restoreN.current += 1;
    setRestore({ text, n: restoreN.current });
  }, []);

  // ------------------------------------------------------- the terminal
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    const cleanups: (() => void)[] = [];
    const st = s.current;

    const start = async () => {
      try {
        await document.fonts.load(`${FONT_SIZE}px "JetBrains Mono Variable"`); // i18n-ignore
      } catch {
        // A fallback font is measured instead.
      }
      if (disposed) return;
      const xterm = new Terminal({
        fontFamily: FONT,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        cursorBlink: true,
        scrollback: KEEP_LINES,
        allowProposedApi: true,
        theme: liveTheme(document.documentElement.classList.contains("tt-light")
          ? "light" : "dark"),
      });
      term.current = xterm;
      const fit = new FitAddon();
      xterm.loadAddon(fit);
      xterm.loadAddon(new Unicode11Addon());
      xterm.unicode.activeVersion = "11";
      parkRef.current?.appendChild(holder);
      xterm.open(holder);
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        xterm.loadAddon(webgl);
      } catch {
        // No WebGL here: xterm.js draws with the DOM instead.
      }

      // The size: the feed's column when inline, the whole area full-screen.
      const layout = () => {
        const feed = feedRef.current;
        const col = colRef.current;
        const area = feed?.parentElement;
        if (!feed || !col || !area) return;
        const full = isFull.current;
        const width = full ? area.clientWidth - 26 : col.clientWidth - 18;
        const height = full ? area.clientHeight - 14
          : Math.max(120, feed.clientHeight - 112);
        holder.style.width = `${Math.max(100, width)}px`;
        holder.style.height = `${Math.max(60, height)}px`;
        fit.fit();
        const screen = holder.querySelector<HTMLElement>(".xterm-screen");
        if (screen && xterm.rows) {
          setCellHeight(screen.getBoundingClientRect().height / xterm.rows);
        }
      };
      layoutRef.current = layout;
      layout();
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!disposed) layout();
        });
      });
      if (feedRef.current) observer.observe(feedRef.current);
      if (colRef.current) observer.observe(colRef.current);

      // How many rows of the running command's screen to show.
      let measuring = 0;
      const measure = () => {
        if (measuring) return;
        measuring = requestAnimationFrame(() => {
          measuring = 0;
          const b = xterm.buffer.active;
          let used = b.baseY > 0 || b.type === "alternate" ? xterm.rows
            : b.cursorY + 1;
          if (used < xterm.rows) {
            for (let y = xterm.rows - 1; y >= used; y--) {
              if (b.getLine(y)?.translateToString(true)) {
                used = y + 1;
                break;
              }
            }
          }
          setClipRows(used);
        });
      };

      measureRef.current = measure;

      const writeLive = (data: Uint8Array) => {
        st.unwritten += data.length;
        if (st.unwritten > HIGH) chan.current?.pause();
        xterm.write(data, () => {
          st.unwritten -= data.length;
          if (st.unwritten < LOW) chan.current?.resume();
          measure();
        });
      };

      const removeBlock = (key: string) =>
        setBlocks((bs) => bs.filter((b) => b.key !== key));

      const dropInput = () => {
        if (!st.inputKey) return;
        const key = st.inputKey;
        st.inputKey = null;
        removeBlock(key);
        setLiveKey((k) => (k === key ? null : k));
      };

      const clearPending = () => {
        if (st.pending) window.clearTimeout(st.pending.timer);
        st.pending = null;
      };

      const startLive = (block: FeedBlock) => {
        st.live = { key: block.key, cols: block.cols, chunks: [], size: 0,
          dropped: false, command: block.command, alt: false };
        // A clean screen for it, after whatever is still queued before it.
        xterm.write(EMPTY, () => {
          xterm.reset();
          measure();
        });
        setBlocks((bs) => [...bs.filter((b) => b.state !== "input"), block]);
        setLiveKey(block.key);
        setPhaseBoth("running");
      };

      const finishLive = (code: number | null, trim: number, at: number | null,
        seqEnd: number) => {
        const live = st.live;
        if (!live) return;
        st.live = null;
        st.knownSeq = Math.max(st.knownSeq, seqEnd);
        const key = live.key;
        setBlocks((bs) => bs.map((b) => b.key === key ? {
          ...b, state: "done", exitCode: code, finishedAt: at, seqEnd,
          stored: true,
        } : b));
        if (CLEARS.test(live.command) && code === 0) setClearedAt(key);
        // Drawn again without zsh's mark, but only from the whole output:
        // with its start gone, so is a full-screen program's switch to its
        // second screen, and its screens would land on the main one. The
        // screen as it was is right then, the mark and all.
        const raw = trim > 0 && !live.dropped ? join(live.chunks, live.size)
          : null;
        // Read its screen back once everything before the end is drawn.
        xterm.write(EMPTY, () => {
          const buffer = xterm.buffer.normal;
          const rendered = { ...readBuffer(buffer,
            buffer.length >= KEEP_LINES + xterm.rows), alt: live.alt };
          // A full-screen program that never switched back (killed, or its
          // ssh connection gone) must not keep the screen.
          if (xterm.buffer.active.type === "alternate") xterm.reset();
          setBlocks((bs) => bs.map((b) => b.key === key
            ? { ...b, rendered, partial: b.partial || live.dropped } : b));
          setLiveKey((k) => (k === key ? null : k));
          if (raw) {
            // zsh's partial-line mark is on that screen; drawn again
            // without it.
            void renderOutput(raw.subarray(0, Math.max(0, raw.length - trim)),
              live.cols).then((r) => setBlocks((bs) => bs.map((b) =>
              b.key === key ? { ...b, rendered: r } : b)));
          }
        });
      };

      // A command the shell would not run: what it answered, without the
      // line editor's echo of the command itself.
      const notRun = async (p: Pending, code: number | null, at: number) => {
        const size = p.chunks.reduce((n, c) => n + c.length, 0);
        const rendered = await renderOutput(join(p.chunks, size), xterm.cols);
        const own = p.command.split("\n").map((l) => l.trim()).filter(Boolean);
        const lines = [...rendered.lines];
        while (lines.length && (!lines[0].text.trim() ||
            own.some((l) => lines[0].text.trim().endsWith(l)))) {
          lines.shift();
        }
        if (!lines.length || disposed) return;
        setBlocks((bs) => [...bs, {
          key: `r${at}`, seqStart: -1, seqEnd: null, command: p.command,
          cwd: st.prompt.cwd, branch: st.prompt.branch, startedAt: at,
          finishedAt: at, exitCode: code, state: "done", cols: xterm.cols,
          rendered: { lines, limited: false }, partial: false, cut: false,
          stored: false, expanded: false, collapsed: false,
        }]);
      };

      // The terminal ended: a command still running ended with it, and
      // nothing takes keys any more.
      const stopTerminal = () => {
        if (st.live) finishLive(null, 0, Date.now(), st.knownSeq);
        dropInput();
        clearPending();
        xterm.options.disableStdin = true;
        xterm.options.cursorBlink = false;
        xterm.write("\x1b[?25l");
        xterm.blur();
      };

      // The finished blocks from the database, newest drawn first.
      let feed = null;
      try {
        feed = await loadFeed(terminalId);
      } catch {
        feed = null;
      }
      if (disposed) return;
      const stored = feed?.blocks ?? [];
      st.knownSeq = stored.reduce((m, b) => Math.max(m, b.seqEnd ?? b.seqStart),
        -1);
      const folded = foldedBlocks();
      setBlocks(stored.map((b) => fromStored(b, xterm.cols,
        folded.has(`${terminalId}:${b.seqStart}`))));
      // Cleared from view as it was: the last `clear` that worked, or
      // Ctrl+L, whichever came later, unless that cut was opened again.
      const lastClear = [...stored].reverse().find((b) =>
        CLEARS.test(b.command) && b.exitCode === 0);
      const mark = clearMarks()[terminalId] ?? {};
      const cut = Math.max(lastClear?.seqStart ?? -1,
        typeof mark.at === "number" ? mark.at : -1);
      if (cut >= 0 && cut !== mark.shown) setClearedAt(`s${cut}`);
      setMore(!!feed?.more);
      setLoaded(true);
      void (async () => {
        for (const b of [...stored].reverse()) {
          if (disposed) return;
          const rendered = await renderOutput(fromBase64(b.output),
            b.cols ?? xterm.cols);
          setBlocks((bs) => bs.map((x) => x.key === `s${b.seqStart}`
            ? { ...x, rendered } : x));
        }
      })();
      loadHistory(terminalId)
        .then((h) => {
          if (!disposed) setHistory(h.map((e) => e.command));
        })
        .catch(() => {});

      const channel = socket.attach(terminalId, xterm.cols, xterm.rows, {
        attached: (info, resumed) => {
          st.info = info;
          // Going on from the last block of the database, or back after a
          // moment away: what comes up to `replayed` is old news, and the
          // terminal must not answer questions programs asked in it.
          if (resumed) st.replaying = true;
          events.current.attached(info);
        },
        reset: (base, running) => {
          st.replaying = true;
          // What this page had of the live part goes: the replay brings it.
          if (st.live) {
            removeBlock(st.live.key);
            st.live = null;
          }
          dropInput();
          clearPending();
          // After whatever was still on its way to the screen.
          xterm.write(EMPTY, () => xterm.reset());
          st.unwritten = 0;
          setLiveKey(null);
          setPhaseBoth("start");
          const r = running;
          if (r && r.seqStart > st.knownSeq && r.seqStart <= base) {
            // It began before what is kept: what the core says of it.
            startLive({
              key: `s${r.seqStart}`, seqStart: r.seqStart, seqEnd: null,
              command: r.command, cwd: r.cwd, branch: r.branch,
              startedAt: r.at, finishedAt: null, exitCode: null,
              state: "running", cols: r.cols || xterm.cols, rendered: null,
              partial: true, cut: false, stored: false, expanded: false,
              collapsed: false,
            });
          }
        },
        replayed: () => {
          xterm.write(EMPTY, () => {
            st.replaying = false;
          });
        },
        output: (data, seq) => {
          if (seq <= st.knownSeq) return;
          if (st.live) {
            writeLive(data);
            const live = st.live;
            live.chunks.push(data);
            live.size += data.length;
            while (live.size > RAW_MAX && live.chunks.length > 1) {
              live.size -= live.chunks.shift()!.length;
              live.dropped = true;
            }
            return;
          }
          if (st.pending) {
            st.pending.chunks.push(data);
            if (st.inputKey) writeLive(data);
          }
        },
        marker: (ev, seq) => {
          if (ev.t === "P") {
            const p = { cwd: ev.cwd, home: ev.home, branch: ev.branch,
              venv: ev.venv };
            st.prompt = p;
            setPrompt(p);
          }
          if (seq <= st.knownSeq) {
            if (ev.t === "P") setPhaseBoth("prompt");
            return;
          }
          if (ev.t === "C") {
            if (st.live) finishLive(ev.prev, 0, ev.at, seq - 1);
            const again = !!st.pending?.again;
            dropInput();
            clearPending();
            startLive({
              key: `s${seq}`, seqStart: seq, seqEnd: null, command: ev.command,
              cwd: st.prompt.cwd, branch: st.prompt.branch, startedAt: ev.at,
              finishedAt: null, exitCode: null, state: "running", cols: xterm.cols,
              rendered: null, partial: false, cut: false, stored: false,
              expanded: false, collapsed: false,
            });
            if (again) {
              // Ringed in amber, as a block a link opens: the eye finds it.
              const key = `s${seq}`;
              setFlash(key);
              window.clearTimeout(flashTimer.current);
              flashTimer.current = window.setTimeout(
                () => setFlash((f) => (f === key ? null : f)), PRESSED_MS);
            }
            if (ev.command.trim()) {
              setHistory((h) => [ev.command, ...h.filter((x) => x !== ev.command)]);
            }
          } else {
            if (st.live) finishLive(ev.code, ev.trim, ev.at, seq - 1);
            // A prompt with no start before it: the shell did not run what
            // was typed (a syntax error, say). What it said goes in a block.
            const refused = !st.inputKey ? st.pending : null;
            if (st.inputKey) xterm.write(EMPTY, () => xterm.reset());
            dropInput();
            clearPending();
            if (refused && refused.chunks.length) {
              void notRun(refused, ev.code, ev.at);
            }
            setPhaseBoth("prompt");
          }
          events.current.marker(ev);
        },
        state: (info) => {
          st.info = info;
          events.current.state(info);
          if (info.state === "ended") stopTerminal();
        },
        gone: (info) => {
          stopTerminal();
          events.current.gone(info);
        },
        confirm: (question) => {
          clearPending();
          setAsk(question);
        },
        refused: (command, reason) => {
          clearPending();
          notify.current(reason);
          putBack(command);
        },
      }, st.knownSeq >= 0 ? st.knownSeq : null);
      chan.current = channel;

      xterm.onData((data) => {
        if (!st.replaying && (st.live || st.inputKey)) channel.input(data);
      });
      xterm.onBinary((data) => {
        if (!st.replaying && (st.live || st.inputKey)) channel.inputBinary(data);
      });
      xterm.textarea?.addEventListener("focus", () => channel.focus());
      xterm.onResize(({ cols, rows }) => channel.resize(cols, rows));
      xterm.buffer.onBufferChange((buffer) => {
        const full = buffer.type === "alternate";
        if (full && st.live) st.live.alt = true;
        if (full === isFull.current) return;
        isFull.current = full;
        setFullscreen(full);
      });

      cleanups.push(keepKeys(() => {
        if (disposed || ended.current || !active.current) return null;
        const p = phaseRef.current;
        const live = { element: xterm.textarea ?? null, type: (d: string) => xterm.input(d) };
        if (isFull.current || p === "input") return live;
        if (p === "prompt") return homeRef.current;
        if (p === "running") {
          // The next command being typed ahead keeps the keys in the line.
          const field = homeRef.current?.element as HTMLTextAreaElement | undefined;
          return field?.value ? homeRef.current : live;
        }
        return null;
      }));
      cleanups.push(() => {
        clearPending();
        cancelAnimationFrame(measuring);
        window.clearTimeout(flashTimer.current);
      });
    };
    void start();

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      chan.current?.detach();
      chan.current = null;
      term.current?.dispose();
      term.current = null;
      holder.remove();
    };
  }, [terminalId, holder, setPhaseBoth, putBack]);

  // ---------------------------------------- where the terminal is drawn
  useLayoutEffect(() => {
    const target = fullscreen ? fullRef.current
      : liveKey ? clipRef.current : parkRef.current;
    if (target && holder.parentElement !== target) target.appendChild(holder);
  });

  useLayoutEffect(() => {
    const xterm = term.current;
    if (xterm) xterm.options.theme = fullscreen ? terminalTheme(shownTheme)
      : liveTheme(shownTheme);
    layoutRef.current();
    if (fullscreen && !typingElsewhere(feedRef.current?.closest(".terminal-view"))) {
      xterm?.focus();
    }
  }, [fullscreen, shownTheme]);

  // Where keys go when the phase changes. A command that is over in a moment
  // leaves them in the line, so that typing ahead lands there; one that goes
  // on gets them (a password, a y, an answer), unless the next command is
  // being typed in the line already. Back at the prompt, back to the line.
  useEffect(() => {
    const xterm = term.current;
    if (!xterm || props.ended || !props.active) return;
    const line = homeRef.current?.element;
    // A window or the search over the terminal keeps the keys (0.1.7).
    const elsewhere = () => typingElsewhere(feedRef.current?.closest(".terminal-view"));
    const here = () => {
      const active = document.activeElement;
      return (!active || active === document.body || active === line) && !elsewhere();
    };
    if (phase === "input") {
      if (!elsewhere()) xterm.focus();
      return;
    }
    if (phase === "running") {
      const timer = window.setTimeout(() => {
        const field = homeRef.current?.element as HTMLTextAreaElement | undefined;
        if (phaseRef.current === "running" && !field?.value && here()) xterm.focus();
      }, FOCUS_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "prompt" && !fullscreen) {
      const active = document.activeElement;
      if ((active === xterm.textarea || !active || active === document.body) &&
          !elsewhere()) {
        line?.focus();
      }
    }
  }, [phase, fullscreen, props.ended, props.active]);

  // Its tab brought to the front: the keys come here, where they belong.
  // Sent behind: it no longer claims them.
  useEffect(() => {
    const xterm = term.current;
    if (!props.active) chan.current?.unfocus();
    if (!props.active || props.ended || !xterm) return;
    const p = phaseRef.current;
    const line = homeRef.current?.element as HTMLTextAreaElement | undefined;
    if (isFull.current || p === "input" || (p === "running" && !line?.value)) {
      xterm.focus();
    } else if (p === "prompt" || p === "running") {
      line?.focus();
    }
  }, [props.active, props.ended]);

  // The feed sticks to its bottom while you are there.
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (feed && stick.current) feed.scrollTop = feed.scrollHeight;
  });

  // A link to a block: there, and lit up for a moment. On opening the page,
  // and when the address changes to another block of it.
  useEffect(() => {
    if (!loaded || !props.active) return;
    let timer = 0;
    const show = () => {
      const m = /^#b(\d+)$/.exec(location.hash);
      const el = m && feedRef.current?.querySelector<HTMLElement>(`#b${m[1]}`);
      if (!m || !el) return;
      stick.current = false;
      el.scrollIntoView({ block: "center" });
      setFlash(`s${m[1]}`);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(null), 2400);
    };
    show();
    window.addEventListener("hashchange", show);
    return () => {
      window.removeEventListener("hashchange", show);
      window.clearTimeout(timer);
    };
  }, [loaded, props.active]);

  // ------------------------------------------------------------ actions
  /** Sends a command to the shell: whether it went. */
  const run = useCallback((command: string, confirmed = false,
    again = false): boolean => {
    const st = s.current;
    const channel = chan.current;
    if (!channel) return false;
    if (!socket.connected) {
      notify.current(t("feed.not_connected"));
      putBack(command);
      return false;
    }
    if (phaseRef.current !== "prompt" || st.pending) {
      notify.current(t("feed.still_running"));
      putBack(command);
      return false;
    }
    setAsk(null);
    stick.current = true;
    const pending: Pending = { command, chunks: [], timer: 0, again };
    pending.timer = window.setTimeout(() => {
      if (s.current.pending === pending) waitInput.current();
    }, INPUT_WAIT_MS);
    st.pending = pending;
    channel.run(command, confirmed);
    return true;
  }, [putBack, t]);

  // The function that shows a command waiting for more of itself lives in
  // the terminal's effect; this reaches it.
  const waitInput = useRef<() => void>(() => {});
  useEffect(() => {
    waitInput.current = () => {
      const st = s.current;
      const xterm = term.current;
      const p = st.pending;
      if (!p || st.live || !xterm) return;
      const key = `i${Date.now()}`;
      st.inputKey = key;
      xterm.write(EMPTY, () => xterm.reset());
      for (const chunk of p.chunks) xterm.write(chunk);
      xterm.write(EMPTY, () => measureRef.current());
      setBlocks((bs) => [...bs, {
        key, seqStart: -1, seqEnd: null, command: p.command,
        cwd: st.prompt.cwd, branch: st.prompt.branch, startedAt: Date.now(),
        finishedAt: null, exitCode: null, state: "input", cols: xterm.cols,
        rendered: null, partial: false, cut: false, stored: false,
        expanded: false, collapsed: false,
      }]);
      setLiveKey(key);
      setPhaseBoth("input");
      if (!typingElsewhere(feedRef.current?.closest(".terminal-view"))) xterm.focus();
    };
  }, [setPhaseBoth]);

  const update = (key: string, change: Partial<FeedBlock>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...change } : b)));

  const copy = async (text: string): Promise<boolean> => {
    const ok = await toClipboard(text);
    if (!ok) props.notify(t("feed.copy_refused"));
    return ok;
  };

  const showAll = async (b: FeedBlock) => {
    if (!(b.partial || b.cut || b.rendered?.limited) || !b.stored) {
      update(b.key, { expanded: true });
      return;
    }
    let data: Uint8Array | null = null;
    // A block that just ended may not be in the database yet.
    for (let i = 0; i < 6 && !data; i++) {
      try {
        data = await blockOutput(terminalId, b.seqStart);
      } catch {
        data = null;
      }
      if (!data) await new Promise((r) => window.setTimeout(r, 400));
    }
    if (!data) {
      props.notify(t("feed.output_gone"));
      update(b.key, { expanded: true });
      return;
    }
    const rendered = await renderOutput(data, b.cols);
    update(b.key, { rendered, expanded: true, partial: false });
  };

  const blocksNow = useRef(blocks);
  blocksNow.current = blocks;
  const moreNow = useRef(more);
  moreNow.current = more;
  const loadPage = async () => {
    const first = blocksNow.current.find((b) => b.stored);
    const feed = await loadFeed(terminalId, first?.seqStart).catch(() => null);
    if (!feed) return;
    stick.current = false;
    const cols = term.current?.cols ?? 80;
    setBlocks((bs) => {
      const have = new Set(bs.map((b) => b.key));
      const folded = foldedBlocks();
      return [...feed.blocks.map((b) => fromStored(b, cols,
        folded.has(`${terminalId}:${b.seqStart}`)))
        .filter((b) => !have.has(b.key)), ...bs];
    });
    setMore(feed.more);
    for (const b of [...feed.blocks].reverse()) {
      const rendered = await renderOutput(fromBase64(b.output),
        b.cols ?? cols);
      update(`s${b.seqStart}`, { rendered });
    }
  };
  /** The earlier page being loaded: asked again meanwhile (the button, or
   * search going back to a block), the same load is waited for. */
  const loadingEarlier = useRef<Promise<void> | null>(null);
  const loadEarlier = (): Promise<void> => {
    loadingEarlier.current ??= loadPage().finally(() => {
      loadingEarlier.current = null;
    });
    return loadingEarlier.current;
  };

  // A command search put here (0.1.7): into the line, not run, with the
  // keys there.
  useEffect(() => {
    const p = props.paste;
    if (!p || props.ended || !takePaste(p.n)) return;
    restoreN.current += 1;
    setRestore({ text: p.text, n: restoreN.current, from: "search" });
    stick.current = true;
    window.setTimeout(() => homeRef.current?.element?.focus(), 0);
  }, [props.paste, props.ended]);

  // The block search opened (0.1.7): loaded if it is further back than the
  // feed is, shown if it was cleared from view or folded, its whole output
  // if the words are in it, and there, in the middle.
  const found = useFoundBlock(terminalId);
  const showAllNow = useRef<(b: FeedBlock) => Promise<void>>(async () => {});
  showAllNow.current = showAll;
  useEffect(() => {
    if (!found || !loaded || !props.active || wentThere(found.n)) return;
    let cancelled = false;
    const go = async () => {
      for (let page = 0; page <= FIND_PAGES && !cancelled; page++) {
        const all = blocksNow.current;
        const at = all.findIndex((b) => b.seqStart === found.seq);
        if (at >= 0) {
          const b = all[at];
          setClearedAt((cut) => {
            const c = cut ? all.findIndex((x) => x.key === cut) : -1;
            return c >= at ? null : cut;
          });
          if (b.collapsed) {
            setBlocks((bs) => bs.map((x) => (x.key === b.key ? { ...x, collapsed: false } : x)));
          }
          // All of it: the words may be above the last lines shown, or
          // beyond what the feed brought.
          if (found.inOutput && !b.expanded) await showAllNow.current(b);
          // Its output drawn first, so that the words are marked in it.
          for (let i = 0; i < 60 && !cancelled; i++) {
            if (blocksNow.current.find((x) => x.key === b.key)?.rendered !== null) break;
            await new Promise((r) => requestAnimationFrame(r));
          }
          await new Promise((r) => requestAnimationFrame(r));
          if (cancelled) return;
          stick.current = false;
          // Found in a long output: the line with the words in the middle,
          // not the middle of the block.
          const shown = feedRef.current?.querySelector<HTMLElement>(`#b${found.seq}`);
          const output = found.inOutput
            ? shown?.querySelector<HTMLElement>("pre.out") : null;
          const word = output ? markOnLine(output, found.words, "found-mark") : null;
          (word ?? shown)?.scrollIntoView({ block: "center" });
          goneThere(found.n);
          return;
        }
        if (!moreNow.current) break;
        await loadEarlier();
        await new Promise((r) => requestAnimationFrame(r));
      }
    };
    void go().then(() => {
      // Not there any more (expired, or further back than the pages looked
      // through): not looked for again.
      if (!cancelled) goneThere(found.n);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.n, loaded, props.active]);

  const home = prompt.home || s.current.info?.home || props.home;

  // `clear`, or Ctrl+L: what came before goes out of view, not away. The
  // cut is at a finished block, and a block still running stays in view.
  const clearFeed = () => {
    const last = [...blocks].reverse().find((b) => b.state === "done");
    if (!last) return;
    setClearedAt(last.key);
    // Remembered at the last block of the stream, for after a reload.
    const anchor = [...blocks].reverse().find((b) =>
      b.state === "done" && b.seqStart >= 0);
    if (anchor) rememberClear(terminalId, { at: anchor.seqStart });
  };
  const showCleared = () => {
    const at = seqOf(clearedAt);
    if (at !== null) {
      rememberClear(terminalId, { ...clearMarks()[terminalId], shown: at });
    }
    setClearedAt(null);
  };
  const blockText = (b: FeedBlock): string => {
    const where = [b.cwd ? shortPath(b.cwd, home) : "",
      b.branch ? `(${b.branch})` : ""].filter(Boolean).join(" ");
    const head = `${where ? `${where} ` : ""}$ ${b.command}`;
    const out = b.rendered ? plainText(b.rendered) : "";
    return out ? `${head}\n${out}` : head;
  };
  const cut = clearedAt ? blocks.findIndex((b) => b.key === clearedAt) : -1;
  const shown = cut >= 0
    ? blocks.filter((b, i) => i > cut || b.state !== "done") : blocks;
  const hiddenCount = blocks.length - shown.length;

  return (
    <>
      <div className="feed" ref={feedRef} onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}>
        <div className="feed-col" ref={colRef}>
          {more && hiddenCount === 0 && (
            <button type="button" className="feed-earlier" onClick={loadEarlier}>
              {t("feed.show_earlier")}
            </button>
          )}
          {hiddenCount > 0 && (
            <button type="button" className="feed-earlier"
              onClick={showCleared}>
              {t("feed.cleared", { n: hiddenCount })}
            </button>
          )}
          {loaded && blocks.length === 0 && phase !== "start" && (
            <p className="feed-empty">
              {t("feed.empty")}
            </p>
          )}
          {shown.map((b) => (
            <Fragment key={b.key}>
            <BlockView block={b} home={home}
              live={b.key === liveKey && !fullscreen}
              clipRef={b.key === liveKey ? clipRef : undefined}
              clipHeight={Math.ceil(clipRows * cellHeight)}
              flash={flash === b.key}
              found={found && found.seq === b.seqStart ? found.words : null}
              onCopyBlock={(x) => copy(blockText(x))}
              onCopyOutput={(x) => copy(x.rendered ? plainText(x.rendered) : "")}
              onRunAgain={(x) => run(x.command, false, true)}
              onCopyLink={(x) => copy(
                `${location.origin}/t/${terminalId}#b${x.seqStart}`)}
              onToggle={(x) => {
                update(x.key, { collapsed: !x.collapsed });
                if (x.seqStart >= 0) {
                  rememberFolded(`${terminalId}:${x.seqStart}`, !x.collapsed);
                }
              }}
              onShowAll={(x) => void showAll(x)}
              onStop={() => chan.current?.input("\x03")} />
            {b.state === "done" && props.after?.(b, shown)}
            </Fragment>
          ))}
        </div>
      </div>
      {ask && !props.ended && (() => {
        // What the command would do, in the language shown; one the page
        // does not know yet, as it came.
        const known = DANGER_KEYS[ask.what];
        const danger = known ? { what: t(known.what), lost: t(known.lost) }
          : { what: ask.what, lost: ask.lost };
        return (
        <div className="confirm-bar" role="alertdialog"
          aria-label={t("feed.confirm_label")}>
          <Warning size={18} className="confirm-icon" />
          <div className="confirm-text">
            <p>{props.machine === undefined
              ? t.rich("feed.confirm_unknown", { what: danger.what, lost: danger.lost, strong })
              : t.rich("feed.confirm", { what: danger.what, machine: props.machine,
                lost: danger.lost, strong })}</p>
            {ask.everything && (
              <p className="red">{t.rich("feed.everything", { strong })}</p>
            )}
            <code>{ask.command}</code>
          </div>
          <div className="button-row">
            <button type="button" className="button-danger"
              onClick={() => run(ask.command, true)}>{t("feed.run_it")}</button>
            <button type="button" className="button-plain" autoFocus
              onClick={() => {
                putBack(ask.command);
                setAsk(null);
              }}>{t("common.cancel")}</button>
          </div>
        </div>
        );
      })()}
      {!props.ended && (
        <InputLine terminalId={terminalId} phase={fullscreen ? "full" : phase}
          prompt={prompt} history={history} restore={restore} homeRef={homeRef}
          onRun={(command) => run(command)}
          onInterrupt={() => chan.current?.input("\x03")}
          onClear={clearFeed} onClassic={props.onClassic}
          notify={props.notify} />
      )}
      <div className="live-park" ref={parkRef} aria-hidden="true" />
      {fullscreen && <div className="live-full" ref={fullRef} />}
    </>
  );
}
