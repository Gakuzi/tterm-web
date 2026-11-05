// The classic mode: one terminal over the whole area, every key straight to
// the shell, and the shell draws everything, its prompt included. Its own Tab
// and history work, and nothing is checked before a command runs.
//
// The terminal lives in the core. Closing this view, reloading the page or
// losing the connection leaves it running; coming back attaches again and
// the screen is drawn as it was.

import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import type { TerminalInfo } from "./api";
import { takePaste } from "./found";
import { useT } from "./i18n";
import { keepKeys, typingElsewhere } from "./keys";
import { notifyCommandCompleted } from "./notifications";
import { socket, type Channel, type MarkerEvent } from "./socket";
import type { Shown } from "./theme";
import { terminalTheme } from "./xtermTheme";

export const FONT = '"JetBrains Mono Variable", "JetBrains Mono", ' + // i18n-ignore
  'ui-monospace, SFMono-Regular, Menlo, monospace';
export const FONT_SIZE = 13;
/** Output handed to the terminal but not drawn yet. Above HIGH the core is
 * asked to wait; below LOW it may go on. Kept small, so that after Ctrl+C
 * on a flood the screen is there in a moment, not after megabytes. */
export const HIGH = 512 * 1024;
export const LOW = 128 * 1024;

export interface ViewEvents {
  attached: (terminal: TerminalInfo) => void;
  marker: (event: MarkerEvent) => void;
  state: (terminal: TerminalInfo) => void;
  gone: (terminal: TerminalInfo | null) => void;
  /** The core said its machine is closed on this device (0.1.28). */
  locked?: () => void;
}

interface Props {
  terminalId: string;
  shownTheme: Shown;
  /** An ended terminal takes no keys, so it does not take them back. */
  ended: boolean;
  /** Its tab is in front: only then does it take the keys. */
  active: boolean;
  /** Grows when the Settings window over it closes (0.1.27): it takes the
   * keys back, as when its tab comes to the front. */
  refocus?: number;
  events: ViewEvents;
  /** A command search put here (0.1.7): typed at the prompt, not run. */
  paste?: { text: string; n: number } | null;
  notify?: (text: string) => void;
}

