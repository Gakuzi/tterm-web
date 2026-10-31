// Search over everything (0.1.7), as approved on the canvas of 23.10 and
// 24.10: Cmd+K, or Search on the right of the tabs. One field for the
// commands of every terminal of yours, ended ones too, what they printed,
// notes, whole, terminals, machines, projects and what there is to do.
//
// The commands, their output and the notes come from the core (/api/search),
// the rest the page has. Buttons above the list keep to one kind, and so
// does a word in front: c: o: n: t: m: p: and >. Nothing typed: what was
// open last, the commands run most on the machine in front, and a few
// things to do. On the right, what the chosen line is: where a command ran,
// how it ended, the lines of its output with the words in them.
//
// Enter opens it: a command in its terminal, at its block, marked; a note
// at the block with the words. Cmd+Enter puts a command into the line of the
// terminal in front, without running it (the owner, 24.10: "Так и оставь").

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { searchAll, type Found, type FoundBlock, type FoundNote } from "./api";
import { shortPath } from "./BlockView";
import { useT, type Translate } from "./i18n";
import { Doc, ListCheck, Output, Search as SearchIcon } from "./icons";
import { marked } from "./marks";
import { titled } from "./noteText";
import { MAC } from "./tabs";
import { when } from "./time";

export type SearchKind =
  | "commands" | "output" | "notes" | "terminals" | "machines" | "projects"
  | "actions";
type Filter = "all" | SearchKind;

const KINDS: SearchKind[] = ["commands", "output", "notes", "terminals",
  "machines", "projects", "actions"];
const TITLES: Record<SearchKind, string> = {
  commands: "search.kind_commands", output: "search.kind_output",
  notes: "search.kind_notes", terminals: "search.kind_terminals",
  machines: "search.kind_machines", projects: "search.kind_projects",
  actions: "search.kind_actions",
};
const LABELS: Record<SearchKind, string> = {
  commands: "search.label_command", output: "search.label_output",
  notes: "search.label_note", terminals: "search.label_terminal",
  machines: "search.label_machine", projects: "search.label_project",
  actions: "search.label_action",
};
const NOTHING_IN: Record<SearchKind, string> = {
  commands: "search.nothing_in_commands", output: "search.nothing_in_output",
  notes: "search.nothing_in_notes", terminals: "search.nothing_in_terminals",
  machines: "search.nothing_in_machines", projects: "search.nothing_in_projects",
  actions: "search.nothing_in_actions",
};
/** A word in front keeps to one kind. */
const PREFIXES: [string, SearchKind][] = [["c:", "commands"], ["o:", "output"],
  ["n:", "notes"], ["t:", "terminals"], ["m:", "machines"], ["p:", "projects"],
  [">", "actions"]];
const FILTERS: Filter[] = ["all", ...KINDS];
/** Of each kind, in All. */
const IN_ALL = 3;
const PASTE_KEYS = MAC ? "⌘ Enter" : "Ctrl+Enter";
/** How long typing may pause before the core is asked. */
const ASK_AFTER_MS = 120;

/** Something the page has itself: a terminal, a note as lists show it, a
 * machine, a project, a thing to do. */
export interface LocalEntry {
  key: string;
  kind: SearchKind;
  title: string;
  sub: string;
  /** More words it is found by. */
  words: string;
  icon: ReactNode;
  /** What the preview lists of it. */
  rows: [string, string][];
  /** What Enter does, and how the preview says it. */
  run: () => void;
  act: string;
  /** A note: its id, so that one the core found too is listed once. */
  noteId?: string;
  /** A terminal on the machine in front, for the order. */
  machineId?: string;
  muted?: boolean;
  /** When it was last touched: the later first among equals. */
  at?: number;
}

interface Props {
  entries: LocalEntry[];
  /** What was open last, the latest first: before anything is typed. */
  recent: LocalEntry[];
  /** The machine of the terminal in front, if one is. */
  near: { id: string; name: string } | null;
  onOpenBlock: (block: FoundBlock, words: string[], inOutput: boolean) => void;
  onPaste: (block: FoundBlock) => void;
  onOpenNote: (note: FoundNote, words: string[]) => void;
  onClose: () => void;
}

