// A small list with a search field over the input line: where to cd, which
// branch to switch to. Arrows move, Enter picks, Esc closes; typing narrows
// the list, and what was typed can be taken as it is.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "./i18n";
import { Search } from "./icons";

export interface PickerItem {
  key: string;
  label: string;
  /** Faint text after the label: "current", "remote". */
  hint?: string;
  icon?: ReactNode;
  /** A dot-directory: listed once the search starts with a dot. */
  hidden?: boolean;
}

interface Props {
  label: string;
  /** null while the list is on its way. */
  items: PickerItem[] | null;
  error?: string | null;
  placeholder: string;
  onPick: (item: PickerItem) => void;
  /** Enter on what was typed when nothing in the list is exactly it. */
  onTyped?: (text: string) => void;
  typedLabel?: (text: string) => string;
  onClose: () => void;
}

function matches(all: PickerItem[], query: string): PickerItem[] {
  const q = query.trim().toLowerCase();
  const items = q.startsWith(".") ? all : all.filter((i) => !i.hidden);
  if (!q) return items;
  const starts: PickerItem[] = [];
  const has: PickerItem[] = [];
  for (const item of items) {
    const l = item.label.toLowerCase();
    if (l.startsWith(q)) starts.push(item);
    else if (l.includes(q)) has.push(item);
  }
  return [...starts, ...has];
}

export function Picker(props: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => matches(props.items ?? [], query),
    [props.items, query]);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;

  useEffect(() => field.current?.focus(), []);
  useEffect(() => setActive(0), [query]);

  // A click anywhere else closes it.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        onClose.current();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, []);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[aria-selected='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, shown]);

  const typed = query.trim();
  const offerTyped = !!props.onTyped && typed !== "" &&
    !shown.some((i) => i.label === typed);
  const count = shown.length + (offerTyped ? 1 : 0);

  const pick = (i: number) => {
    if (i < shown.length) props.onPick(shown[i]);
    else if (offerTyped) props.onTyped?.(typed);
  };

  const key = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, count - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
    }
  };

  return (
    <div className="picker" ref={box} role="dialog" aria-label={props.label}
      onKeyDown={key}>
      <label className="picker-search">
        <Search size={14} />
        <input ref={field} value={query} placeholder={props.placeholder}
          spellCheck={false} autoComplete="off" aria-label={props.label}
          onChange={(e) => setQuery(e.target.value)} />
      </label>
      {props.error ? (
        <p className="picker-note">{props.error}</p>
      ) : props.items === null ? (
        <p className="picker-note"><span className="spinner" aria-hidden="true" />
          {t("picker.asking")}</p>
      ) : (
        <ul ref={list} role="listbox" aria-label={props.label}>
          {shown.map((item, i) => (
            <li key={item.key} role="option" aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}>
              {item.icon}
              <span className="picker-label">{item.label}</span>
              {item.hint && <span className="picker-hint">{item.hint}</span>}
            </li>
          ))}
          {offerTyped && (
            <li role="option" aria-selected={active === shown.length}
              className="picker-typed"
              onMouseEnter={() => setActive(shown.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(shown.length);
              }}>
              <span className="picker-label">
                {props.typedLabel ? props.typedLabel(typed) : typed}
              </span>
            </li>
          )}
          {count === 0 && (
            <li className="picker-empty" aria-disabled="true">{t("picker.nothing")}</li>
          )}
        </ul>
      )}
    </div>
  );
}
