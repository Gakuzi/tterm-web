// One block of the feed: the command, how it ended, how long it took, where
// it ran, and its output. A finished block's output is text (see render.ts);
// the running one shows the live terminal in its place. From 0.1.20 the
// notes under it, as the machine's log has them, and Add a note; a command
// redacted in the log says who redacted it, when and why, in its place.

import {
  useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject,
} from "react";
import type { LogNote, Me, Redaction } from "./api";
import { useBriefly } from "./briefly";
import { useT } from "./i18n";
import {
  Branch, Check, Close, Collapse, Copy, CopyText, Cross, Expand, Link, NoteAdd, Person, Rerun,
  Spark, Stop,
} from "./icons";
import { plainly } from "./logday";
import { RedactedMark, Thread } from "./LogNotes";
import { markIn, marked } from "./marks";
import type { Rendered } from "./render";

/** Lines of a long output shown before "Show all". */
export const SHOW_LINES = 400;

export interface FeedBlock {
  key: string;
  seqStart: number;
  seqEnd: number | null;
  command: string;
  cwd: string;
  branch: string;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  /** running: the live terminal shows it; input: the shell has not started
   * it (a quote or a heredoc left open, or bash refused a ! in it) and its
   * screen is shown, to type into or stop; done: finished. */
  state: "running" | "input" | "done";
  cols: number;
  rendered: Rendered | null;
  /** Only the end of the output is here. */
  partial: boolean;
  /** The database dropped the middle of a very long output. */
  cut: boolean;
  /** In the database, so the whole output can be asked for. */
  stored: boolean;
  expanded: boolean;
  collapsed: boolean;
  /** Its line in the machine's log (0.1.20), once the core has it; the
   * notes under it; who redacted it, if someone did; and whether notes may
   * be written under it (not for blocks from before the log). */
  entry: number | null;
  notes: LogNote[];
  redacted: Redaction | null;
  canNote: boolean;
  author?: { name: string; kind: "user" | "agent" | "guest" };
}

/** What a block's copy buttons copy. */
type Copied = "block" | "output" | "link";

interface Props {
  block: FeedBlock;
  home: string;
  live: boolean;
  clipRef?: RefObject<HTMLDivElement | null>;
  clipHeight?: number;
  flash: boolean;
  /** Search opened this block (0.1.7): the words to mark in it. */
  found: string[] | null;
  /** The command with its prompt, and the output under it. The copies
   * answer whether the browser let the page copy; Run again, whether the
   * command went. */
  onCopyBlock: (block: FeedBlock) => Promise<boolean>;
  onCopyOutput: (block: FeedBlock) => Promise<boolean>;
  onRunAgain: (block: FeedBlock) => boolean;
  onCopyLink: (block: FeedBlock) => Promise<boolean>;
  onToggle: (block: FeedBlock) => void;
  onShowAll: (block: FeedBlock) => void;
  onStop: () => void;
  me: Me;
  /** A note under the block (0.1.20): whether it was saved. */
  onNote: (block: FeedBlock, text: string) => Promise<boolean>;
  onRunFix?: (command: string) => void;
}

