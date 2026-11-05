// A note in its tab: where it lives, its title, who wrote it, and its
// blocks to write in. Every change is saved a moment after typing stops,
// naming the version it was made from; what others saved meanwhile is
// merged in, and only the same place changed two ways asks whose to keep
// there. While the tab is in front, the page looks again now and then for
// what others wrote. Like terminals, every open note stays on the page
// behind its tab, so that switching keeps the caret and the scroll.
//
// What is typed and not saved yet is kept in this browser as a draft until
// it is (drafts.ts): opening the note again brings it back, merged with
// what was saved since.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { copyToClipboard } from "./clipboard";
import {
  loadNote, moveNote, NoteConflict, NoteGone, refused, saveNote, SignedOut,
  tickNote, type Block, type Me, type Note, type Project, type Who,
} from "./api";
import {
  draftKey, draftsOff, dropDrafts, isDeleted, leftDrafts, writeDraft,
  type Base, type Doc,
} from "./drafts";
import { colorClass } from "./colors";
import { forgetNoteMark, goneThere, useFoundNote, wentThere } from "./found";
import { t as say, useT } from "./i18n";
import { Check, Folder as FolderIcon } from "./icons";
import { MenuButton, NoteMenuItems } from "./Menus";
import { fit, NoteEditor } from "./NoteEditor";
import {
  block, blockId, cleanTitle, merge, summary, titled, toMarkdown,
} from "./noteText";
import { writes } from "./rights";
import { noteTab } from "./tabs";
import { ago, onDay } from "./time";

/** A moment after typing stops, the note is saved. */
const SAVE_MS = 700;
/** After a save that did not get through, the next try. */
const RETRY_MS = 5000;
/** While the note is in front, how often to look for what others wrote. */
const LOOK_MS = 15_000;
/** How soon after typing the draft in this browser follows. */
const DRAFT_MS = 400;

/** How saving goes: "unsaved" is typed and about to be saved, "refused" was
 * turned down (too long, say) until the next change. */
export type SaveState =
  | "loading" | "saved" | "saving" | "unsaved" | "refused" | "offline"
  | "conflict" | "gone";

/** What lists show of a note, as it is being written: from the version
 * `version` of it, with what is typed on top. */
export interface Typed {
  title: string;
  total: number;
  done: number;
  excerpt: string;
  version: number;
}

/** Notes this page made a moment ago: the tab shows them at once instead
 * of asking the core again. */
const primed = new Map<string, Note>();

export function primeNote(note: Note): void {
  primed.set(note.id, note);
}

/** A note with nothing but one empty paragraph has no blocks: the editor
 * keeps that one for the caret. */
function meaningful(blocks: Block[]): Block[] {
  return blocks.length === 1 && blocks[0].type === "p" && !blocks[0].text
    ? [] : blocks;
}

function sameContent(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && x.type === b[i].type &&
    x.text === b[i].text);
}

function sameDoc(a: Doc | null, b: Doc): boolean {
  return !!a && a.title === b.title && sameContent(a.blocks, b.blocks);
}

function sameTicks(a: Block[], b: Block[]): boolean {
  return a.length === b.length && a.every((x, i) =>
    !!x.done === !!b[i].done && (x.by ?? null) === (b[i].by ?? null));
}

function dirty(doc: Doc | null, base: Base | null): boolean {
  if (!doc || !base) return false;
  return doc.title !== base.title ||
    !sameContent(meaningful(doc.blocks), base.blocks);
}

/** For the editor: at least one block to write in, the empty one it has
 * if it has one, so that the caret stays where it is. */
function editable(blocks: Block[], now?: Block[]): Block[] {
  if (blocks.length) return blocks;
  if (now && now.length === 1 && now[0].type === "p" && !now[0].text) return now;
  return [block("p")];
}

function baseOf(n: Note): Base {
  return { version: n.version, title: n.title, blocks: n.blocks };
}

