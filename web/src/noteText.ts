// What a note's blocks mean as text: Markdown typed at the start of a block
// turns it into a heading, a list item, a checklist item, code or a divider;
// text pasted with several lines becomes blocks; and a note copies out as
// Markdown. Plus the same merge as the core's (core/notes.py), for what was
// typed while a save was on its way.

import type { Translate } from "./i18n";
import type { Block, BlockType } from "./api";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** An id for a new block, unique enough within one note. */
export function blockId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function block(type: BlockType = "p", text = ""): Block {
  return type === "todo" ? { id: blockId(), type, text, done: false }
    : { id: blockId(), type, text };
}

/** Blocks that keep line breaks; in the others Enter starts a new block. */
export function multiline(type: BlockType): boolean {
  return type === "p" || type === "code";
}

/** Control characters but the tab and the line break, as the core has them
 * (notes.py _CONTROL). */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
/** In a title the tab and line breaks too. */
const TITLE_CONTROL = /[\u0000-\u001f\u007f]/g;

/** A block's text as the core will keep it (notes.clean_blocks): typed text
 * is tidied the same way at once, so that a save comes back as it went and
 * nothing under the caret changes. */
export function cleanText(type: BlockType, text: string): string {
  if (type === "hr") return "";
  const clean = text.replace(/\r\n?/g, "\n").replace(CONTROL, "");
  return multiline(type) ? clean : clean.replace(/\n/g, " ");
}

/** A title as the core keeps it (notes.clean_title): as typed, control
 * characters as spaces. */
export function cleanTitle(title: string): string {
  return title.replace(TITLE_CONTROL, " ");
}

/** A title to show: "Untitled" for one not given yet. */
export function titled(title: string, t: Translate): string {
  return title.trim() || t("note.untitled");
}

/** A block whose start was just typed as Markdown, as what it means, or
 * null when it is plain text. */
export function shortcut(type: BlockType,
  text: string): { type: BlockType; text: string; done?: boolean } | null {
  // A paragraph of several lines that becomes a heading or an item is one
  // line: the breaks become spaces, as the core would make them.
  if (type === "p" || type === "li") {
    const todo = /^(?:[-*+] )?\[( |x|X)?\] /.exec(text);
    if (todo) {
      return { type: "todo", text: cleanText("todo", text.slice(todo[0].length)),
        done: !!todo[1] && todo[1] !== " " };
    }
  }
  if (type !== "p") return null;
  const heading = /^#{1,6} /.exec(text);
  if (heading) return { type: "h", text: cleanText("h", text.slice(heading[0].length)) };
  const item = /^(?:[-*+]|\d{1,3}[.)]) /.exec(text);
  if (item) return { type: "li", text: cleanText("li", text.slice(item[0].length)) };
  if (text.startsWith("```")) {
    // What follows the backticks stays, all of it: typed at the start of a
    // paragraph, its first line is text, not a language.
    return { type: "code", text: text.slice(3) };
  }
  if (/^(?:---|\*\*\*|___)$/.test(text)) return { type: "hr", text: "" };
  return null;
}

/** Text with several lines, as blocks: Markdown where it is Markdown, a
 * paragraph where it is not, and a blank line between paragraphs. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").replace(CONTROL, "").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(block("p", para.join("\n")));
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      out.push(block("code", code.join("\n")));
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const todo = /^\s*(?:[-*+] )?\[( |x|X)?\] (.*)$/.exec(line);
    if (todo) {
      flush();
      out.push({ ...block("todo", todo[2]), done: !!todo[1] && todo[1] !== " " });
      continue;
    }
    const heading = /^#{1,6} (.*)$/.exec(line);
    if (heading) {
      flush();
      out.push(block("h", heading[1]));
      continue;
    }
    const item = /^\s*(?:[-*+]|\d{1,3}[.)]) (.*)$/.exec(line);
    if (item) {
      flush();
      out.push(block("li", item[1]));
      continue;
    }
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      flush();
      out.push(block("hr"));
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

/** The note as Markdown: its title as the top heading. */
export function toMarkdown(title: string, blocks: Block[]): string {
  const parts: string[] = [];
  if (title.trim()) parts.push(`# ${title.trim()}`);
  let previous: BlockType | null = null;
  for (const b of blocks) {
    const list = b.type === "li" || b.type === "todo";
    const line = b.type === "h" ? `## ${b.text}`
      : b.type === "li" ? `- ${b.text}`
      : b.type === "todo" ? `- [${b.done ? "x" : " "}] ${b.text}`
      : b.type === "code" ? "```\n" + b.text + "\n```"
      : b.type === "hr" ? "---"
      : b.text;
    if (list && (previous === "li" || previous === "todo") && parts.length) {
      parts[parts.length - 1] += "\n" + line;
    } else {
      parts.push(line);
    }
    previous = b.type;
  }
  return parts.join("\n\n") + "\n";
}

