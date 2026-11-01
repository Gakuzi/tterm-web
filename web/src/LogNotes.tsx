// Notes after a command (0.1.20), as the machine's log has them: under a
// line of the log, and under the block in its terminal's feed. What is
// written stays as written, nobody changes or deletes it; it is answered
// with Reply. A note an AI wrote says on whose behalf. Redacted words leave
// who redacted them, when and why in their place.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LogNote, LogPerson, Me, Redaction } from "./api";
import { useT, type Translate } from "./i18n";
import { Bubble, Erase, Spark } from "./icons";
import { Avatar } from "./ProjectPage";
import { clock, day } from "./time";

/** A note's words, at most, as the core takes them. */
export const NOTE_MAX = 4000;

/** "09:23" today, "12 Oct 09:23" another day. */
export function stampOf(ms: number, t: Translate): string {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString() ? clock(ms)
    : `${day(ms, t)} ${clock(ms)}`;
}

/** Who did it, as a line of the log says it: You, or their first name. */
export function whoOf(person: LogPerson | null, me: Me, t: Translate): string {
  if (!person) return t("log.someone");
  return person.id === me.id ? t("log.you") : person.firstName;
}

/** "Redacted by You · 09:23 · a password". */
export function redactedLine(r: Redaction, me: Me, t: Translate): string {
  const at = stampOf(r.at, t);
  if (!r.by) return t("log.redacted_by_someone", { at, reason: r.reason });
  return r.by.id === me.id ? t("log.redacted_by_you", { at, reason: r.reason })
    : t("log.redacted_by", { who: r.by.firstName, at, reason: r.reason });
}

export function RedactedMark({ redacted, me }: { redacted: Redaction; me: Me }) {
  const t = useT();
  return (
    <span className="log-redacted">
      <Erase size={13} />
      <span>{redactedLine(redacted, me, t)}</span>
    </span>
  );
}

/** The editor of a note or a reply: Enter saves, Shift+Enter starts a new
 * line, Esc cancels. It stays open with what was typed if saving fails. */
export function NoteEdit(props: {
  reply: boolean;
  onSave: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // In front at once: a click on a button would otherwise hand the keys
  // back to the terminal's line.
  useLayoutEffect(() => {
    area.current?.focus();
  }, []);
  // It grows with what is written.
  useLayoutEffect(() => {
    const a = area.current;
    if (!a) return;
    a.style.height = "auto";
    a.style.height = `${a.scrollHeight}px`;
  }, [text]);
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const saved = await props.onSave(text);
    if (!saved) setBusy(false);
  };
  const key = (inner: ReactNode) => <kbd>{inner}</kbd>;
  return (
    <div className="note-edit">
      <textarea ref={area} rows={2} value={text} maxLength={NOTE_MAX}
        aria-label={props.reply ? t("log.reply_label") : t("log.note_label")}
        placeholder={props.reply ? t("log.reply_placeholder") : t("log.note_placeholder")}
        readOnly={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            props.onCancel();
          }
        }} />
      <div className="note-edit-foot">
        <span className="note-edit-hint">{t.rich("log.edit_hint", { k: key })}</span>
        <button type="button" className="button-plain" onClick={props.onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="button-accent" disabled={!text.trim() || busy}
          onClick={() => void save()}>
          {props.reply ? t("log.reply") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

function Message(props: {
  note: LogNote;
  me: Me;
  /** The ⋯ of the note, for those who may redact it. */
  menu?: ReactNode;
}) {
  const t = useT();
  const { note, me } = props;
  const ai = note.author === "ai";
  const who = note.by;
  const name = ai
    ? (!who || who.id === me.id ? t("log.ai_for_you") : t("log.ai_for", { who: who.firstName }))
    : whoOf(who, me, t);
  return (
    <div className="lmsg" id={`n${note.id}`}>
      <div className="lmsg-by">
        {ai ? (
          <span className="avatar xs ai-av" aria-hidden="true"><Spark size={11} /></span>
        ) : (
          <Avatar who={who} me={me} size="xs" named />
        )}
        <span className="lmsg-who" title={ai && note.ai ? note.ai : undefined}>{name}</span>
        <span>{stampOf(note.at, t)}</span>
        {props.menu}
      </div>
      {note.redacted ? (
        <div className="lmsg-text red-out">
          <Erase size={13} />
          <span>{redactedLine(note.redacted, me, t)}</span>
        </div>
      ) : (
        <div className="lmsg-text">{note.text}</div>
      )}
    </div>
  );
}

/** The notes under a command, oldest first, and Reply; or the editor in
 * Reply's place. With no notes yet, the editor alone, in the same box. */
export function Thread(props: {
  notes: LogNote[];
  me: Me;
  canWrite: boolean;
  writing: boolean;
  onWrite: () => void;
  onCancel: () => void;
  onSave: (text: string) => Promise<boolean>;
  /** The ⋯ of each note, if any. */
  menuOf?: (note: LogNote) => ReactNode;
  className: string;
}) {
  const t = useT();
  const { notes, me } = props;
  if (!notes.length && !props.writing) return null;
  // One box whether or not there are notes yet, the editor by a key of its
  // own: a note that comes in while the first is being written does not
  // take the editor, nor what is typed in it, away.
  return (
    <div className={notes.length ? props.className : `${props.className} empty`}>
      {notes.map((n) => (
        <Message key={n.id} note={n} me={me} menu={props.menuOf?.(n)} />
      ))}
      {props.writing ? (
        <NoteEdit key="edit" reply={notes.length > 0} onSave={props.onSave}
          onCancel={props.onCancel} />
      ) : props.canWrite && (
        <div key="foot" className="lnote-foot">
          <button type="button" className="lnote-reply" onClick={props.onWrite}>
            <Bubble size={13} />
            {t("log.reply")}
          </button>
        </div>
      )}
    </div>
  );
}