interface Line {
  text: string;
  hit: boolean;
  /** A note's checklist item: ☐ or ☑ before it. */
  box?: string;
}

interface Preview {
  label: string;
  title: string;
  mono: boolean;
  dot?: "ok" | "fail" | "none";
  rows: [string, string][];
  lines: Line[];
  acts: { label: string; keys: string; run: () => void; primary: boolean }[];
}

interface Row {
  key: string;
  kind: SearchKind;
  title: string;
  mono: boolean;
  sub: string;
  icon: ReactNode;
  score: number;
  at: number;
  muted?: boolean;
  preview: () => Preview;
  open: () => void;
  paste?: () => void;
}

interface Group {
  kind: SearchKind | "recent" | "here" | "todo";
  title: string;
  rows: Row[];
  /** In All: how many there are of this kind, when more than shown. */
  more?: string;
  goMore?: SearchKind;
}

/** The kind the query keeps to, and what is left to look for. */
function parse(raw: string, chosen: Filter): { filter: Filter; text: string } {
  const start = raw.trimStart();
  const low = start.toLowerCase();
  for (const [prefix, kind] of PREFIXES) {
    if (low.startsWith(prefix)) return { filter: kind, text: start.slice(prefix.length).trim() };
  }
  return { filter: chosen, text: raw.trim() };
}

function wordsOf(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/\s+/).filter(Boolean))];
}

/** 3: the title starts with it; 2: every word in the title; 1: in what
 * goes with it; 0.5: the letters in order, in a name only. A name such as
 * P/vm starts with vm too, after its project's code. */
function score(title: string, extra: string, words: string[], fuzzy: boolean): number {
  if (!words.length) return 0;
  const t = title.toLowerCase();
  const all = `${t} ${extra.toLowerCase()}`;
  if (words.every((w) => all.includes(w))) {
    const starts = t.startsWith(words[0]) ||
      (fuzzy && t.slice(t.indexOf("/") + 1).startsWith(words[0]));
    return starts ? 3 : words.every((w) => t.includes(w)) ? 2 : 1;
  }
  if (fuzzy && words.length === 1 && words[0].length >= 4) {
    let i = 0;
    for (const ch of t) {
      if (ch === words[0][i]) i += 1;
      if (i === words[0].length) return 0.5;
    }
  }
  return 0;
}

function status(b: FoundBlock, t: Translate): string {
  return b.exitCode === null ? t("search.stopped")
    : t("search.exit", { code: String(b.exitCode) });
}

function dotOf(b: FoundBlock): "ok" | "fail" | "none" {
  return b.exitCode === 0 ? "ok" : b.exitCode === null ? "none" : "fail";
}

function Dot({ kind }: { kind: "ok" | "fail" | "none" }) {
  return <span className={`sr-dot ${kind}`} aria-hidden="true" />;
}

const EMPTY: Found = { words: [], commands: [], output: [], notes: [], recent: [],
  more: {} };

const kbd = (inner: ReactNode) => <kbd>{inner}</kbd>;
const code = (inner: ReactNode) => <code>{inner}</code>;