export function diagnoseError(command: string, exitCode: number | null): { reason: string; fix?: string } {
  const cmd = command.trim();
  const first = cmd.split(/\s+/)[0] || "";

  if (exitCode === 127) {
    return {
      reason: `Команда «${first}» не найдена в системе. Проверьте правильность написания или установите нужный пакет.`, // i18n-ignore
      fix: `which ${first}`,
    };
  }
  if (exitCode === 126) {
    return {
      reason: `Недостаточно прав для запуска «${first}» (Permission Denied).`, // i18n-ignore
      fix: `sudo ${cmd}`,
    };
  }
  if (exitCode === 130) {
    return {
      reason: "Команда была прервана пользователем комбинацией клавиш Ctrl+C (сигнал SIGINT).", // i18n-ignore
    };
  }
  if (exitCode === 137) {
    return {
      reason: "Процесс принудительно остановлен системой (сигнал SIGKILL / нехватка памяти Out of Memory).", // i18n-ignore
    };
  }
  if (cmd.startsWith("git push")) {
    return {
      reason: "Отправка на GitHub отклонена. На удалённом сервере есть новые коммиты, которых нет в вашей локальной копии.", // i18n-ignore
      fix: "git pull --rebase",
    };
  }
  if (cmd.startsWith("git commit") && cmd.includes("-m")) {
    return {
      reason: "Не удалось создать коммит. Возможно, файлы не были добавлены в индекс через git add.", // i18n-ignore
      fix: `git add -A && ${cmd}`,
    };
  }
  if (cmd.startsWith("docker ") && !cmd.startsWith("sudo ")) {
    return {
      reason: "Для работы с Docker требуются права суперпользователя или добавление в группу docker.", // i18n-ignore
      fix: `sudo ${cmd}`,
    };
  }
  if (cmd.startsWith("apt ") || cmd.startsWith("apt-get ")) {
    if (!cmd.startsWith("sudo ")) {
      return {
        reason: "Для установки и обновления пакетов apt требуются права администратора.", // i18n-ignore
        fix: `sudo ${cmd}`,
      };
    }
    return {
      reason: "Ошибка базы данных apt. Возможно, процесс заблокирован другим активным обновлением.", // i18n-ignore
      fix: "sudo fuser -vki /var/lib/dpkg/lock-frontend",
    };
  }
  if (cmd.startsWith("systemctl ") && !cmd.startsWith("sudo ")) {
    return {
      reason: "Управление службами systemd требует повышенных привилегий.", // i18n-ignore
      fix: `sudo ${cmd}`,
    };
  }
  return {
    reason: `Команда завершилась с ошибкой (код возврата: ${exitCode}). Проверьте параметры запуска.`, // i18n-ignore
    fix: cmd.startsWith("sudo ") ? undefined : `sudo ${cmd}`,
  };
}

export function shortPath(cwd: string, home?: string): string {
  if (!home || !cwd) return cwd;
  if (cwd === home) return "~";
  return cwd.startsWith(home + "/") ? "~" + cwd.slice(home.length) : cwd;
}

