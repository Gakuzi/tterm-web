// Your photo (0.1.7), as approved on the canvas of 23.10: the photo chosen,
// with a circle over it. Drag it into place, zoom with the slider (or the
// arrows and + and - on the photo), and see it as others will, in three
// sizes. Save makes a JPEG of what is in the circle, 256 pixels square, here
// in the browser, and sends only that: the file itself, and whatever it says
// about where it was taken, never leaves the computer.

import { useEffect, useRef, useState } from "react";
import { savePhoto } from "./api";
import { useT } from "./i18n";
import { Close } from "./icons";

/** The frame, and the circle in it, in pixels. */
const FRAME = 260;
const CIRCLE = 224;
const EDGE = (FRAME - CIRCLE) / 2;
/** The photo kept, this many pixels a side. */
const SIDE = 256;
const ZOOM_MAX = 3;
const PREVIEWS = [48, 30, 18];

interface Props {
  /** The photo chosen, loaded. */
  image: HTMLImageElement;
  onSaved: (photo: string) => void;
  onCancel: () => void;
}

interface Spot {
  x: number;
  y: number;
}

export function PhotoDialog(props: Props) {
  const { image } = props;
  const t = useT();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  /** At zoom 1 the photo's shorter side just fills the circle. */
  const base = CIRCLE / Math.min(width, height);
  const [zoom, setZoom] = useState(1);
  /** Where the photo's middle is from the circle's, in pixels on screen. */
  const [offset, setOffset] = useState<Spot>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const drag = useRef<{ pointer: number; from: Spot; at: Spot } | null>(null);
  const previews = useRef<(HTMLCanvasElement | null)[]>([]);
  const box = useRef<HTMLElement>(null);
  const cancel = useRef(props.onCancel);
  cancel.current = props.onCancel;

  /** The offset kept so that the photo always covers the circle. */
  const within = (spot: Spot, z: number): Spot => {
    const scale = base * z;
    const mx = Math.max(0, (width * scale - CIRCLE) / 2);
    const my = Math.max(0, (height * scale - CIRCLE) / 2);
    return { x: Math.min(mx, Math.max(-mx, spot.x)),
      y: Math.min(my, Math.max(-my, spot.y)) };
  };
  const scale = base * zoom;
  const shownWidth = width * scale;
  const shownHeight = height * scale;
  const left = FRAME / 2 + offset.x - shownWidth / 2;
  const top = FRAME / 2 + offset.y - shownHeight / 2;
  /** What of the photo is in the circle, in the photo's own pixels. */
  const crop = { x: (EDGE - left) / scale, y: (EDGE - top) / scale, side: CIRCLE / scale };

  const zoomTo = (next: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(1, next));
    setOffset((o) => within({ x: (o.x * z) / zoom, y: (o.y * z) / zoom }, z));
    setZoom(z);
  };

  useEffect(() => {
    box.current?.querySelector<HTMLElement>(".photo-frame")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The small circles: what is in the big one, as others will see it.
  useEffect(() => {
    previews.current.forEach((canvas, i) => {
      if (!canvas) return;
      const size = PREVIEWS[i];
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * ratio);
      canvas.height = Math.round(size * ratio);
      const g = canvas.getContext("2d");
      if (!g) return;
      g.imageSmoothingQuality = "high";
      g.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0,
        canvas.width, canvas.height);
    });
  });

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = SIDE;
      canvas.height = SIDE;
      const g = canvas.getContext("2d");
      if (!g) throw new Error(t("photo.browser_failed"));
      // A transparent PNG gets white behind it: a JPEG has no transparency.
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, SIDE, SIDE);
      g.imageSmoothingQuality = "high";
      g.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, SIDE, SIDE);
      const jpeg = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!jpeg) throw new Error(t("photo.browser_failed"));
      const { photo } = await savePhoto(jpeg);
      props.onSaved(photo);
    } catch (error) {
      setProblem((error as Error).message || t("photo.no_answer"));
      setBusy(false);
    }
  };

  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 16 : 4;
    const moves: Record<string, Spot> = {
      ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setOffset((o) => within({ x: o.x + move.x, y: o.y + move.y }, zoom));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(zoom + 0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomTo(zoom - 0.1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };

  return (
    <div className="scrim">
      <section ref={box} className="dialog photo-dialog" role="dialog"
        aria-modal="true" aria-labelledby="ph-title">
        <div className="dialog-head">
          <div className="dialog-title">
            <h2 id="ph-title">{t("photo.title")}</h2>
          </div>
          <button type="button" className="icon-button small" aria-label={t("common.close")}
            onClick={props.onCancel}>
            <Close size={16} />
          </button>
        </div>
        <div className="photo-body">
          <div className="photo-frame" tabIndex={0} role="img"
            aria-label={t("photo.frame")}
            onKeyDown={nudge}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { pointer: event.pointerId, from: offset,
                at: { x: event.clientX, y: event.clientY } };
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (!d || d.pointer !== event.pointerId) return;
              setOffset(within({ x: d.from.x + event.clientX - d.at.x,
                y: d.from.y + event.clientY - d.at.y }, zoom));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}>
            <img src={image.src} alt="" draggable={false}
              style={{ width: shownWidth, height: shownHeight,
                transform: `translate(${left}px, ${top}px)` /* i18n-ignore */ }} />
            <span className="photo-circle" aria-hidden="true" />
          </div>
          <div className="photo-side">
            <label className="photo-zoom">
              <span>{t("photo.zoom")}</span>
              <input type="range" min={100} max={ZOOM_MAX * 100} step={5}
                value={Math.round(zoom * 100)}
                onChange={(event) => zoomTo(Number(event.target.value) / 100)} />
            </label>
            <p className="hint">{t("photo.drag")}</p>
            <div className="photo-previews">
              {PREVIEWS.map((size, i) => (
                <canvas key={size} className="photo-preview" aria-hidden="true"
                  ref={(node) => {
                    previews.current[i] = node;
                  }}
                  style={{ width: size, height: size }} />
              ))}
              <span className="hint">{t("photo.preview")}</span>
            </div>
          </div>
        </div>
        <p className="dialog-note photo-note">
          {t("photo.note")}
        </p>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="button-row photo-buttons">
          <button type="button" className="button-plain quiet" onClick={props.onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="button-accent" disabled={busy}
            onClick={() => void save()}>
            {busy ? t("photo.saving") : t("photo.save")}
          </button>
        </div>
      </section>
    </div>
  );
}
