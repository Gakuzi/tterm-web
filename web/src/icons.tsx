// Icons from the approved mockups: 24×24 strokes, drawn with currentColor.

type Props = { size?: number; className?: string };

function Stroke({ size = 18, width = 2, className, children }: Props & {
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={width} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const Branch = (p: Props) => (
  <Stroke {...p}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 8v8" />
    <path d="M18 10c0 4-4 5-10 6" />
  </Stroke>
);

/** A failed command: a thick cross. */
export const Cross = (p: Props) => (
  <Stroke {...p} width={4}><path d="M6 6l12 12M18 6L6 18" /></Stroke>
);

export const Collapse = (p: Props) => (
  <Stroke {...p}><path d="M6 15l6-6 6 6" /></Stroke>
);

export const Expand = (p: Props) => (
  <Stroke {...p}><path d="M6 9l6 6 6-6" /></Stroke>
);

export const Link = (p: Props) => (
  <Stroke {...p}>
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </Stroke>
);

/** Two arrows round, the other way: Restart to update (0.1.15). */
export const Restart = (p: Props) => (
  <Stroke {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
    <path d="M21 3v5h-5" />
  </Stroke>
);

export const Rerun = (p: Props) => (
  <Stroke {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Stroke>
);

export function Stop({ size = 11 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
      aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export const Folder = (p: Props) => (
  <Stroke {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Stroke>
);

export const ArrowUp = (p: Props) => (
  <Stroke {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Stroke>
);

export const Search = (p: Props) => (
  <Stroke {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Stroke>
);

export const Warning = (p: Props) => (
  <Stroke {...p}>
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4M12 17.5h.01" />
  </Stroke>
);

export const ChevronRight = (p: Props) => (
  <Stroke {...p}><path d="M9 6l6 6-6 6" /></Stroke>
);

export const ChevronDown = (p: Props) => (
  <Stroke {...p} width={2.2}><path d="M6 9l6 6 6-6" /></Stroke>
);

export const ChevronLeft = (p: Props) => (
  <Stroke {...p} width={2.2}><path d="M15 6l-6 6 6 6" /></Stroke>
);

/** A Latin letter and a Chinese one, as the canvas has it for Language
 * (0.1.16). */
export const Languages = (p: Props) => (
  <Stroke {...p}>
    <path d="M5 8l6 6" />
    <path d="M4 14l6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="M22 22l-5-10-5 10" />
    <path d="M14 18h6" />
  </Stroke>
);

export const ArrowRight = (p: Props) => (
  <Stroke {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Stroke>
);

export const Server = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Stroke>
);

export const Computer = (p: Props) => (
  <Stroke {...p}>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 19h20" />
  </Stroke>
);

/** A person: the account. */
/** No connection to tTerm, in the app (0.1.6). */
export const CloudOff = (p: Props) => (
  <Stroke {...p}>
    <path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6" />
    <path d="M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
    <path d="M1 1l22 22" />
  </Stroke>
);

export const Person = (p: Props) => (
  <Stroke {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Stroke>
);

/** A phone or a tablet, among the devices of an account. */
export const Phone = (p: Props) => (
  <Stroke {...p}>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </Stroke>
);

/** A screen on a stand: the theme of the system. */
export const Monitor = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Stroke>
);

export const Pin = (p: Props) => (
  <Stroke {...p}>
    <path d="M12 17v5" />
    <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
  </Stroke>
);

export const Close = (p: Props) => (
  <Stroke {...p}><path d="M6 6l12 12M18 6L6 18" /></Stroke>
);

export const Plus = (p: Props) => (
  <Stroke {...p} width={2.4}><path d="M12 5v14M5 12h14" /></Stroke>
);

export const Copy = (p: Props) => (
  <Stroke {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Stroke>
);

/** Copy the output only: lines of text. */
export const CopyText = (p: Props) => (
  <Stroke {...p}>
    <path d="M5 6h14M5 11h14M5 16h9" />
  </Stroke>
);

export const Trash = (p: Props) => (
  <Stroke {...p}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V4h6v3" />
  </Stroke>
);

export const TerminalIcon = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 10l3 2-3 2M12 15h5" />
  </Stroke>
);

export const Check = (p: Props) => (
  <Stroke {...p} width={2.4}><path d="M5 12l5 5 9-10" /></Stroke>
);

/** A laptop and a phone: the devices of an account. */
export const Devices = (p: Props) => (
  <Stroke {...p}>
    <rect x="2" y="5" width="14" height="10" rx="1.5" />
    <path d="M1 18h12" />
    <rect x="17" y="9" width="6" height="11" rx="1.5" />
  </Stroke>
);

/** A door with an arrow out of it. */
export const SignOut = (p: Props) => (
  <Stroke {...p}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="M15 8l4 4-4 4" />
    <path d="M19 12H9" />
  </Stroke>
);

/** A door with an arrow into it: Sign in, in the app (0.1.4). */
export const SignIn = (p: Props) => (
  <Stroke {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M9 8l4 4-4 4" />
    <path d="M13 12H3" />
  </Stroke>
);

/** A gear with eight teeth: Settings (0.1.4). */
export const Gear = (p: Props) => (
  <Stroke {...p}>
    <path d="M10.14 5.05L10.44 2.12A10 10 0 0 1 13.56 2.12L13.86 5.05A7.2 7.2 0 0 1 15.6 5.76L17.88 3.91A10 10 0 0 1 20.09 6.12L18.24 8.4A7.2 7.2 0 0 1 18.95 10.14L21.88 10.44A10 10 0 0 1 21.88 13.56L18.95 13.86A7.2 7.2 0 0 1 18.24 15.6L20.09 17.88A10 10 0 0 1 17.88 20.09L15.6 18.24A7.2 7.2 0 0 1 13.86 18.95L13.56 21.88A10 10 0 0 1 10.44 21.88L10.14 18.95A7.2 7.2 0 0 1 8.4 18.24L6.12 20.09A10 10 0 0 1 3.91 17.88L5.76 15.6A7.2 7.2 0 0 1 5.05 13.86L2.12 13.56A10 10 0 0 1 2.12 10.44L5.05 10.14A7.2 7.2 0 0 1 5.76 8.4L3.91 6.12A10 10 0 0 1 6.12 3.91L8.4 5.76A7.2 7.2 0 0 1 10.14 5.05Z" />
    <circle cx="12" cy="12" r="3" />
  </Stroke>
);

export const Sun = (p: Props) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Stroke>
);

export const Moon = (p: Props) => (
  <Stroke {...p}><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></Stroke>
);

export function Dots({ size = 16 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
      aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** The tTerm mark. Its colours are fixed: it is the same in both themes. */
export function Logo({ size = 40 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img"
      aria-label="tTerm">
      <rect width="512" height="512" rx="116" fill="#131417" />
      <path d="M118 168 L206 256 L118 344" fill="none" stroke="#E9A33F"
        strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M330 140 L330 316 C330 344 344 356 372 350" fill="none"
        stroke="#EDEFF3" strokeWidth="56" strokeLinecap="round" />
      <path d="M272 212 L392 212" fill="none" stroke="#EDEFF3"
        strokeWidth="56" strokeLinecap="round" />
    </svg>
  );
}

// Notes (0.1.0): folders like machines, notes like terminals.

export const FolderOpen = (p: Props) => (
  <Stroke {...p}>
    <path d="M4 19a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1.5" />
    <path d="M4 19l2.3-7.1A1.4 1.4 0 0 1 7.6 11H20a1 1 0 0 1 .95 1.3L19 17.6A2 2 0 0 1 17.1 19z" />
  </Stroke>
);

export const FolderPlus = (p: Props) => (
  <Stroke {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 10.5v5M9.5 13h5" />
  </Stroke>
);

/** A note with a checklist in it. */
export const ListCheck = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="4" width="7" height="7" rx="1.5" />
    <path d="M5 7.5l1.2 1.2L8.5 6.3" />
    <path d="M14 7.5h7" />
    <rect x="3" y="13" width="7" height="7" rx="1.5" />
    <path d="M14 16.5h7" />
  </Stroke>
);

/** A note of text. */
export const Doc = (p: Props) => (
  <Stroke {...p}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
    <path d="M8 13h8M8 17h5" />
  </Stroke>
);

/** Another project: two layers, one over the other (0.1.2). */
export const Layers = (p: Props) => (
  <Stroke {...p}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Stroke>
);

/** Who sees something: two people. */
export const People = (p: Props) => (
  <Stroke {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" />
  </Stroke>
);

export const Pencil = (p: Props) => (
  <Stroke {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Stroke>
);

export const Lock = (p: Props) => (
  <Stroke {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Stroke>
);

export const Heading = (p: Props) => (
  <Stroke {...p}><path d="M6 4v16M18 4v16M6 12h12" /></Stroke>
);

export const CodeIcon = (p: Props) => (
  <Stroke {...p}><path d="M8 6l-6 6 6 6M16 6l6 6-6 6" /></Stroke>
);

export const Minus = (p: Props) => (
  <Stroke {...p}><path d="M4 12h16" /></Stroke>
);

export const Bullet = (p: Props) => (
  <Stroke {...p}>
    <circle cx="5" cy="7" r="1.2" />
    <circle cx="5" cy="17" r="1.2" />
    <path d="M10 7h10M10 17h10" />
  </Stroke>
);

export const Paragraph = (p: Props) => (
  <Stroke {...p}><path d="M4 7h16M4 12h16M4 17h10" /></Stroke>
);

/** A camera: the photo of an account (0.1.7). */
export const Camera = (p: Props) => (
  <Stroke {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Stroke>
);

/** What a command printed, found by search (0.1.7). */
export const Output = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9h10M7 13h10M7 17h6" />
  </Stroke>
);

/** Something to do, in search (0.1.7). */
export const Bolt = (p: Props) => (
  <Stroke {...p}><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" /></Stroke>
);

/** A key: one's own SSH key, from the vault (0.1.17). */
export const Key = (p: Props) => (
  <Stroke {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3L20 3M16 7l3 3M14 9l2 2" />
  </Stroke>
);

/** Touch ID, Windows Hello, a passkey: the way a device unlocks. */
export const Fingerprint = (p: Props) => (
  <Stroke {...p}>
    <path d="M12 11c0 3.5-.5 6-2 8.5" />
    <path d="M8.6 6.6A6 6 0 0 1 18 11c0 2-.2 4.2-.9 6.5" />
    <path d="M6.2 9.4A6 6 0 0 0 6 11c0 2-.4 3.6-1.1 5" />
    <path d="M9 11a3 3 0 0 1 6 0c0 2.6-.4 5.2-1.4 7.6" />
  </Stroke>
);

/** Move to cloud: up into the cloud. */
export const CloudUp = (p: Props) => (
  <Stroke {...p}>
    <path d="M16 16l-4-4-4 4" />
    <path d="M12 12v9" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </Stroke>
);

export const Cloud = (p: Props) => (
  <Stroke {...p}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></Stroke>
);

export const Download = (p: Props) => (
  <Stroke {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </Stroke>
);

/** A browser somewhere: a new one asking for the keys. */
export const Globe = (p: Props) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Stroke>
);

/** The vault open in this browser: the lock's bow lifted. */
export const Unlock = (p: Props) => (
  <Stroke {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.9-1" />
  </Stroke>
);

/** The vault password (0.1.26): a field of hidden characters. */
export const Password = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="7" width="18" height="10" rx="2" />
    <path d="M7 12h.01M11 12h.01M15 12h.01" />
  </Stroke>
);

/** Something to look at again: an exclamation mark. */
export const Alert = (p: Props) => (
  <Stroke {...p} width={2.6}><path d="M12 7v6M12 17h.01" /></Stroke>
);

// The log of a machine (0.1.20).

/** A clock with an arrow back round it: the Logs folder, a log's tab. */
export const History = (p: Props) => (
  <Stroke {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 7.5V12l3 2" />
  </Stroke>
);

/** Three lines: what a command printed, in its terminal. */
export const Lines = (p: Props) => (
  <Stroke {...p}><path d="M5 6h14M5 11h14M5 16h9" /></Stroke>
);

/** A note with its corner turned: a note after a command. */
export const NoteAdd = (p: Props) => (
  <Stroke {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9l-6 7H6a2 2 0 0 1-2-2z" />
    <path d="M14 21v-5a2 2 0 0 1 2-2h4" />
    <path d="M8 8h8M8 12h5" />
  </Stroke>
);

/** A speech bubble: Reply. */
export const Bubble = (p: Props) => (
  <Stroke {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" /></Stroke>
);

/** An eraser: Redact. */
export const Erase = (p: Props) => (
  <Stroke {...p}>
    <path d="M7 21h10" />
    <path d="M5.5 13.5l7-7a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 18H8.5z" />
    <path d="M9 10l5 5" />
  </Stroke>
);

/** Two sparks: written by an AI. */
export const Spark = (p: Props) => (
  <Stroke {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 16l.6 1.4L21 18l-1.4.6L19 20l-.6-1.4L17 18l1.4-.6z" />
  </Stroke>
);

/** A calendar: Pick a day. */
export const Calendar = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Stroke>
);

/** An arrow down and one up: the order of a log's lines (0.1.21). */
export const Order = (p: Props) => (
  <Stroke {...p}>
    <path d="M8 5v14M5 16l3 3 3-3" />
    <path d="M16 19V5M13 8l3-3 3 3" />
  </Stroke>
);

/** A question in a circle: Get help in the account's menu (0.1.25). */
export const Help = (p: Props) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7" />
    <path d="M12 17.2h.01" />
  </Stroke>
);

/** An i in a circle: About us (0.1.25). */
export const Info = (p: Props) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <path d="M12 7.8h.01" />
  </Stroke>
);

/** An open book: the documentation (0.1.25). */
export const Book = (p: Props) => (
  <Stroke {...p}>
    <path d="M3 5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H3z" />
    <path d="M21 5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H21z" />
  </Stroke>
);

/** An envelope: Write to support (0.1.25). */
export const Mail = (p: Props) => (
  <Stroke {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </Stroke>
);

/** A paper plane: the channel in Telegram (0.1.25). */
export const Plane = (p: Props) => (
  <Stroke {...p}>
    <path d="M21 4L3 11l6.5 2.5L12 20z" />
    <path d="M9.5 13.5L21 4" />
  </Stroke>
);
