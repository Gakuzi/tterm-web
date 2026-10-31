// A note's blocks, written in place. Markdown at the start of a block turns
// it into what it means as it is typed (# heading, - list, [ ] checklist,
// ``` code, --- divider), and "/" offers the same from a list. Enter starts
// a new block, Backspace at the start joins it to the one before; the arrows
// go from block to block. Text pasted with several lines becomes blocks.
// A checklist item is ticked at once, for everyone, with who and when.

import {
  memo, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type ClipboardEvent, type KeyboardEvent,
} from "react";
import type { Block, BlockType, Who } from "./api";
import { toClipboard, useBriefly } from "./briefly";
import { t as say, useT, type Translate } from "./i18n";
import {
  Bullet, Check, CodeIcon, Heading, ListCheck, Minus, Paragraph,
} from "./icons";
import { block, cleanText, multiline, parseMarkdown, shortcut } from "./noteText";
import { stamp } from "./time";

/** Where the caret goes in a block: an offset, its start or its end. */
type Spot = number | "start" | "end";

const LABELS: Record<BlockType, string> = {
  p: "note_editor.text", h: "note_editor.heading", li: "note_editor.list_item",
  todo: "note_editor.checklist_item", code: "note_editor.code", hr: "note_editor.divider",
};

interface Choice {
  type: BlockType;
  label: string;
  /** The Markdown that does the same. */
  md: string;
  icon: React.ReactNode;
}

const CHOICES: Choice[] = [
  { type: "todo", label: "note_editor.checklist", md: "[ ]", icon: <ListCheck size={15} /> },
  { type: "h", label: "note_editor.heading", md: "#", icon: <Heading size={15} /> },
  { type: "li", label: "note_editor.list", md: "-", icon: <Bullet size={15} /> },
  { type: "code", label: "note_editor.code", md: "```", icon: <CodeIcon size={15} /> },
  { type: "hr", label: "note_editor.divider", md: "---", icon: <Minus size={15} /> },
  { type: "p", label: "note_editor.text", md: "", icon: <Paragraph size={15} /> },
];

function choicesFor(text: string, t: Translate): Choice[] {
  const query = text.slice(1).toLowerCase();
  return CHOICES.filter((c) => t(c.label).toLowerCase().startsWith(query) ||
    (query.length > 1 && t(c.label).toLowerCase().includes(query)));
}

/** "Denis · 10:02" for today, "Denis · 12 Oct" before. */
function tickedBy(b: Block, people: Record<string, Who>, meId: string,
  t: Translate): string {
  if (!b.done || !b.by) return "";
  const who = b.by === meId ? t("note_editor.you")
    : people[b.by]?.firstName ?? t("note_editor.someone");
  return b.at ? `${who} · ${stamp(b.at, t)}` : who;
}

/** Whether the textarea shows one line only, so that an arrow leaves it. */
function oneRow(area: HTMLTextAreaElement): boolean {
  const line = parseFloat(getComputedStyle(area).lineHeight) || 24;
  return area.scrollHeight <= line * 1.6;
}

/** A textarea as tall as its text. */
export function fit(area: HTMLTextAreaElement | null): void {
  if (!area) return;
  area.style.height = "0px";
  area.style.height = `${area.scrollHeight}px`;
}

