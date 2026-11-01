// The page's one connection to the core: every terminal on the page goes
// through it, each on a channel of its own. See tterm/api/ws.py for the
// other end and the message format.
//
// The connection may drop: the laptop sleeps, the core restarts, the network
// blinks. The terminals do not care, they live in the core. The socket comes
// back by itself, and each channel asks for what it missed after the last
// number it has, so the screen goes on where it was.
//
// Except when the session ended: the core closes the socket with
// SIGNED_OUT, and it stays closed until the person signs in again.
//
// From 0.1.17 it also carries the vault's messages, which belong to no
// channel (vault.sign, vault.changed, vault.pairing…; src/vault/store.ts):
// while the vault is open in this browser, or a pairing waits, the socket
// is held open even with no terminal on the page, so that the core can ask
// it to sign a login.

import {
  signedOutNow, type Redaction, type RunningCommand, type TerminalInfo,
} from "./api";

const OUTPUT = 1;
const INPUT = 2;
const RETRY_MS = [300, 1000, 2000, 4000, 8000];
/** The close code of a session that ended (tterm/api/ws.py). */
const SIGNED_OUT = 4401;

/** A marker from the shell, as the core passes it on. `at` is the core's
 * clock, in milliseconds. */
export type MarkerEvent =
  | { t: "P"; code: number | null; cwd: string; home: string; branch: string;
      venv: string; trim: number; at: number }
  | { t: "C"; command: string; prev: number | null; at: number };

/** A command held back until the person says yes. */
export interface Confirm {
  command: string;
  what: string;
  lost: string;
  everything: boolean;
}

export interface ChannelHandlers {
  /** The core knows this terminal; `resumed` says whether it went on from
   * the number we had or starts over with a reset. */
  attached: (terminal: TerminalInfo, resumed: boolean) => void;
  /** A clean screen: everything kept follows, up to `replayed`. `seq` is
   * the number the replay goes on from; `running`, the command running as
   * it starts. */
  reset: (seq: number, running: RunningCommand | null) => void;
  /** The replay is over: what comes next is live. */
  replayed: () => void;
  output: (data: Uint8Array, seq: number) => void;
  marker: (event: MarkerEvent, seq: number) => void;
  state: (terminal: TerminalInfo) => void;
  /** The core does not have this terminal (any more). */
  gone: (terminal: TerminalInfo | null) => void;
  /** A command from run() that needs a yes first. */
  confirm?: (ask: Confirm) => void;
  /** A command from run() the shell could not take. */
  refused?: (command: string, reason: string) => void;
  /** A command of the terminal redacted in its machine's log (0.1.20):
   * `block` is the block's number. */
  redacted?: (block: number, redacted: Redaction) => void;
}

export interface Channel {
  /** This page is the one typing into the terminal now. */
  focus: () => void;
  /** Its tab went behind another: coming back from a dropped connection,
   * it does not claim the terminal's keys from wherever it is used now. */
  unfocus: () => void;
  input: (data: string) => void;
  inputBinary: (data: string) => void;
  /** A whole command, typed at the prompt by the core. */
  run: (command: string, confirmed?: boolean) => void;
  resize: (cols: number, rows: number) => void;
  pause: () => void;
  resume: () => void;
  close: () => void;
  detach: () => void;
  /** Everything kept again, from a clean screen: after a command of the
   * terminal was redacted (0.1.20), what the screen showed of it goes. */
  replay: () => void;
}

interface Open {
  id: string;
  handlers: ChannelHandlers;
  lastSeq: number | null;
  cols: number;
  rows: number;
  paused: boolean;
  focused: boolean;
}

type Listener = (connected: boolean) => void;

/** A message of the vault: no channel, an op that starts with "vault.". */
export type VaultMessage = { op: string; [key: string]: unknown };
type VaultListener = (message: VaultMessage) => void;

const encoder = new TextEncoder();

class Socket {
  private ws: WebSocket | null = null;
  private channels = new Map<number, Open>();
  private nextChannel = 1;
  private retry = 0;
  private timer: number | undefined;
  private listeners = new Set<Listener>();
  private vaultListeners = new Set<VaultListener>();
  private openListeners = new Set<() => void>();
  /** Reasons to stay connected with no channel (0.1.17): the vault. */
  private holds = 0;
  private signedOut = false;
  connected = false;

  /** Signed in again: the socket may connect. */
  signedIn(): void {
    this.signedOut = false;
    if (this.wanted()) this.connect();
  }

  private wanted(): boolean {
    return this.channels.size > 0 || this.holds > 0;
  }