/** Checklist items and how many are ticked, and the start of the text, as
 * the core counts them (notes.summary). */
export function summary(blocks: Block[]): { total: number; done: number;
  excerpt: string } {
  const todos = blocks.filter((b) => b.type === "todo");
  const first = blocks.find((b) =>
    (b.type === "p" || b.type === "li" || b.type === "code") && b.text.trim());
  return {
    total: todos.length,
    done: todos.filter((b) => b.done).length,
    excerpt: first ? first.text.trim().split("\n")[0].trim().slice(0, 140) : "",
  };
}

function content(b: Block | undefined): string | null {
  return b ? `${b.type}\u0000${b.text}` : null;
}

/** The core's merge (notes.merge): `mine`, made from `base`, with what
 * `theirs` changed since. Where the same thing changed both ways, null; or,
 * when the person chose, the side they chose, the rest merged as always. */
export function merge(baseTitle: string, base: Block[], mineTitle: string,
  mine: Block[], theirsTitle: string, theirs: Block[],
  prefer?: "mine" | "theirs"): { title: string; blocks: Block[] } | null {
  let title: string;
  if (mineTitle === baseTitle || mineTitle === theirsTitle) title = theirsTitle;
  else if (theirsTitle === baseTitle) title = mineTitle;
  else if (prefer) title = prefer === "mine" ? mineTitle : theirsTitle;
  else return null;
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const t = new Map(theirs.map((x) => [x.id, x]));
  const kept = new Map<string, Block>();
  for (const id of new Set([...b.keys(), ...m.keys(), ...t.keys()])) {
    const was = content(b.get(id));
    const mineNow = content(m.get(id));
    const theirsNow = content(t.get(id));
    let mineChanged = mineNow !== was;
    const theirsChanged = theirsNow !== was;
    if (mineChanged && theirsChanged && mineNow !== theirsNow) {
      if (!prefer) return null;
      // The side chosen wins here, a deletion included.
      mineChanged = prefer === "mine";
    }
    if (mineChanged) {
      if (mineNow !== null) {
        // Mine, with the tick as theirs has it: ticks are the core's.
        const theirsBlock = t.get(id);
        const mineBlock = m.get(id)!;
        kept.set(id, theirsBlock && theirsBlock.type === "todo" && mineBlock.type === "todo"
          ? { ...mineBlock, done: theirsBlock.done, by: theirsBlock.by, at: theirsBlock.at }
          : mineBlock);
      }
    } else if (theirsNow !== null) {
      kept.set(id, t.get(id)!);
    }
  }
  const order = theirs.map((x) => x.id).filter((id) => kept.has(id));
  const placed = new Set(order);
  mine.forEach((x, i) => {
    if (!kept.has(x.id) || placed.has(x.id)) return;
    let before = i - 1;
    while (before >= 0 && !placed.has(mine[before].id)) before--;
    const at = before >= 0 ? order.indexOf(mine[before].id) + 1 : 0;
    order.splice(at, 0, x.id);
    placed.add(x.id);
  });
  return { title, blocks: order.map((id) => kept.get(id)!) };
}

export function sameBlocks(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.type !== y.type || x.text !== y.text ||
      !!x.done !== !!y.done) return false;
  }
  return true;
}
