// A list with a search field: the "+" next to the tabs (a terminal on any
// machine) and the palette (anything at all, by Cmd+K). Typing narrows the
// list, arrows move, Enter picks, Esc closes, and so does a click elsewhere.

import { useEffect, useMemo, useRef, useState, type ReactNode,
  type RefObject } from "react";
import { useT } from "./i18n";
import { Search } from "./icons";

export interface FinderItem {
  key: string;
  label: string;
  /** Faint text after the label. */
  hint?: string;
  icon?: ReactNode;
  /** Shown faint: picking it says why it cannot be done now. */
  muted?: boolean;
  /** Other words it is found by. */
  words?: string;
  run: () => void;
}

export interface FinderGroup {
  title: string;
  items: FinderItem[];
  /** Before anything is typed, only the first of them: the notes of a
   * project with hundreds. Typing searches them all. */
  limit?: number;
}

interface Props {
  label: string;
  placeholder: string;
  groups: FinderGroup[];
  className: string;
  /** Clicks in here do not count as elsewhere: the button that opened it. */
  around?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

function narrow(groups: FinderGroup[], query: string): FinderGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return groups.filter((g) => g.items.length > 0).map((g) =>
      (g.limit !== undefined && g.items.length > g.limit
        ? { ...g, items: g.items.slice(0, g.limit) } : g));
  }
  return groups.map((g) => {
    const starts: FinderItem[] = [];
    const has: FinderItem[] = [];
    for (const item of g.items) {
      const label = item.label.toLowerCase();
      const all = `${label} ${(item.words ?? "").toLowerCase()} ${g.title.toLowerCase()}`;
      if (label.startsWith(q) || label.includes(`/${q}`)) starts.push(item);
      else if (q.split(/\s+/).every((word) => all.includes(word))) has.push(item);
    }
    return { title: g.title, items: [...starts, ...has] };
  }).filter((g) => g.items.length > 0);
}

export function Finder(props: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => narrow(props.groups, query),
    [props.groups, query]);
  const items = useMemo(() => shown.flatMap((g) => g.items), [shown]);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  const around = props.around;

  useEffect(() => field.current?.focus(), []);
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || around?.current?.contains(target)) {
        return;
      }
      onClose.current();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [around]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[aria-selected='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  const pick = (i: number) => {
    const item = items[i];
    if (!item) return;
    props.onClose();
    item.run();
  };

  const key = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    }
  };

  let n = -1;
  return (
    <div className={`finder ${props.className}`} ref={box} role="dialog"
      aria-label={props.label} onKeyDown={key}>
      <label className="finder-search">
        <Search size={15} />
        <input ref={field} value={query} placeholder={props.placeholder}
          spellCheck={false} autoComplete="off" aria-label={props.label}
          aria-controls="finder-list"
          onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul ref={list} id="finder-list" role="listbox" aria-label={props.label}>
        {shown.map((group) => [
          <li key={`g-${group.title}`} className="finder-group"
            role="presentation">{group.title}</li>,
          ...group.items.map((item) => {
            n += 1;
            const i = n;
            return (
              <li key={item.key} role="option" aria-selected={i === active}
                className={item.muted ? "muted" : undefined}
                onMouseMove={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(i);
                }}>
                {item.icon}
                <span className="finder-label">{item.label}</span>
                {item.hint && <span className="finder-hint">{item.hint}</span>}
              </li>
            );
          }),
        ])}
        {items.length === 0 && (
          <li className="finder-empty" aria-disabled="true">{t("finder.nothing")}</li>
        )}
      </ul>
    </div>
  );
}