  /** Keeps the socket connected, also with no terminal on the page, until
   * the function it gives back is called. */
  hold(): () => void {
    this.holds += 1;
    this.connect();
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.holds -= 1;
    };
  }

  /** The vault's messages, as they come. */
  onVault(listener: VaultListener): () => void {
    this.vaultListeners.add(listener);
    return () => this.vaultListeners.delete(listener);
  }

  /** Called each time the socket connects (again): a new socket on the
   * core's side knows nothing of what the page said on the one before. */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  /** A message of the page's own, outside any channel; dropped while not
   * connected (onOpen says it again). */
  send(message: object): void {
    this.json(message);
  }

  onConnection(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** `after`: the number the page already has everything up to (the feed
   * has the finished blocks from the database); null for everything kept. */
  attach(id: string, cols: number, rows: number,
    handlers: ChannelHandlers, after: number | null = null): Channel {
    const ch = this.nextChannel++;
    const open: Open = { id, handlers, lastSeq: after, cols, rows,
      paused: false, focused: false };
    this.channels.set(ch, open);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendAttach(ch, open);
    } else {
      this.connect();
    }
    return {
      focus: () => {
        open.focused = true;
        this.json({ op: "focus", ch });
      },
      unfocus: () => {
        open.focused = false;
      },
      input: (data) => this.sendInput(ch, encoder.encode(data)),
      inputBinary: (data) => {
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 255;
        this.sendInput(ch, bytes);
      },
      run: (command, confirmed = false) =>
        this.json({ op: "run", ch, command, confirmed }),
      resize: (c, r) => {
        open.cols = c;
        open.rows = r;
        this.json({ op: "resize", ch, cols: c, rows: r });
      },
      pause: () => {
        if (open.paused) return;
        open.paused = true;
        this.json({ op: "pause", ch });
      },
      resume: () => {
        if (!open.paused) return;
        open.paused = false;
        this.json({ op: "resume", ch });
      },
      close: () => this.json({ op: "close", ch }),
      detach: () => {
        this.channels.delete(ch);
        this.json({ op: "detach", ch });
      },
      replay: () => {
        open.lastSeq = null;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.sendAttach(ch, open);
      },
    };
  }

  private connect(): void {
    if (this.ws || this.signedOut) return;
    window.clearTimeout(this.timer);
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${location.host}/api/ws`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setConnected(true);
      for (const [ch, open] of this.channels) {
        open.paused = false;
        this.sendAttach(ch, open);
      }
      for (const listener of [...this.openListeners]) listener();
    };
    ws.onmessage = (event) => this.receive(event.data);
    ws.onclose = (event) => {
      this.ws = null;
      this.setConnected(false);
      if (event.code === SIGNED_OUT) {
        this.signedOut = true;
        signedOutNow();
        return;
      }
      if (!this.wanted()) return;
      const wait = RETRY_MS[Math.min(this.retry, RETRY_MS.length - 1)];
      this.retry += 1;
      this.timer = window.setTimeout(() => this.connect(), wait);
    };
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    for (const listener of this.listeners) listener(value);
  }

  private sendAttach(ch: number, open: Open): void {
    this.json({ op: "attach", ch, id: open.id, after: open.lastSeq,
      cols: open.cols, rows: open.rows,
      focus: open.focused && document.hasFocus() });
  }

  private json(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendInput(ch: number, data: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const frame = new Uint8Array(5 + data.length);
    frame[0] = INPUT;
    new DataView(frame.buffer).setUint32(1, ch);
    frame.set(data, 5);
    this.ws.send(frame);
  }

  private receive(data: ArrayBuffer | string): void {
    if (typeof data !== "string") {
      const view = new DataView(data);
      if (data.byteLength < 13 || view.getUint8(0) !== OUTPUT) return;
      const open = this.channels.get(view.getUint32(1));
      if (!open) return;
      open.lastSeq = Number(view.getBigUint64(5));
      open.handlers.output(new Uint8Array(data, 13), open.lastSeq);
      return;
    }
    let msg: { op: string; ch?: number; [key: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.ch === undefined && typeof msg.op === "string" && msg.op.startsWith("vault.")) {
      for (const listener of [...this.vaultListeners]) listener(msg);
      return;
    }
    const open = msg.ch !== undefined ? this.channels.get(msg.ch) : undefined;
    if (!open) return;
    const h = open.handlers;
    switch (msg.op) {
      case "attached":
        h.attached(msg.terminal as TerminalInfo, Boolean(msg.resumed));
        break;
      case "reset":
        open.lastSeq = msg.seq as number;
        h.reset(msg.seq as number,
          (msg.running as RunningCommand | null | undefined) ?? null);
        break;
      case "replayed":
        h.replayed();
        break;
      case "ev":
        open.lastSeq = msg.seq as number;
        h.marker(msg as unknown as MarkerEvent, msg.seq as number);
        break;
      case "confirm":
        h.confirm?.(msg as unknown as Confirm);
        break;
      case "refused":
        h.refused?.(String(msg.command ?? ""), String(msg.reason ?? ""));
        break;
      case "redacted":
        open.lastSeq = msg.seq as number;
        h.redacted?.(msg.block as number, {
          by: (msg.by as Redaction["by"]) ?? null,
          at: msg.at as number,
          reason: String(msg.reason ?? ""),
        });
        break;
      case "state":
        h.state(msg.terminal as TerminalInfo);
        break;
      case "gone":
        this.channels.delete(msg.ch as number);
        h.gone((msg.terminal as TerminalInfo | null) ?? null);
        break;
    }
  }
}

/** The one socket of this page. */
export const socket = new Socket();
