// A person's round badge with their photo, or else their initials (0.1.7).
// The photo goes only where the name is written next to it: the account at
// the bottom of the sidebar, its menu, Settings › Account, a note's editor.
// Where the badge alone has to say whose something is (terminals in the
// sidebar and on a project's page), the initials stay: they say it at a
// glance, a picture does not (the owner, 24.10).
//
// In the app (0.1.8) its window does not load tTerm's addresses itself: the
// photo is fetched, as the page's requests are, through the app, and shown
// as data. Until it is there, and if it does not come, the initials.

import { useContext, useEffect, useState } from "react";
import { InApp } from "./local";

interface Props {
  initials: string;
  photo?: string | null;
  /** Its size and colour: mine, menu-avatar, settings-face. */
  className?: string;
}

/** Photos fetched in the app, by address: an address names its version, so
 * one fetch is enough. One that did not come is asked for again next time. */
const fetched = new Map<string, Promise<string | null>>();

function asData(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function fetchPhoto(address: string): Promise<string | null> {
  let found = fetched.get(address);
  if (!found) {
    found = fetch(address, { cache: "no-store" })
      .then((response) => (response.ok && response.headers.get("content-type")
        ?.startsWith("image/") ? response.blob() : null))
      .then((blob) => (blob ? asData(blob) : null))
      .catch(() => null)
      .then((data) => {
        if (!data) fetched.delete(address);
        return data;
      });
    fetched.set(address, found);
  }
  return found;
}

/** Where the photo is shown from: its address in the browser; in the app,
 * the photo itself once fetched, null until then or if it does not come. */
function usePhoto(photo: string | null | undefined): string | null {
  const { inApp, online } = useContext(InApp);
  const [data, setData] = useState<{ address: string; data: string | null } | null>(null);
  useEffect(() => {
    // Without the connection it would not come: asked when it is back.
    if (!inApp || !photo || !online) return;
    let live = true;
    void fetchPhoto(photo).then((got) => {
      if (live) setData((was) => (got || was?.address !== photo ? { address: photo, data: got } : was));
    });
    return () => {
      live = false;
    };
  }, [inApp, photo, online]);
  if (!photo) return null;
  if (!inApp) return photo;
  return data?.address === photo ? data.data : null;
}

export function Face(props: Props) {
  // A photo that does not load (gone meanwhile, no connection) gives way to
  // the initials.
  const [broken, setBroken] = useState<string | null>(null);
  const shown = usePhoto(props.photo);
  const extra = props.className ? ` ${props.className}` : "";
  if (shown && broken !== shown) {
    return (
      <img className={`avatar photo${extra}`} src={shown} alt=""
        aria-hidden="true" draggable={false}
        onError={() => setBroken(shown)} />
    );
  }
  return <span className={`avatar${extra}`} aria-hidden="true">{props.initials}</span>;
}
