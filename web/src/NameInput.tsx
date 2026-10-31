// The name being typed for a terminal: in its tab (0.1.1), and from 0.1.2
// in the sidebar and on the project's page, where a double click on the
// terminal starts it. Enter or leaving it saves, Esc goes back to what it
// was. A number stays a placeholder.

import { useEffect, useRef, useState } from "react";
import { useT } from "./i18n";

/** As many as the core takes (terminals.NAME_MAX). */
const NAME_MAX = 40;

export function NameInput(props: {
  /** The terminal's id, and its name now: a number until it is named. */
  id: string;
  name: string;
  className: string;
  /** The element that says Enter saves, Esc cancels. */
  describedBy?: string;
  onRename: (id: string, name: string) => void;
  onStop: () => void;
}) {
  const t = useT();
  const numbered = /^\d+$/.test(props.name);
  const [value, setValue] = useState(numbered ? "" : props.name);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (!name || name === props.name) props.onStop();
    else props.onRename(props.id, name);
  };

  return (
    <input ref={input} className={props.className} aria-label={t("name_input.label")}
      value={value} maxLength={NAME_MAX} autoComplete="off" spellCheck={false}
      placeholder={numbered ? t("terminal.numbered", { number: props.name }) : undefined}
      aria-describedby={props.describedBy}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // Enter and Esc while a word is being composed (Japanese, Chinese)
        // are the input method's: they take or drop the word.
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          done.current = true;
          props.onStop();
        }
      }}
      onBlur={commit} />
  );
}