interface RowProps {
  b: Block;
  lonely: boolean;
  readOnly: boolean;
  who: string;
  register: (id: string, node: HTMLElement | null) => void;
  onText: (id: string, text: string) => void;
  onKey: (id: string, event: KeyboardEvent<HTMLElement>) => void;
  onPaste: (id: string, event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onTick: (id: string, done: boolean) => void;
  /** Whether the browser let the page copy. */
  onCopy: (text: string) => Promise<boolean>;
}

const Row = memo(function Row(props: RowProps) {
  const { b } = props;
  const t = useT();
  const area = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => fit(area.current), [b.text, b.type]);
  // Copied, with a check, for a moment after Copy on code (0.1.13).
  const [copied, showCopied] = useBriefly<true>();

  if (b.type === "hr") {
    return (
      <div className="nb-hr" tabIndex={props.readOnly ? -1 : 0} role="separator"
        aria-label={t("note_editor.divider")} ref={(node) => props.register(b.id, node)}
        onKeyDown={(e) => props.onKey(b.id, e)}>
        <hr />
      </div>
    );
  }
  const text = (
    <textarea
      ref={(node) => {
        area.current = node;
        props.register(b.id, node);
      }}
      className={`nb-text nb-${b.type}${props.lonely ? " lonely" : ""}`}
      value={b.text} rows={1} readOnly={props.readOnly}
      spellCheck={b.type !== "code"} aria-label={t(LABELS[b.type])}
      placeholder={props.lonely
        ? t("note_editor.start_writing")
        : b.type === "p" ? t("note_editor.type_slash") : t(LABELS[b.type])}
      onChange={(e) => props.onText(b.id, e.target.value)}
      onKeyDown={(e) => props.onKey(b.id, e)}
      onPaste={(e) => props.onPaste(b.id, e)} />
  );
  if (b.type === "todo") {
    return (
      <div className={b.done ? "nb-row nb-todo-row done" : "nb-row nb-todo-row"}>
        <button type="button" role="checkbox" aria-checked={!!b.done}
          aria-label={b.done ? t("note_editor.untick") : t("note_editor.tick")}
          className="nb-check" disabled={props.readOnly}
          onClick={() => props.onTick(b.id, !b.done)}>
          {b.done && <Check size={12} />}
        </button>
        {text}
        {props.who && <span className="nb-who">{props.who}</span>}
      </div>
    );
  }
  if (b.type === "li") {
    return (
      <div className="nb-row nb-li-row">
        <span className="nb-bullet" aria-hidden="true" />
        {text}
      </div>
    );
  }
  if (b.type === "code") {
    return (
      <div className="nb-code-row">
        {text}
        <button type="button" className="nb-copy"
          onClick={() => void props.onCopy(b.text).then((ok) => ok && showCopied(true))}>
          {copied && <Check size={13} className="pressed-mark" />}
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
    );
  }
  return <div className="nb-row">{text}</div>;
});

interface Props {
  blocks: Block[];
  /** A change to the blocks, always made from the latest ones. */
  onChange: (change: (blocks: Block[]) => Block[]) => void;
  onTick: (id: string, done: boolean) => void;
  people: Record<string, Who>;
  meId: string;
  readOnly: boolean;
  /** Grows by one to put the caret at the start of the first block. */
  focusFirst: number;
  /** The arrow up from the first block: back to the title. */
  onLeaveTop: () => void;
  notify: (text: string) => void;
  /** The block search opened (0.1.7), marked until the note is written in. */
  found: string | null;
}