export function Search(props: Props) {
  const t = useT();
  const [raw, setRaw] = useState("");
  const [chosen, setChosen] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [found, setFound] = useState<Found>(EMPTY);
  const [asking, setAsking] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const asked = useRef(0);
  const { filter, text } = parse(raw, chosen);
  const words = useMemo(() => wordsOf(text), [text]);
  const near = props.near;

  // The core, for commands, their output and notes: a moment after typing
  // pauses. An answer overtaken by a later question is dropped.
  useEffect(() => {
    const n = ++asked.current;
    const controller = new AbortController();
    setAsking(true);
    const timer = window.setTimeout(() => {
      searchAll(text, near?.id ?? null, controller.signal)
        .then((answer) => {
          if (n === asked.current) setFound(answer);
        })
        .catch(() => {
          // No answer (no connection, or the app before signing in): what
          // the page has itself is still found.
          if (n === asked.current && !controller.signal.aborted) setFound(EMPTY);
        })
        .finally(() => {
          if (n === asked.current) setAsking(false);
        });
    }, text ? ASK_AFTER_MS : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, near?.id]);

  useEffect(() => setSelected(0), [text, filter]);

  // Esc closes it with the keys outside the field too: after text was
  // selected in the preview, say. In the field, its own handler does it.
  const closeNow = useRef(props.onClose);
  closeNow.current = props.onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented ||
          document.activeElement === field.current) return;
      event.preventDefault();
      closeNow.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The core's answer, while it is for other words (typing on), narrowed to
  // these here: typing more never needs what it had not found.
  const fresh = found.words.join(" ") === words.join(" ");
  const stale = (x: string) => fresh || words.every((w) => x.toLowerCase().includes(w));

  const close = props.onClose;
  const blockRows = (blocks: FoundBlock[], kind: "commands" | "output"): Row[] =>
    blocks.filter((b) => stale(kind === "output" ? `${b.line ?? ""}\n${b.lines.join("\n")}` : b.command))
      .map((b): Row => {
        const where = `${b.code}/${b.machine}`;
        const place = shortPath(b.cwd, b.home);
        const sub = kind === "commands"
          ? [where, place, b.branch, status(b, t), when(b.startedAt, t),
            (b.runs ?? 1) > 1 ? t("search.runs", { n: b.runs ?? 1 }) : ""]
            .filter(Boolean).join(" · ")
          : [t("search.in_command", { command: b.command }), where,
            when(b.startedAt, t)].filter(Boolean).join(" · ");
        const near_ = near && b.machineId === near.id ? 0.25 : 0;
        const open = () => {
          close();
          props.onOpenBlock(b, words, kind === "output");
        };
        const paste = () => {
          close();
          props.onPaste(b);
        };
        return {
          key: `${kind}:${b.terminalId}:${b.seq}`, kind,
          title: kind === "commands" ? b.command : b.line ?? "",
          mono: true, sub,
          icon: kind === "commands" ? <Dot kind={dotOf(b)} /> : <Output size={15} />,
          score: (kind === "commands" ? Math.max(1, score(b.command, sub, words, false)) : 2) + near_,
          at: b.startedAt ?? 0,
          open, paste,
          preview: () => ({
            label: t(LABELS[kind]), title: b.command, mono: true, dot: dotOf(b),
            rows: ([
              [t("search.row_machine"), b.removed
                ? t("search.machine_removed", { machine: where }) : where],
              [t("search.row_folder"), place], [t("search.row_branch"), b.branch],
              [t("search.row_status"), status(b, t)],
              [t("search.row_when"), when(b.startedAt, t)],
              [t("search.row_terminal"), b.ended ? t("search.terminal_ended",
                { terminal: b.terminal, when: when(b.endedAt, t) }) : b.terminal],
            ] as [string, string][]).filter((r) => r[1]),
            lines: b.lines.map((l, i) => ({ text: l, hit: i === b.hit })),
            acts: [{ label: t("search.open_in_terminal"), keys: "Enter", run: open,
              primary: true },
              { label: t("search.into_line"), keys: PASTE_KEYS, run: paste, primary: false }],
          }),
        };
      });

  const noteRows = (): Row[] => {
    const rows = found.notes.filter((n) => stale(`${n.title}\n${n.lines.map((l) => l.text).join("\n")}`))
      .map((n): Row => {
        const open = () => {
          close();
          props.onOpenNote(n, words);
        };
        const sub = `${n.project} / ${n.folder}${n.text ? ` · ${n.text}` : ""}`;
        return {
          key: `note:${n.noteId}`, kind: "notes", title: titled(n.title, t), mono: false,
          sub, icon: n.lines.some((l) => l.type === "todo") ? <ListCheck size={15} /> : <Doc size={15} />,
          score: n.inTitle ? (n.title.toLowerCase().startsWith(words[0] ?? "") ? 3 : 2) : 1.5,
          at: n.editedAt ?? 0, open,
          preview: () => ({
            label: t(LABELS.notes), title: titled(n.title, t), mono: false,
            rows: [[t("search.row_in"), `${n.project} / ${n.folder}`],
              [t("search.row_edited"), when(n.editedAt, t)]],
            // The core counts the note's lines as they are, empty ones too.
            lines: n.lines.map((l, i) => ({ l, hit: i === n.hit }))
              .filter(({ l }) => l.text.trim() || l.type === "todo")
              .map(({ l, hit }) => ({
                text: l.text, hit,
                box: l.type === "todo" ? (l.done ? "☑" : "☐") : undefined,
              })),
            acts: [{ label: t("search.open_note"), keys: "Enter", run: open, primary: true }],
          }),
        };
      });
    // Notes as the lists show them, by title and first lines: found even
    // when the core is not there to ask.
    const have = new Set(rows.map((r) => r.key));
    for (const e of props.entries) {
      if (e.kind !== "notes" || have.has(`note:${e.noteId}`)) continue;
      const s = score(e.title, `${e.sub} ${e.words}`, words, true);
      if (s) rows.push(localRow(e, s));
    }
    return rows;
  };

  const localRow = (e: LocalEntry, s: number): Row => {
    const open = () => {
      close();
      e.run();
    };
    return {
      key: e.key, kind: e.kind, title: e.title, mono: false, sub: e.sub, icon: e.icon,
      score: s + (near && e.machineId === near.id ? 0.25 : 0), at: e.at ?? 0,
      muted: e.muted, open,
      preview: () => ({
        label: t(LABELS[e.kind]), title: e.title, mono: false, rows: e.rows, lines: [],
        acts: [{ label: e.act, keys: "Enter", run: open, primary: true }],
      }),
    };
  };

  // Everything found, by kind: a few hundred lines at most, ranked afresh
  // as the page draws.
  const byKind: Record<SearchKind, Row[]> = {
    commands: [], output: [], notes: [], terminals: [], machines: [], projects: [],
    actions: [],
  };
  if (words.length) {
    byKind.commands = blockRows(found.commands, "commands");
    byKind.output = blockRows(found.output, "output");
    byKind.notes = noteRows();
    for (const e of props.entries) {
      if (e.kind === "notes") continue;
      const s = score(e.title, `${e.sub} ${e.words}`, words, true);
      if (s) byKind[e.kind].push(localRow(e, s));
    }
    for (const k of KINDS) byKind[k].sort((a, b) => b.score - a.score || b.at - a.at);
  }
  /** The core found more of this kind than it sent. */
  const moreOf = (k: SearchKind) =>
    fresh && !!(found.more as Record<string, boolean | undefined>)[k];

  // The groups as shown.
  const groups: Group[] = [];
  if (!words.length) {
    if (filter === "all") {
      groups.push({ kind: "recent", title: t("search.recent"),
        rows: props.recent.slice(0, 4).map((e) => localRow(e, 1)) });
      if (near) {
        groups.push({ kind: "here", title: t("search.yours_on", { machine: near.name }),
          rows: blockRows(found.recent, "commands").slice(0, IN_ALL) });
      }
      groups.push({ kind: "todo", title: t("search.kind_actions"),
        rows: props.entries.filter((e) => e.kind === "actions").slice(0, 3)
          .map((e) => localRow(e, 1)) });
    } else if (filter === "commands" && near) {
      groups.push({ kind: "here", title: t("search.yours_on", { machine: near.name }),
        rows: blockRows(found.recent, "commands") });
    } else if (filter !== "commands" && filter !== "output" && filter !== "notes") {
      groups.push({ kind: filter, title: t(TITLES[filter]),
        rows: props.entries.filter((e) => e.kind === filter).map((e) => localRow(e, 1)) });
    }
  } else if (filter === "all") {
    const best = (k: SearchKind) => byKind[k][0]?.score ?? 0;
    const order = KINDS.map((k, i) => [k, i] as const)
      .sort((a, b) => best(b[0]) - best(a[0]) || a[1] - b[1]).map((x) => x[0]);
    for (const k of order) {
      const rows = byKind[k];
      if (!rows.length) continue;
      groups.push({ kind: k, title: t(TITLES[k]), rows: rows.slice(0, IN_ALL),
        more: rows.length > IN_ALL ? (moreOf(k) ? t("search.all_more", { n: rows.length })
          : t("search.all", { n: rows.length })) : undefined,
        goMore: k });
    }
  } else {
    groups.push({ kind: filter, title: t(TITLES[filter]), rows: byKind[filter] });
  }
  const shown = groups.filter((g) => g.rows.length);
  const flat = shown.flatMap((g) => g.rows);
  const at = Math.min(selected, Math.max(0, flat.length - 1));
  const current = flat[at] ?? null;
  const preview = current ? current.preview() : null;

  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[aria-selected='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [at, flat.length]);

  const pick = (next: Filter) => {
    setChosen(next);
    // A word in front gives way to the button.
    if (parse(raw, "all").filter !== "all") setRaw(text);
    field.current?.focus();
  };

  const key = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected(flat.length ? (at + 1) % flat.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(flat.length ? (at - 1 + flat.length) % flat.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!current) return;
      if ((event.metaKey || event.ctrlKey) && current.paste) current.paste();
      else current.open();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
      const i = FILTERS.indexOf(filter);
      pick(FILTERS[(i + (event.shiftKey ? FILTERS.length - 1 : 1)) % FILTERS.length]);
    }
  };

  const counts: Partial<Record<SearchKind, string>> = {};
  if (words.length) {
    for (const k of KINDS) {
      const n = byKind[k].length;
      if (n) counts[k] = `${n}${moreOf(k) ? "+" : ""}`;
    }
  }

  let n = -1;
  return (
    <div className="palette-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <section className="search-palette" role="dialog" aria-label={t("search.label")}
        onKeyDown={key}
        onClick={(event) => {
          // A click on the preview or between the lines: the keys back in
          // the field, unless text was selected there to copy.
          if (!(event.target as Element).closest("button, input, a") &&
              !window.getSelection()?.toString()) field.current?.focus();
        }}>
        <label className="sr-field">
          <SearchIcon size={18} />
          <input ref={field} autoFocus value={raw} spellCheck={false}
            autoComplete="off" aria-label={t("search.label")} aria-controls="sr-list"
            placeholder={t("search.placeholder")}
            onChange={(event) => setRaw(event.target.value)} />
          {asking && words.length > 0 && <span className="spinner" aria-hidden="true" />}
          <button type="button" className="sr-esc" onClick={props.onClose}
            aria-label={t("common.close")} title={t("search.close_title")}>
            <kbd>Esc</kbd>
          </button>
        </label>
        <div className="sr-filters" role="group" aria-label={t("search.filters")}>
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f}
              className={`sr-chip${filter === f ? " on" : ""}${words.length && f !== "all" && !counts[f as SearchKind] && filter !== f ? " none" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(f)}>
              {f === "all" ? t("search.kind_all") : t(TITLES[f])}
              {f !== "all" && counts[f] && <span className="sr-count">{counts[f]}</span>}
            </button>
          ))}
        </div>
        <div className="sr-body">
          <div className="sr-list" ref={list} id="sr-list" role="listbox"
            aria-label={t("search.found")}>
            {!words.length && filter === "all" && (
              <p className="sr-note">{t("search.nothing_typed")}</p>
            )}
            {shown.map((g) => (
              <div key={g.kind + g.title} className="sr-group" role="presentation">
                <div className="sr-group-head">
                  <span>{g.title}</span>
                  {g.more && g.goMore && (
                    <button type="button" className="sr-more"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(g.goMore!)}>
                      {g.more}
                    </button>
                  )}
                </div>
                {g.rows.map((row) => {
                  n += 1;
                  const i = n;
                  return (
                    <div key={row.key} role="option" aria-selected={i === at}
                      className={`sr-row${row.muted ? " muted" : ""}`}
                      onMouseMove={() => {
                        if (i !== at) setSelected(i);
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        if ((event.metaKey || event.ctrlKey) && row.paste) row.paste();
                        else row.open();
                      }}>
                      <span className="sr-icon">{row.icon}</span>
                      <span className="sr-text">
                        <span className={row.mono ? "sr-title mono" : "sr-title"}>
                          {marked(row.title, words, "sr-hit")}
                        </span>
                        <span className="sr-sub">{row.sub}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            {words.length > 0 && !flat.length && !asking && (
              <div className="sr-empty">
                <strong>{filter !== "all" ? t(NOTHING_IN[filter], { text })
                  : t("search.nothing_for", { text })}</strong>
                <span>{t("search.looks_in")}</span>
                {filter !== "all" && (
                  <button type="button" className="button-plain small"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick("all")}>
                    {t("search.everything")}
                  </button>
                )}
              </div>
            )}
            {!words.length && (filter === "output" || filter === "notes" ||
              (filter === "commands" && !near)) && (
              <p className="sr-note">{filter === "output" ? t("search.type_output")
                : filter === "notes" ? t("search.type_notes") : t("search.type_commands")}</p>
            )}
          </div>
          <div className="sr-preview" aria-live="polite">
            {preview ? (
              <>
                <span className="sr-kind">{preview.label}</span>
                <div className="sr-preview-title">
                  {preview.dot && <Dot kind={preview.dot} />}
                  {preview.mono ? <code>{marked(preview.title, words, "sr-hit")}</code>
                    : <strong>{marked(preview.title, words, "sr-hit")}</strong>}
                </div>
                {preview.rows.length > 0 && (
                  <dl className="sr-rows">
                    {preview.rows.map(([k, v]) => [
                      <dt key={`k${k}`}>{k}</dt>,
                      <dd key={`v${k}`}>{v}</dd>,
                    ])}
                  </dl>
                )}
                {preview.lines.length > 0 && (
                  <div className="sr-lines">
                    {preview.lines.map((l, i) => (
                      <div key={i} className={l.hit ? "sr-line hit" : "sr-line"}>
                        {l.box && <span className="sr-box">{l.box} </span>}
                        {marked(l.text, words, "found-mark")}
                      </div>
                    ))}
                  </div>
                )}
                <div className="sr-acts">
                  {preview.acts.map((a) => (
                    <button key={a.label} type="button"
                      className={a.primary ? "button-accent sr-act" : "button-plain sr-act"}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={a.run}>
                      {a.label}<kbd>{a.keys}</kbd>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="sr-tips">
                <span className="sr-kind">{t("search.tips")}</span>
                <dl className="sr-rows">
                  {/* i18n-ignore */}
                  {([["c: nginx", "search.tip_commands"], ["o: timed out", "search.tip_output"],
                    ["n: rollback", "search.tip_notes"], ["t: deploy", "search.tip_terminals"],
                    ["m: web-01", "search.tip_machines"], ["p: personal", "search.tip_projects"],
                    ["> theme", "search.tip_actions"]] as [string, string][]).map(([k, v]) => [
                    <dt key={`k${k}`}><code>{k}</code></dt>,
                    <dd key={`v${k}`}>{t(v)}</dd>,
                  ])}
                </dl>
                <p className="hint">{t("search.tips_buttons")}</p>
              </div>
            )}
          </div>
        </div>
        <footer className="sr-foot">
          <span className="sr-keys">
            <span>{t.rich("search.keys_move", { kbd })}</span>
            <span>{t.rich("search.keys_open", { kbd })}</span>
            <span>{t.rich("search.keys_paste", { keys: PASTE_KEYS, kbd })}</span>
            <span>{t.rich("search.keys_next", { kbd })}</span>
          </span>
          <span className="sr-prefixes" title={t("search.prefixes_title")}>
            <span>{t.rich("search.prefix_commands", { code })}</span>
            <span>{t.rich("search.prefix_output", { code })}</span>
            <span>{t.rich("search.prefix_notes", { code })}</span>
            <span>{t.rich("search.prefix_actions", { code })}</span>
          </span>
        </footer>
      </section>
    </div>
  );
}
