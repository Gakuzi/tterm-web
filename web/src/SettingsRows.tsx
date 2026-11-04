// The parts of a section of Settings (row 133, from 0.1.27): groups with a
// title, and in them rows, a name with a line under it on the left and what
// it is set to on the right, as on the canvas of 03.11 (version 107). A row
// whose words hold what is typed in the search lights up.

import { createContext, useContext, useId, type ReactNode } from "react";
import { holds } from "./settingsSearch";

/** The words typed in the search, and the language they compare in. */
export const SearchWords = createContext<{ words: string[]; lang: string }>({ words: [], lang: "en" });

export function Group(props: {
  title: string;
  note?: ReactNode;
  /** Not there yet: what will come here (Payment, until the paid plans). */
  faded?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={props.faded ? "settings-section faded" : "settings-section"}
      aria-labelledby={id}>
      <h3 id={id}>{props.title}</h3>
      {props.note && <p className="settings-section-note">{props.note}</p>}
      <div className="settings-rows">{props.children}</div>
    </section>
  );
}

export function Row(props: {
  /** The name, and the words the search finds it by. */
  label: string;
  /** The name as it shows, where it is more than its words: a badge, say. */
  labelNode?: ReactNode;
  note?: ReactNode;
  /** The note's words for the search, where the note is not plain text. */
  noteWords?: string;
  /** More words the search finds it by: the choices in it, say. */
  words?: string;
  children?: ReactNode;
  /** What goes under the row: a problem with it, say. */
  after?: ReactNode;
}) {
  const { words, lang } = useContext(SearchWords);
  const note = typeof props.note === "string" ? props.note : (props.noteWords ?? "");
  const found = words.length > 0 &&
    holds(`${props.label} ${note} ${props.words ?? ""}`, words, lang);
  return (
    <div className={found ? "settings-row found" : "settings-row"}>
      <div className="settings-line">
        <div className="settings-label">
          <span>{props.labelNode ?? props.label}</span>
          {props.note && <small>{props.note}</small>}
        </div>
        {props.children !== undefined && <div className="settings-control">{props.children}</div>}
      </div>
      {props.after}
    </div>
  );
}