export function NoteEditor(props: Props) {
  const { onChange: change, readOnly } = props;
  const t = useT();
  const nodes = useRef(new Map<string, HTMLElement>());
  const want = useRef<{ id: string; at: Spot } | null>(null);
  const blocksRef = useRef(props.blocks);
  blocksRef.current = props.blocks;
  const [slash, setSlash] = useState<{ id: string; at: number } | null>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const leaveTop = useRef(props.onLeaveTop);
  leaveTop.current = props.onLeaveTop;
  const notify = useRef(props.notify);
  notify.current = props.notify;

  const register = useCallback((id: string, node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  /** The caret into a block that is on the page now. */
  const place = useCallback((id: string, at: Spot): boolean => {
    const node = nodes.current.get(id);
    if (!node) return false;
    node.focus();
    if (node instanceof HTMLTextAreaElement) {
      const end = node.value.length;
      const offset = at === "start" ? 0 : at === "end" ? end : Math.min(at, end);
      node.setSelectionRange(offset, offset);
    }
    return true;
  }, []);

  /** Puts the caret where it was asked for, once the blocks are drawn. */
  useLayoutEffect(() => {
    const target = want.current;
    if (target && place(target.id, target.at)) want.current = null;
  });

  // A wider or narrower window wraps the text again.
  useEffect(() => {
    const again = () => nodes.current.forEach((node) => {
      if (node instanceof HTMLTextAreaElement) fit(node);
    });
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, []);

  const goTo = useCallback((id: string, at: Spot) => {
    if (!place(id, at)) want.current = { id, at };
  }, [place]);

  // The title asks for the first block.
  useEffect(() => {
    if (!props.focusFirst) return;
    const first = blocksRef.current[0];
    if (first) goTo(first.id, "start");
  }, [props.focusFirst, goTo]);

  const setBlock = useCallback((id: string, patch: Partial<Block>) => {
    change((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, [change]);

  const onText = useCallback((id: string, raw: string) => {
    const current = blocksRef.current.find((b) => b.id === id);
    if (!current) return;
    // Tidied as the core will keep it, so that a save changes nothing here.
    const text = cleanText(current.type, raw);
    const made = shortcut(current.type, text);
    if (made?.type === "hr") {
      const next = block("p");
      change((bs) => {
        const i = bs.findIndex((b) => b.id === id);
        if (i < 0) return bs;
        const copy = bs.slice();
        copy.splice(i, 1, { id, type: "hr", text: "" }, next);
        return copy;
      });
      want.current = { id: next.id, at: "start" };
      setSlash(null);
      return;
    }
    if (made) {
      const replaced: Block = { id, type: made.type, text: made.text };
      if (made.type === "todo") replaced.done = !!made.done;
      change((bs) => bs.map((b) => (b.id === id ? replaced : b)));
      want.current = { id, at: "end" };
      setSlash(null);
      return;
    }
    setBlock(id, { text });
    if (current.type === "p" && /^\/[^\s/]*$/.test(text) &&
      choicesFor(text, say).length) {
      setSlash((was) => (was?.id === id ? was : { id, at: 0 }));
    } else if (slashRef.current?.id === id) {
      setSlash(null);
    }
  }, [change, setBlock]);

  /** The block turned into another kind from the "/" list. */
  const choose = useCallback((id: string, type: BlockType) => {
    setSlash(null);
    if (type === "hr") {
      const next = block("p");
      change((bs) => {
        const i = bs.findIndex((b) => b.id === id);
        if (i < 0) return bs;
        const copy = bs.slice();
        copy.splice(i, 1, { id, type: "hr", text: "" }, next);
        return copy;
      });
      want.current = { id: next.id, at: "start" };
      return;
    }
    const replaced: Block = { id, type, text: "" };
    if (type === "todo") replaced.done = false;
    change((bs) => bs.map((b) => (b.id === id ? replaced : b)));
    want.current = { id, at: "start" };
  }, [change]);

  const insertAt = useCallback((at: number, added: Block[], focus: Spot,
    focusOn?: string) => {
    change((bs) => {
      const copy = bs.slice();
      copy.splice(at, 0, ...added);
      return copy;
    });
    want.current = { id: focusOn ?? added[added.length - 1].id, at: focus };
  }, [change]);

  const onKey = useCallback((id: string, event: KeyboardEvent<HTMLElement>) => {
    if (readOnly) return;
    const native = event.nativeEvent;
    if (native.isComposing || native.keyCode === 229) return;
    const bs = blocksRef.current;
    const i = bs.findIndex((b) => b.id === id);
    if (i < 0) return;
    const b = bs[i];
    const prev = bs[i - 1];
    const next = bs[i + 1];

    // The divider: removed with Backspace or Delete, left with the arrows.
    if (b.type === "hr") {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        change((all) => all.filter((x) => x.id !== id));
        const near = event.key === "Backspace" ? prev ?? next : next ?? prev;
        if (near) want.current = { id: near.id, at: event.key === "Backspace" ? "end" : "start" };
      } else if (event.key === "Enter") {
        event.preventDefault();
        insertAt(i + 1, [block("p")], "start");
      } else if (event.key === "ArrowUp" && prev) {
        event.preventDefault();
        goTo(prev.id, "end");
      } else if (event.key === "ArrowUp" && !prev) {
        event.preventDefault();
        leaveTop.current();
      } else if (event.key === "ArrowDown" && next) {
        event.preventDefault();
        goTo(next.id, "start");
      }
      return;
    }

    const area = event.currentTarget as HTMLTextAreaElement;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const collapsed = start === end;
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;

    // The "/" list: the arrows pick, Enter or Tab takes, Esc leaves it.
    const open = slashRef.current;
    if (open?.id === id) {
      const choices = choicesFor(b.text, say);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSlash({ id, at: (open.at + step + choices.length) % choices.length });
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && choices.length) {
        event.preventDefault();
        choose(id, choices[Math.min(open.at, choices.length - 1)].type);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSlash(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.altKey) {
      if (b.type === "code") {
        // A new line in code; Cmd or Ctrl with Enter leaves it.
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          insertAt(i + 1, [block("p")], "start");
        }
        return;
      }
      if (event.shiftKey && multiline(b.type)) return;
      event.preventDefault();
      if ((b.type === "li" || b.type === "todo") && !b.text) {
        // Enter on an empty item ends the list.
        const replaced: Block = { id, type: "p", text: "" };
        change((all) => all.map((x) => (x.id === id ? replaced : x)));
        want.current = { id, at: "start" };
        return;
      }
      if (collapsed && start === 0 && b.text) {
        // At the very start: a new empty block above, the caret stays.
        insertAt(i, [block("p")], "start", id);
        return;
      }
      const before = b.text.slice(0, start);
      const after = b.text.slice(end);
      const kind: BlockType = b.type === "li" || b.type === "todo" ? b.type : "p";
      const added = block(kind, after);
      change((all) => {
        const at = all.findIndex((x) => x.id === id);
        if (at < 0) return all;
        const copy = all.slice();
        copy.splice(at, 1, { ...all[at], text: before }, added);
        return copy;
      });
      want.current = { id: added.id, at: "start" };
      return;
    }

    if (event.key === "Backspace" && collapsed && start === 0 && plain) {
      if (b.type !== "p") {
        // Back to plain text first, then joined on the next Backspace.
        event.preventDefault();
        const replaced: Block = { id, type: "p", text: b.text };
        change((all) => all.map((x) => (x.id === id ? replaced : x)));
        want.current = { id, at: "start" };
        return;
      }
      if (!prev) return;
      event.preventDefault();
      if (prev.type === "hr") {
        change((all) => all.filter((x) => x.id !== prev.id));
        want.current = { id, at: "start" };
        return;
      }
      const joint = prev.text.length;
      const text = prev.text + (multiline(prev.type) ? b.text : b.text.replace(/\n/g, " "));
      change((all) => all.filter((x) => x.id !== id)
        .map((x) => (x.id === prev.id ? { ...x, text } : x)));
      want.current = { id: prev.id, at: joint };
      return;
    }

    if (event.key === "Delete" && collapsed && end === b.text.length && plain) {
      if (!next) return;
      event.preventDefault();
      if (next.type === "hr") {
        change((all) => all.filter((x) => x.id !== next.id));
        want.current = { id, at: end };
        return;
      }
      const text = b.text + (multiline(b.type) ? next.text : next.text.replace(/\n/g, " "));
      change((all) => all.filter((x) => x.id !== next.id)
        .map((x) => (x.id === id ? { ...x, text } : x)));
      want.current = { id, at: end };
      return;
    }

    if (event.key === "ArrowUp" && collapsed && !event.shiftKey && plain) {
      const first = !b.text.slice(0, start).includes("\n");
      if (first && (start === 0 || oneRow(area))) {
        event.preventDefault();
        if (prev) goTo(prev.id, "end");
        else leaveTop.current();
      }
      return;
    }
    if (event.key === "ArrowDown" && collapsed && !event.shiftKey && plain) {
      const last = !b.text.slice(end).includes("\n");
      if (last && next && (end === b.text.length || oneRow(area))) {
        event.preventDefault();
        goTo(next.id, "start");
      }
      return;
    }
    if (event.key === "ArrowLeft" && collapsed && start === 0 && prev &&
      !event.shiftKey && plain) {
      event.preventDefault();
      goTo(prev.id, "end");
      return;
    }
    if (event.key === "ArrowRight" && collapsed && end === b.text.length &&
      next && !event.shiftKey && plain) {
      event.preventDefault();
      goTo(next.id, "start");
      return;
    }
    if (event.key === "Tab" && b.type === "code" && !event.shiftKey && plain) {
      // Code takes Tab as two spaces.
      event.preventDefault();
      const text = b.text.slice(0, start) + "  " + b.text.slice(end);
      setBlock(id, { text });
      want.current = { id, at: start + 2 };
    }
  }, [change, choose, goTo, insertAt, readOnly, setBlock]);

  const onPaste = useCallback((id: string,
    event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    const bs = blocksRef.current;
    const i = bs.findIndex((b) => b.id === id);
    const b = bs[i];
    if (!b || b.type === "code") return;
    const pasted = event.clipboardData.getData("text/plain");
    if (!pasted.includes("\n")) return;
    const parsed = parseMarkdown(pasted);
    if (!parsed.length) return;
    event.preventDefault();
    const area = event.currentTarget;
    const before = b.text.slice(0, area.selectionStart);
    const after = b.text.slice(area.selectionEnd);
    change((all) => {
      const at = all.findIndex((x) => x.id === id);
      if (at < 0) return all;
      const copy = all.slice();
      if (before) {
        copy.splice(at, 1, { ...all[at], text: before }, ...parsed,
          ...(after ? [block(b.type === "li" || b.type === "todo" ? b.type : "p", after)] : []));
      } else {
        copy.splice(at, 1, ...parsed, ...(after ? [{ ...all[at], text: after }] : []));
      }
      return copy;
    });
    want.current = { id: parsed[parsed.length - 1].id, at: "end" };
  }, [change, readOnly]);

  const onTick = props.onTick;
  const onCopy = useCallback(async (text: string) => {
    const ok = await toClipboard(text);
    if (!ok) notify.current(say("note_editor.no_copy"));
    return ok;
  }, []);

  const lonely = props.blocks.length === 1 && props.blocks[0].type === "p" &&
    !props.blocks[0].text;
  const open = slash && props.blocks.find((b) => b.id === slash.id);
  const choices = open ? choicesFor(open.text, t) : [];

  return (
    <div className="note-blocks">
      {props.blocks.map((b) => (
        <div key={b.id} className={props.found === b.id ? "nb-wrap found" : "nb-wrap"}
          data-block={b.id}>
          <Row b={b} lonely={lonely} readOnly={readOnly}
            who={b.type === "todo" ? tickedBy(b, props.people, props.meId, t) : ""}
            register={register} onText={onText} onKey={onKey} onPaste={onPaste}
            onTick={onTick} onCopy={onCopy} />
          {open && open.id === b.id && choices.length > 0 && (
            <div className="slash-menu" role="listbox" aria-label={t("note_editor.turn_into")}>
              {choices.map((c, n) => (
                <button key={c.type} type="button" role="option" tabIndex={-1}
                  aria-selected={n === Math.min(slash.at, choices.length - 1)}
                  className="slash-item"
                  // The caret stays in the text: the arrows and Enter there
                  // pick from the list too.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(b.id, c.type)}>
                  {c.icon}
                  <span className="slash-label">{t(c.label)}</span>
                  <span className="slash-md">{c.md}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