export function ClassicTerminal(props: Props) {
  const { terminalId, shownTheme } = props;
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const events = useRef(props.events);
  events.current = props.events;
  const ended = useRef(props.ended);
  ended.current = props.ended;
  const active = useRef(props.active);
  active.current = props.active;
  /** History is drawn: keys typed from now on are new (0.1.7, for a
   * command search puts in). */
  const ready = useRef(false);
  const waiting = useRef<{ text: string; n: number } | null>(null);
  const pasteWaiting = useRef(() => {});
  const lastCommand = useRef<{ command: string; startedAt: number } | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let disposed = false;
    let channel: Channel | null = null;
    let observer: ResizeObserver | null = null;
    let xterm: Terminal | null = null;
    let pending = 0;
    let frame = 0;
    // While history is drawn again, the terminal answers questions programs
    // asked long ago (the cursor position, the colours); those answers must
    // not be typed into the shell now.
    let replaying = false;
    // A command redacted in the log (0.1.20) while this page was away: the
    // screen is drawn again once the catching up is over.
    let resuming = false;
    let redrawAfter = false;
    const cleanups: (() => void)[] = [];

    const start = async () => {
      // The font must be there before the terminal measures its cells.
      try {
        await document.fonts.load(`${FONT_SIZE}px "JetBrains Mono Variable"`); // i18n-ignore
      } catch {
        // A fallback font is measured instead; still a working terminal.
      }
      if (disposed) return;
      xterm = new Terminal({
        fontFamily: FONT,
        fontSize: FONT_SIZE,
        lineHeight: 1.15,
        cursorBlink: true,
        scrollback: 10000,
        allowProposedApi: true,
        theme: terminalTheme(
          document.documentElement.classList.contains("tt-light")
            ? "light" : "dark"),
      });
      term.current = xterm;
      const fit = new FitAddon();
      xterm.loadAddon(fit);
      xterm.loadAddon(new Unicode11Addon());
      xterm.unicode.activeVersion = "11";
      xterm.open(element);
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        xterm.loadAddon(webgl);
      } catch {
        // No WebGL here: xterm.js draws with the DOM instead.
      }
      fit.fit();

      const x = xterm;
      // An ended terminal takes no keys and shows no cursor: nothing there
      // reads them any more. Its last screen stays, under the note.
      const stop = () => {
        x.options.disableStdin = true;
        x.options.cursorBlink = false;
        x.write("\x1b[?25l");
        x.blur();
      };
      channel = channelRef.current = socket.attach(terminalId, x.cols, x.rows, {
        attached: (terminal, resumed) => {
          // Back after a moment away: what was missed is old news too, up
          // to `replayed`.
          resuming = resumed;
          if (resumed) {
            replaying = true;
            ready.current = false;
          }
          events.current.attached(terminal);
        },
        reset: () => {
          x.reset();
          pending = 0;
          replaying = true;
          resuming = false;
          ready.current = false;
        },
        replayed: () => {
          x.write(new Uint8Array(0), () => {
            replaying = false;
            ready.current = true;
            pasteWaiting.current();
          });
          if (redrawAfter) {
            redrawAfter = false;
            channel?.replay();
          }
        },
        output: (data) => {
          pending += data.length;
          if (pending > HIGH) channel?.pause();
          x.write(data, () => {
            pending -= data.length;
            if (pending < LOW) channel?.resume();
          });
        },
        marker: (event) => {
          if (event.t === "C") {
            lastCommand.current = { command: event.command, startedAt: event.at };
          } else if (event.t === "P" && lastCommand.current) {
            const durationSec = Math.max(0, Math.round((event.at - lastCommand.current.startedAt) / 1000));
            notifyCommandCompleted({
              command: lastCommand.current.command,
              exitCode: event.code,
              durationSec,
              terminalId: props.terminalId,
              inAppNotify: props.notify,
            });
            lastCommand.current = null;
          }
          events.current.marker(event);
        },
        state: (terminal) => {
          events.current.state(terminal);
          if (terminal.state === "ended") stop();
        },
        gone: (terminal) => {
          stop();
          events.current.gone(terminal);
        },
        locked: () => events.current.locked?.(),
        // A command of it redacted in the log (0.1.20): the screen is drawn
        // again from what the core kept, which no longer has it. A redaction
        // in a replay from a clean screen is old news, that screen has it
        // no more; one in a catching up after a moment away was not seen.
        redacted: () => {
          if (!replaying) channel?.replay();
          else if (resuming) redrawAfter = true;
        },
      });
      x.onData((data) => {
        if (!replaying) channel?.input(data);
      });
      x.onBinary((data) => {
        if (!replaying) channel?.inputBinary(data);
      });
      // The page clicked into last is the one that types (see Watcher in
      // tterm/core/terminals.py).
      x.textarea?.addEventListener("focus", () => channel?.focus());
      x.onResize(({ cols, rows }) => channel?.resize(cols, rows));
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!disposed) fit.fit();
        });
      });
      observer.observe(element);
      cleanups.push(keepKeys(() => disposed || ended.current || !active.current
        ? null : {
        element: x.textarea ?? null,
        type: (data) => x.input(data),
      }));
      if (active.current && !typingElsewhere(element)) x.focus();
    };
    void start();

    return () => {
      disposed = true;
      ready.current = false;
      for (const cleanup of cleanups) cleanup();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      channel?.detach();
      channelRef.current = null;
      xterm?.dispose();
      term.current = null;
    };
  }, [terminalId]);

  // A command from search goes in as a paste: the shell takes it as text,
  // and Enter is still to be pressed. Lines of it without bracketed paste
  // would each run, so then it stays out. A terminal just opened for it
  // takes it once its history is drawn.
  pasteWaiting.current = () => {
    const x = term.current;
    const p = waiting.current;
    if (!x || !p || !ready.current) return;
    waiting.current = null;
    if (p.text.includes("\n") && !x.modes.bracketedPasteMode) {
      props.notify?.(t("classic.several_lines"));
      return;
    }
    x.paste(p.text);
    x.focus();
  };
  useEffect(() => {
    const p = props.paste;
    if (!p || props.ended || !takePaste(p.n)) return;
    waiting.current = p;
    pasteWaiting.current();
  });

  // The theme follows the page's.
  useEffect(() => {
    if (term.current) term.current.options.theme = terminalTheme(shownTheme);
  }, [shownTheme]);

  // Its tab brought to the front: the keys come here. Sent behind: it no
  // longer claims them.
  useEffect(() => {
    if (!props.active) channelRef.current?.unfocus();
    if (props.active && !props.ended) term.current?.focus();
  }, [props.active, props.ended, props.refocus]);

  return (
    <div className="terminal-box classic-box" ref={box}
      onMouseDown={() => {
        if (!ended.current) term.current?.focus();
      }} />
  );
}