export function duration(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** 0:41, 12:05, 1:02:33: how long a running command has been at it. */
function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function clock(at: number | null): string {
  if (!at) return "";
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:` +
    `${String(d.getMinutes()).padStart(2, "0")}`;
}

function Ticking({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span>{elapsed(now - since)}</span>;
}

export function BlockView(props: Props) {
  const { block, home, live } = props;
  const t = useT();
  const running = block.state !== "done";
  const failed = block.state === "done" && block.exitCode !== null &&
    block.exitCode !== 0;
  const [aiHelpOpen, setAiHelpOpen] = useState(false);
  const lines = block.rendered?.lines ?? [];
  const shown = block.expanded ? lines : lines.slice(-SHOW_LINES);
  const hidden = lines.length - shown.length;
  // A full-screen program (top, vim) drew on the second screen and left
  // nothing on the main one: the whole output would show nothing either.
  const screenOnly = !!block.rendered?.alt && lines.length === 0;
  const more = !screenOnly && (hidden > 0 || ((block.partial || block.cut ||
    block.rendered?.limited) && block.stored && !block.expanded));
  // The words search found, marked in the output as drawn (0.1.7). Drawn
  // again (Show all), it is marked again.
  const out = useRef<HTMLPreElement>(null);
  const found = props.found;
  const html = shown.map((l) => l.html).join("\n");
  useLayoutEffect(() => {
    const pre = out.current;
    if (!pre) return;
    // Marks of another search go first: the output as it was drawn.
    const marks = pre.querySelectorAll("mark.found-mark");
    if (marks.length) {
      marks.forEach((m) => m.replaceWith(m.textContent ?? ""));
      pre.normalize();
    }
    if (found) markIn(pre, found, "found-mark");
  }, [found, html]);

  // What a pressed button did (0.1.13): a copy, a check in the button's own
  // colour for a moment, or a red cross when the browser refused (the toast
  // says what to do then); Run again, one turn of its arrow, when the
  // command went. Meanwhile the row of buttons stays, with the mouse gone.
  const [copied, showCopied] = useBriefly<{ what: Copied; ok: boolean }>();
  const [turned, showTurn] = useBriefly<number>();
  const turns = useRef(0);
  // A note being written under it (0.1.20).
  const [writing, setWriting] = useState(false);
  const redacted = block.redacted;
  const notable = block.canNote && block.seqStart >= 0 && block.stored;
  const copy = (what: Copied, done: Promise<boolean>) => {
    void done.then((ok) => showCopied({ what, ok }));
  };
  const icon = (what: Copied, normal: ReactNode) => copied?.what !== what ? normal
    : copied.ok ? <Check size={15} className="pressed-mark" />
    : <Close size={15} className="pressed-mark" />;
  const failedHere = (what: Copied) =>
    copied?.what === what && !copied.ok ? "copy-failed" : undefined;

  const command = block.command;
  const what = redacted ? t("block.state_redacted")
    : block.state === "input" ? t("block.state_input", { command })
    : running ? t("block.state_running", { command })
    : failed ? t("block.state_failed", { command, code: String(block.exitCode) })
    : block.exitCode === 0 ? t("block.state_finished", { command })
    : t("block.state_ended", { command });

  let mark;
  if (running) {
    mark = <span className="block-spinner" aria-hidden="true" />;
  } else if (failed) {
    mark = <Cross size={10} className="block-fail" />;
  } else {
    mark = <span className={block.exitCode === 0 ? "block-dot ok" : "block-dot"}
      aria-hidden="true" />;
  }

  const authorClass = block.author?.kind ? ` block-by-${block.author.kind}` : "";

  return (
    <section id={`b${block.seqStart}`}
      className={"block" + authorClass + (running ? " live" : "") + (failed ? " failed" : "") +
        (props.flash ? " flash" : "") + (found ? " found" : "")}
      aria-label={what}>
      <div className="block-head">
        {mark}
        {redacted ? <RedactedMark redacted={redacted} me={props.me} /> : (
          <code className="block-command">
            {found ? marked(plainly(block.command), found, "found-mark")
              : plainly(block.command)}
          </code>
        )}
        <span className="block-meta">
          {block.author && (
            <span className={`chip-author chip-author-${block.author.kind}`}>
              {block.author.kind === "agent" ? (
                <>
                  <Spark size={11} />
                  <span>{block.author.name || "ИИ-Агент"}</span> {/* i18n-ignore */}
                </>
              ) : block.author.kind === "guest" ? (
                <span>{/* i18n-ignore */}👥 {block.author.name || "Гость"}</span>
              ) : (
                <>
                  <Person size={11} />
                  <span>{block.author.name || "Вы"}</span> {/* i18n-ignore */}
                </>
              )}
            </span>
          )}
          {found && found.length > 0 && (
            <span className="found-pill">{t("block.found")}</span>
          )}
          {block.state === "input" && (
            <span className="amber" title={t("block.not_started_title")}>
              {t("block.not_started")}
            </span>
          )}
          {block.state === "running" && <span className="amber">{t("block.running")}</span>}
          {failed && (
            <>
              <span className="red">{t("block.exit", { code: String(block.exitCode) })}</span>
              <button
                type="button"
                className="chip-ai-help"
                title="Помощь ИИ: объяснить причину ошибки и предложить решение" // i18n-ignore
                onClick={() => setAiHelpOpen(!aiHelpOpen)}
              >
                <Spark size={11} />
                <span>Помощь ИИ</span> {/* i18n-ignore */}
              </button>
            </>
          )}
          {running && block.startedAt ? <Ticking since={block.startedAt} />
            : block.startedAt && block.finishedAt
              ? <span>{duration(block.finishedAt - block.startedAt)}</span>
              : null}
          {block.cwd && <span>{shortPath(block.cwd, home)}</span>}
          {block.branch && (
            <span className="block-branch"><Branch size={12} />{block.branch}</span>
          )}
          {!running && <span>{clock(block.startedAt)}</span>}
        </span>
        {running ? (
          <button type="button" className="block-stop" onClick={props.onStop}
            title={t("block.stop_title")}>
            <Stop size={11} />
            {t("block.stop")}
            {/* i18n-ignore */}
            <kbd>⌃C</kbd>
          </button>
        ) : redacted ? (
          <div role="group" aria-label={t("block.actions")}
            className={"block-actions" + (copied ? " acted" : "")}>
            {notable && (
              <button type="button" aria-label={t("log.add_note")}
                title={t("log.add_note_title")} className={writing ? "on" : undefined}
                onClick={() => setWriting(true)}>
                <NoteAdd size={15} />
              </button>
            )}
            <button type="button" aria-label={t("block.copy_link")}
              title={t("block.copy_link")} className={failedHere("link")}
              onClick={() => copy("link", props.onCopyLink(block))}>
              {icon("link", <Link size={15} />)}
            </button>
            <span className="visually-hidden" role="status">
              {copied ? (copied.ok ? t("common.copied") : t("block.not_copied")) : ""}
            </span>
          </div>
        ) : (
          <div role="group" aria-label={t("block.actions")}
            className={"block-actions" + (copied || turned !== null ? " acted" : "")}>
            <button type="button" aria-label={t("block.copy_block")}
              title={t("block.copy_block")} className={failedHere("block")}
              onClick={() => copy("block", props.onCopyBlock(block))}>
              {icon("block", <Copy size={15} />)}
            </button>
            <button type="button" aria-label={t("block.copy_output")}
              title={t("block.copy_output_title")}
              className={failedHere("output")}
              onClick={() => copy("output", props.onCopyOutput(block))}>
              {icon("output", <CopyText size={15} />)}
            </button>
            <button type="button" aria-label={t("block.run_again")} title={t("block.run_again")}
              className={turned !== null ? "turn" : undefined}
              onClick={() => {
                if (props.onRunAgain(block)) showTurn(++turns.current);
              }}>
              {/* A new key each time: the turn plays again. */}
              <Rerun key={turned ?? 0} size={15} />
            </button>
            <button type="button" aria-label={t("block.copy_link")}
              title={t("block.copy_link")} className={failedHere("link")}
              onClick={() => copy("link", props.onCopyLink(block))}>
              {icon("link", <Link size={15} />)}
            </button>
            {notable && (
              <button type="button" aria-label={t("log.add_note")}
                title={t("log.add_note_title")} className={writing ? "on" : undefined}
                onClick={() => setWriting(true)}>
                <NoteAdd size={15} />
              </button>
            )}
            <button type="button"
              aria-label={block.collapsed ? t("block.expand") : t("block.collapse")}
              title={block.collapsed ? t("block.expand") : t("block.collapse")}
              onClick={() => props.onToggle(block)}>
              {block.collapsed ? <Expand size={15} /> : <Collapse size={15} />}
            </button>
            <span className="visually-hidden" role="status">
              {copied ? (copied.ok ? t("common.copied") : t("block.not_copied")) : ""}
            </span>
          </div>
        )}
      </div>
      {failed && aiHelpOpen && (() => {
        const diag = diagnoseError(block.command, block.exitCode);
        return (
          <div className="block-ai-assist">
            <div className="block-ai-head">
              <Spark size={13} />
              <span>Анализ ошибки от ИИ</span> {/* i18n-ignore */}
            </div>
            <div className="block-ai-desc">{diag.reason}</div>
            <div className="block-ai-fix-row">
              {diag.fix && props.onRunFix && (
                <button
                  type="button"
                  className="ai-fix-button"
                  onClick={() => props.onRunFix?.(diag.fix!)}
                  title="Выполнить команду исправления в терминале" // i18n-ignore
                >
                  <Spark size={12} />
                  <span>Исправить:</span> {/* i18n-ignore */}
                  <code>{diag.fix}</code> {/* i18n-ignore */}
                </button>
              )}
              <button
                type="button"
                className="button-plain small"
                onClick={() => setAiHelpOpen(false)}
              >
                Скрыть {/* i18n-ignore */}
              </button>
            </div>
          </div>
        );
      })()}
      {live ? (
        <div className="live-clip" ref={props.clipRef}
          style={{ height: props.clipHeight ?? 0 }} />
      ) : redacted ? null : block.collapsed ? (
        lines.length > 0 && (
          <button type="button" className="block-folded"
            onClick={() => props.onToggle(block)}>
            {t("block.lines_hidden", { n: lines.length })}
          </button>
        )
      ) : (
        <>
          {more && (
            <button type="button" className="block-more"
              onClick={() => props.onShowAll(block)}>
              {hidden > 0 ? t("block.show_earlier", { n: hidden })
                : t("block.show_whole")}
            </button>
          )}
          {shown.length > 0 && (
            <pre className="out" ref={out}
              dangerouslySetInnerHTML={{ __html: html }} />
          )}
          {block.state === "done" && block.rendered === null && (
            <span className="block-pending" aria-hidden="true">…</span>
          )}
        </>
      )}
      {!live && (
        <Thread notes={block.notes} me={props.me} canWrite={notable}
          writing={writing} onWrite={() => setWriting(true)}
          onCancel={() => setWriting(false)}
          onSave={async (text) => {
            const saved = await props.onNote(block, text);
            if (saved) setWriting(false);
            return saved;
          }}
          className="block-note" />
      )}
    </section>
  );
}