interface Props {
  noteId: string;
  active: boolean;
  me: Me;
  projects: Project[];
  /** Made on this page a moment ago: the caret goes to the title. */
  fresh: boolean;
  /** What lists show of it, as it is typed. */
  onSummary: (noteId: string, typed: Typed) => void;
  /** The note as the core has it now. */
  onNote: (note: Note) => void;
  onSaveState: (noteId: string, state: SaveState) => void;
  /** The tab is closed and what was left in it saved, or kept as a draft. */
  onSettled: (noteId: string) => void;
  onMoved: (note: Note, from: string) => void;
  /** Its ⋯ chose another project (0.1.2): the window that asks where. */
  onMoveOut: (noteId: string) => void;
  /** Just moved here from another project, from this tab: says so. */
  moved?: string;
  onDelete: (noteId: string, title: string) => void;
  /** Closes the tab; `gone` when the note is no more, so that Back does
   * not bring the tab up again. */
  onCloseTab: (tab: string, gone?: boolean) => void;
  notify: (text: string) => void;
}

export function NoteView(props: Props) {
  const { noteId, active, me } = props;
  const t = useT();
  const [note, setNote] = useState<Note | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [conflict, setConflict] = useState<Note | null>(null);
  const [gone, setGone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [focusFirst, setFocusFirst] = useState(0);
  const [, setMinute] = useState(0);
  const title = useRef<HTMLTextAreaElement>(null);
  /** The note as it is on this page now: always the latest, also between
   * renders. */
  const docRef = useRef<Doc | null>(null);
  /** The version the page's text was made from, and that text. */
  const base = useRef<Base | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  /** What the save on its way sent. */
  const inFlight = useRef<Doc | null>(null);
  const again = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const draftTimer = useRef<number | undefined>(undefined);
  const conflictRef = useRef<Note | null>(null);
  const goneRef = useRef(false);
  const summaryTimer = useRef<number | undefined>(undefined);
  const stateRef = useRef<SaveState>("loading");
  const closed = useRef(false);
  const focused = useRef(false);
  /** This view's own draft, which no other view touches. */
  const ownKey = useRef("");
  if (!ownKey.current) ownKey.current = draftKey(me.id, noteId, blockId());
  const callbacks = useRef(props);
  callbacks.current = props;

  const report = useCallback((state: SaveState) => {
    if (stateRef.current === state) return;
    stateRef.current = state;
    callbacks.current.onSaveState(noteId, state);
  }, [noteId]);

  const show = useCallback((next: Doc) => {
    docRef.current = next;
    setDoc(next);
  }, []);

  const known = useCallback((n: Note) => {
    setNote(n);
    callbacks.current.onNote(n);
  }, []);

  const markGone = useCallback(() => {
    goneRef.current = true;
    writeDraft(ownKey.current, null);
    setGone(true);
    report("gone");
  }, [report]);

  /** This view's draft as things are now: what is not saved, or none. At
   * once, or a moment later while typing; `closing` as the view closes or
   * the page unloads, which leaves it to the next view of the note. */
  const keepDraft = useCallback((now = false, closing = false) => {
    window.clearTimeout(draftTimer.current);
    const write = () => {
      const doc = docRef.current;
      const was = base.current;
      if (goneRef.current || isDeleted(noteId) || !doc || !was) return;
      if (conflictRef.current || dirty(doc, was)) {
        writeDraft(ownKey.current, {
          base: was, mine: { title: doc.title, blocks: meaningful(doc.blocks) },
          sent: inFlight.current, at: Date.now(), closed: closing,
        });
      } else {
        writeDraft(ownKey.current, null);
      }
    };
    if (now) write();
    else draftTimer.current = window.setTimeout(write, DRAFT_MS);
  }, [noteId]);

  /** Takes the note as the core has it: its text replaces the page's. */
  const adopt = useCallback((n: Note) => {
    base.current = baseOf(n);
    known(n);
    show({ title: n.title, blocks: editable(n.blocks, docRef.current?.blocks) });
  }, [known, show]);

  /** What lists show of the note: a moment after typing, at once for a
   * tick. */
  const tellSummary = useCallback((now = false) => {
    window.clearTimeout(summaryTimer.current);
    const tell = () => {
      const doc = docRef.current;
      const was = base.current;
      if (doc && was) {
        callbacks.current.onSummary(noteId, {
          title: doc.title, ...summary(meaningful(doc.blocks)), version: was.version,
        });
      }
    };
    if (now) tell();
    else summaryTimer.current = window.setTimeout(tell, 300);
  }, [noteId]);

  const save = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (closed.current) return;
    if (saving.current) {
      again.current = true;
      return saving.current;
    }
    const sent = docRef.current;
    const was = base.current;
    if (!sent || !was) return;
    if (conflictRef.current || !dirty(sent, was)) {
      if (!conflictRef.current) report("saved");
      return;
    }
    report("saving");
    const blocks = meaningful(sent.blocks);
    inFlight.current = { title: sent.title, blocks };
    const run = (async () => {
      try {
        const saved = await saveNote(noteId, was.version, sent.title, blocks);
        const now = docRef.current!;
        known(saved);
        if (now === sent) {
          base.current = baseOf(saved);
          if (saved.title !== sent.title || !sameContent(saved.blocks, blocks) ||
            !sameTicks(saved.blocks, blocks)) {
            show({ title: saved.title, blocks: editable(saved.blocks, now.blocks) });
          }
        } else {
          // Typed on while the save was on its way: what it brought from
          // others goes in around that.
          const merged = merge(sent.title, blocks, now.title,
            meaningful(now.blocks), saved.title, saved.blocks);
          if (merged) {
            base.current = baseOf(saved);
            show({ title: merged.title, blocks: editable(merged.blocks, now.blocks) });
          } else {
            // Others changed what is being typed in now. What this page
            // sent is in the saved note: the typing since was made on it.
            base.current = { version: saved.version, title: sent.title, blocks };
            conflictRef.current = saved;
            setConflict(saved);
          }
        }
        report(conflictRef.current ? "conflict"
          : dirty(docRef.current, base.current) ? "unsaved" : "saved");
      } catch (e) {
        if (e instanceof NoteConflict) {
          // Saved elsewhere meanwhile, from further back than the core
          // keeps, or the same places changed: the page merges itself,
          // from the version it typed on, and asks only about a clash.
          const theirs = e.note;
          const now = docRef.current!;
          const typedOn = base.current!;
          const merged = merge(typedOn.title, typedOn.blocks, now.title,
            meaningful(now.blocks), theirs.title, theirs.blocks);
          known(theirs);
          if (merged) {
            base.current = baseOf(theirs);
            show({ title: merged.title, blocks: editable(merged.blocks, now.blocks) });
            again.current = true;
            report("unsaved");
          } else {
            conflictRef.current = theirs;
            setConflict(theirs);
            report("conflict");
          }
        } else if (e instanceof NoteGone) {
          markGone();
        } else if (e instanceof SignedOut) {
          report("unsaved");
        } else if (refused(e)) {
          // Asking again the same way gets the same no: the next change
          // tries again.
          report("refused");
          callbacks.current.notify(say("note_view.not_saved", { why: (e as Error).message }));
        } else {
          report("offline");
          if (!closed.current) {
            timer.current = window.setTimeout(() => void save(), RETRY_MS);
          }
        }
      } finally {
        saving.current = null;
        inFlight.current = null;
        if (!closed.current) keepDraft(true);
        if (again.current && !closed.current) {
          again.current = false;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void save(), 0);
        }
      }
    })();
    saving.current = run;
    return run;
  }, [noteId, keepDraft, known, markGone, report, show]);

  /** Everything typed so far, saved: before a tick, which the core makes
   * on what it has. */
  const flush = useCallback(async () => {
    for (let round = 0; round < 4; round++) {
      if (saving.current) {
        await saving.current;
        continue;
      }
      if (!conflictRef.current && dirty(docRef.current, base.current)) {
        await save();
        continue;
      }
      return;
    }
  }, [save]);

  /** The note as the core has it, with a draft another view left put back
   * on top: merged with what was saved since, or asked about. */
  const arrive = useCallback((n: Note) => {
    const left = leftDrafts(me.id, noteId, ownKey.current);
    if (!left.length) {
      adopt(n);
      report("saved");
      return;
    }
    const { key, draft } = left[0];
    // If the save on its way when the draft was written got there, the
    // text was typed on that.
    const landed = !!draft.sent && sameDoc(merge(draft.base.title, draft.base.blocks,
      draft.sent.title, draft.sent.blocks, n.title, n.blocks), n);
    const from: Doc = landed && draft.sent ? draft.sent : draft.base;
    const merged = merge(from.title, from.blocks, draft.mine.title, draft.mine.blocks,
      n.title, n.blocks);
    // This view takes it over: from now on its own draft has it.
    writeDraft(key, null);
    if (merged && sameDoc(merged, n)) {
      adopt(n);
      report("saved");
      return;
    }
    known(n);
    if (merged) {
      base.current = baseOf(n);
      show({ title: merged.title, blocks: editable(merged.blocks) });
      report("unsaved");
      timer.current = window.setTimeout(() => void save(), 0);
    } else {
      base.current = { version: n.version, title: from.title, blocks: from.blocks };
      show({ title: draft.mine.title, blocks: editable(draft.mine.blocks) });
      conflictRef.current = n;
      setConflict(n);
      report("conflict");
    }
    keepDraft(true);
    callbacks.current.notify(say("note_view.draft_back"));
  }, [me.id, noteId, adopt, keepDraft, known, report, save, show]);

  // The note, from what this page has or from the core.
  useEffect(() => {
    const ready = primed.get(noteId);
    if (ready) {
      primed.delete(noteId);
      arrive(ready);
      return;
    }
    let live = true;
    loadNote(noteId)
      .then((n) => {
        if (!live) return;
        setProblem(null);
        arrive(n);
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof NoteGone) {
          dropDrafts(me.id, noteId);
          markGone();
        } else {
          setProblem((e as Error).message || say("note_view.no_answer"));
        }
      });
    return () => {
      live = false;
    };
  }, [me.id, noteId, attempt, arrive, markGone]);

  // A note made a moment ago: the caret in its title, once.
  useEffect(() => {
    if (!props.fresh || !note || !active || focused.current) return;
    focused.current = true;
    title.current?.focus();
  }, [props.fresh, note, active]);

  // The title is as tall as its lines: a long one wraps.
  const titleText = doc?.title;
  useLayoutEffect(() => {
    if (active) fit(title.current);
  }, [titleText, active]);
  useEffect(() => {
    const again = () => fit(title.current);
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, []);

  // A draft this view looks after says so now and then: another window
  // takes over only a draft left by a view that closed, or one no view has
  // touched for a minute.
  useEffect(() => {
    const every = window.setInterval(() => {
      if (conflictRef.current || dirty(docRef.current, base.current)) keepDraft(true);
    }, 20_000);
    return () => window.clearInterval(every);
  }, [keepDraft]);

  // "5 min ago" goes on counting while the note is in front.
  useEffect(() => {
    if (!active) return;
    const every = window.setInterval(() => setMinute((n) => n + 1), 60_000);
    return () => window.clearInterval(every);
  }, [active]);

  const changed = useCallback(() => {
    if (dirty(docRef.current, base.current)) {
      report(conflictRef.current ? "conflict" : "unsaved");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(), SAVE_MS);
    }
    keepDraft();
    tellSummary();
  }, [keepDraft, report, save, tellSummary]);

  const onBlocks = useCallback((change: (blocks: Block[]) => Block[]) => {
    const now = docRef.current;
    if (!now) return;
    const blocks = change(now.blocks);
    if (blocks === now.blocks) return;
    show({ ...now, blocks });
    changed();
    // Written in: the mark of search has done its job (0.1.7).
    forgetNoteMark(noteId);
  }, [show, changed, noteId]);

  // The block search opened (0.1.7), in the middle, once the note is drawn.
  const found = useFoundNote(noteId);
  const hasDoc = !!doc;
  useEffect(() => {
    if (!found?.blockId || !hasDoc || !active || wentThere(found.n)) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(
        `.note-view:not(.behind) [data-block="${found.blockId}"]`)
        ?.scrollIntoView({ block: "center" });
      goneThere(found.n);
    });
    return () => cancelAnimationFrame(frame);
  }, [found?.n, found?.blockId, hasDoc, active]);

  const onTitle = (value: string) => {
    const now = docRef.current;
    if (!now) return;
    show({ ...now, title: cleanTitle(value) });
    changed();
  };

  const onTick = useCallback(async (id: string, done: boolean) => {
    const before = docRef.current;
    if (!before) return;
    const was = before.blocks.find((b) => b.id === id);
    const mark = (blocks: Block[], patch: Partial<Block>) =>
      blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    show({ ...before, blocks: mark(before.blocks, {
      done, by: done ? me.id : null, at: done ? Date.now() : null }) });
    tellSummary(true);
    try {
      await flush();
      const result = await tickNote(noteId, id, done);
      const newer = result.version >= (base.current?.version ?? 0);
      if (newer && !saving.current && !conflictRef.current &&
        !dirty(docRef.current, base.current)) {
        // Nothing typed meanwhile: the note as the tick left it, others'
        // changes too, and its version.
        adopt(result);
      } else {
        const item = result.blocks.find((b) => b.id === id);
        if (item && newer) {
          const patch = { done: item.done, by: item.by, at: item.at };
          const now = docRef.current!;
          show({ ...now, blocks: mark(now.blocks, patch) });
          if (base.current) {
            base.current = { ...base.current, blocks: mark(base.current.blocks, patch) };
          }
        }
        if (newer) known(result);
      }
      tellSummary(true);
    } catch (e) {
      const now = docRef.current!;
      show({ ...now, blocks: mark(now.blocks, {
        done: !!was?.done, by: was?.by ?? null, at: was?.at ?? null }) });
      tellSummary(true);
      if (e instanceof NoteGone) markGone();
      else if (!(e instanceof SignedOut)) {
        callbacks.current.notify(say("note_view.no_tick", { why: (e as Error).message }));
      }
    }
  }, [adopt, flush, known, markGone, me.id, noteId, show, tellSummary]);

  // While in front, at once and now and then: what others saved.
  useEffect(() => {
    if (!active || gone) return;
    const look = () => {
      if (!base.current || document.hidden || saving.current ||
        conflictRef.current || dirty(docRef.current, base.current)) return;
      loadNote(noteId, true)
        .then((n) => {
          const was = base.current;
          if (!was || n.version <= was.version) return;
          if (saving.current || conflictRef.current ||
            dirty(docRef.current, base.current)) return;
          adopt(n);
          tellSummary();
        })
        .catch((e) => {
          if (e instanceof NoteGone) markGone();
        });
    };
    look();
    const every = window.setInterval(look, LOOK_MS);
    window.addEventListener("focus", look);
    return () => {
      window.clearInterval(every);
      window.removeEventListener("focus", look);
    };
  }, [active, gone, noteId, adopt, markGone, tellSummary]);

  // Leaving the page with something unsaved: kept as a draft, and the
  // browser asks first. Closing the tab saves what is left, then tells
  // the page.
  useEffect(() => {
    closed.current = false;
    const leaving = (event: BeforeUnloadEvent) => {
      if (saving.current || conflictRef.current || dirty(docRef.current, base.current)) {
        keepDraft(true, true);
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("beforeunload", leaving);
      closed.current = true;
      window.clearTimeout(timer.current);
      window.clearTimeout(summaryTimer.current);
      window.clearTimeout(draftTimer.current);
      const titleNow = docRef.current?.title ?? "";
      if (goneRef.current || isDeleted(noteId)) {
        // Deleted: nothing to keep, nothing to say.
        dropDrafts(me.id, noteId);
        callbacks.current.onSettled(noteId);
        return;
      }
      keepDraft(true, true);
      const settle = async () => {
        let kept = false;
        try {
          if (saving.current) await saving.current;
          // The base the save on its way left.
          keepDraft(true, true);
          const now = docRef.current;
          const was = base.current;
          if (goneRef.current || isDeleted(noteId)) {
            dropDrafts(me.id, noteId);
          } else if (!now || !was) {
            // Never loaded: it took no draft over, and leaves them all be.
          } else if (conflictRef.current) {
            kept = true;
          } else if (dirty(now, was)) {
            // Saved, merged with what others saved since if need be.
            await saveNote(noteId, was.version, now.title, meaningful(now.blocks));
            writeDraft(ownKey.current, null);
          } else {
            writeDraft(ownKey.current, null);
          }
        } catch (e) {
          if (e instanceof NoteGone) dropDrafts(me.id, noteId);
          else kept = true;
        }
        if (kept && !draftsOff()) {
          callbacks.current.notify(say("note_view.kept_draft",
            { title: titled(titleNow, say) }));
        }
        callbacks.current.onSettled(noteId);
      };
      void settle();
    };
  }, [me.id, noteId, keepDraft]);

  /** The clash settled the person's way: their side where both changed,
   * everything else from both, saved from the version that clashed. */
  const resolve = (prefer: "mine" | "theirs") => {
    const theirs = conflictRef.current;
    const typedOn = base.current;
    const now = docRef.current;
    if (!theirs || !typedOn || !now) return;
    const merged = merge(typedOn.title, typedOn.blocks, now.title,
      meaningful(now.blocks), theirs.title, theirs.blocks, prefer)!;
    base.current = baseOf(theirs);
    conflictRef.current = null;
    setConflict(null);
    show({ title: merged.title, blocks: editable(merged.blocks, now.blocks) });
    tellSummary(true);
    if (dirty(docRef.current, base.current)) {
      report("unsaved");
      void save();
    } else {
      report("saved");
      keepDraft(true);
    }
  };

  // Where the lists have it: a move or a new name made elsewhere on the page
  // shows here at once.
  let project = props.projects.find((p) => p.id === note?.projectId);
  let folderId = note?.folderId ?? "";
  let folderName = note?.folder ?? "";
  for (const p of props.projects) {
    const f = p.folders.find((x) => x.notes.some((n) => n.id === noteId));
    if (f) {
      project = p;
      folderId = f.id;
      folderName = f.name;
      break;
    }
  }
  const folders = project?.folders ?? [];
  // Moved to another project, from this tab or elsewhere: what the person
  // may do with it there comes from the core. The version stays the same,
  // so looking again now and then would not take it.
  const listedIn = project?.id;
  const loadedIn = note?.projectId;
  useEffect(() => {
    if (!listedIn || !loadedIn || listedIn === loadedIn) return;
    let stale = false;
    loadNote(noteId, true)
      .then((n) => {
        if (stale) return;
        setNote((was) => was && { ...was, projectId: n.projectId,
          folderId: n.folderId, folder: n.folder, canWrite: n.canWrite,
          canDelete: n.canDelete });
      })
      .catch((e) => {
        if (!stale && e instanceof NoteGone) markGone();
      });
    return () => {
      stale = true;
    };
  }, [listedIn, loadedIn, noteId, markGone]);
  // Another project the person writes notes in: the note may go there.
  const elsewhere = props.projects.some((p) => p.id !== project?.id && writes(p));

  const copyMarkdown = async () => {
    const now = docRef.current;
    if (!now) return;
    const ok = await copyToClipboard(toMarkdown(now.title, meaningful(now.blocks)));
    if (ok) {
      props.notify(t("note_view.copied_markdown"));
    } else {
      props.notify(t("note_view.no_copy"));
    }
  };
  const move = (to: string) => {
    if (!note) return;
    const from = folderId;
    moveNote(noteId, { folderId: to })
      .then((moved) => {
        setNote((n) => (n ? { ...n, folderId: moved.folderId, folder: moved.folder } : n));
        props.onMoved(moved, from);
      })
      .catch((e) => props.notify(t("note_view.no_move", { why: (e as Error).message })));
  };

  // Who did it: someone no longer known, the person, or another by name,
  // each a sentence of its own.
  const started = (w: Who | null, when: string) => !w
    ? t("note_view.someone_started", { ago: when, folder: folderName })
    : w.id === me.id ? t("note_view.you_started", { ago: when, folder: folderName })
      : t("note_view.started", { name: w.firstName, ago: when, folder: folderName });
  const edited = (w: Who | null, when: string) => !w
    ? t("note_view.someone_edited", { ago: when })
    : w.id === me.id ? t("note_view.you_edited", { ago: when })
      : t("note_view.edited", { name: w.firstName, ago: when });
  const wrote = (w: Who | null, day: string) => !w
    ? t("note_view.someone_wrote", { day })
    : w.id === me.id ? t("note_view.you_wrote", { day })
      : t("note_view.wrote", { name: w.firstName, day });
  let meta = "";
  if (note) {
    const untouched = note.editedAt - note.createdAt < 60_000;
    meta = untouched
      ? started(note.createdBy, ago(note.createdAt, t))
      : `${edited(note.editedBy, ago(note.editedAt, t))} · ` +
        wrote(note.createdBy, onDay(note.createdAt, t));
    if (project) {
      meta += project.personal || project.alone ? ` · ${t("note_view.only_you")}`
        : ` · ${t("note_view.everyone_edits", { project: project.name })}`;
    }
  }

  let body;
  if (gone) {
    body = (
      <div className="note-gone" role="status">
        <h1>{t("note_view.gone_title")}</h1>
        <p>{t("note_view.gone_text")}</p>
        <div className="button-row">
          <button type="button" className="button-accent big"
            onClick={() => props.onCloseTab(noteTab(noteId), true)}>
            {t("note_view.close_tab")}
          </button>
          {doc && (
            <button type="button" className="button-plain" onClick={copyMarkdown}>
              {t("note_view.copy_what_was_here")}
            </button>
          )}
        </div>
      </div>
    );
  } else if (problem) {
    body = (
      <div className="error-box" role="alert">
        <span>{t("note_view.no_open", { why: problem })}</span>
        <button type="button" className="button-plain"
          onClick={() => {
            setProblem(null);
            setAttempt((n) => n + 1);
          }}>
          {t("common.try_again")}
        </button>
      </div>
    );
  } else if (!note || !doc) {
    body = <div className="note-loading" aria-busy="true" />;
  } else {
    body = (
      <>
        <div className="note-crumb">
          <span className="note-where">
            <span className={`code-chip ${colorClass(project?.color)}`}
              aria-hidden="true">{project?.code ?? ""}</span>
            <span className="note-where-name">{project?.name ?? ""}</span>
            <span aria-hidden="true">·</span>
            <FolderIcon size={13} />
            <span className="note-where-name">{folderName}</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className="button-ghost small"
              style={{ fontSize: 11, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
              title="Закоммитить заметку как Markdown файл в репозиторий GitHub" /* i18n-ignore */
              onClick={async () => {
                try {
                  const res = await fetch(`/api/orchestration/notes/${noteId}/commit-to-github?project_id=${project?.id || "default"}&author=${encodeURIComponent(me.name || "user")}`, {
                    method: "POST",
                    headers: { "x-tterm": "1" },
                  });
                  const data = await res.json();
                  if (data.ok) {
                    alert(`✅ Заметка закоммичена в GitHub репозиторий!\n${data.commit_message || data.file || ""}`); // i18n-ignore
                  } else {
                    alert(`ℹ️ ${data.error || "Не удалось отправить в GitHub"}`); // i18n-ignore
                  }
                } catch {
                  alert("Ошибка соединения при отправке заметки в GitHub"); // i18n-ignore
                }
              }}
            >
              <span>🐙 В GitHub</span> {/* i18n-ignore */}
            </button>
            <MenuButton label={t("note_view.menu")}
              title={elsewhere && note.canDelete
                ? t("note_view.menu_title_move")
                : t("note_view.menu_title")}
              className="note-menu">
              {(close) => (
                <NoteMenuItems folders={folders} folderId={folderId}
                  canWrite={note.canWrite} canDelete={note.canDelete}
                  elsewhere={elsewhere} author={note.createdBy?.firstName ?? null}
                  close={close}
                  onMove={move} onMoveOut={() => props.onMoveOut(noteId)}
                  onCopy={copyMarkdown}
                  onDelete={() => props.onDelete(noteId, docRef.current?.title ?? note.title)} />
              )}
            </MenuButton>
          </div>
        </div>
        <textarea ref={title} className="note-title" value={doc.title} rows={1}
          placeholder={t("note.untitled")} aria-label={t("note_view.title")} maxLength={200}
          readOnly={!note.canWrite} autoComplete="off"
          onChange={(e) => onTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            // A long title wraps; Enter, and the arrow down from its end,
            // go on to the text.
            const area = e.currentTarget;
            const atEnd = area.selectionStart === area.value.length &&
              area.selectionEnd === area.value.length;
            if (e.key === "Enter" || (e.key === "ArrowDown" && atEnd)) {
              e.preventDefault();
              setFocusFirst((n) => n + 1);
            }
          }} />
        <p className="note-meta">{meta}</p>
        {props.moved && (
          <div className="note-moved" role="status">
            <Check size={15} />
            <span>{props.moved}</span>
          </div>
        )}
        {conflict && (
          <div className="note-conflict" role="alert">
            <span>{t("note_view.conflict")}</span>
            <span className="button-row">
              <button type="button" className="button-plain small"
                onClick={() => resolve("mine")}>
                {t("note_view.keep_mine")}
              </button>
              <button type="button" className="button-plain small"
                onClick={() => resolve("theirs")}>
                {t("note_view.keep_theirs")}
              </button>
            </span>
          </div>
        )}
        <NoteEditor blocks={doc.blocks} onChange={onBlocks} onTick={onTick}
          people={note.people} meId={me.id} readOnly={!note.canWrite}
          focusFirst={focusFirst} onLeaveTop={() => title.current?.focus()}
          notify={props.notify} found={found?.blockId ?? null} />
      </>
    );
  }

  return (
    <div className={active ? "note-view" : "note-view behind"} inert={!active}>
      <div className="note-page">{body}</div>
    </div>
  );
}
