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
  Bell, Branch, Check, Close, Collapse, Copy, CopyText, Cross, Expand, Link, NoteAdd, Person, Rerun,
  Spark, Stop,
} from "./icons";
import { plainly } from "./logday";
import { RedactedMark, Thread } from "./LogNotes";
import { markIn, marked } from "./marks";
import {
  isBlockWatched, notifyCommandCompleted,
  requestNotificationPermission, setBlockWatched,
} from "./notifications";
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
  notify?: (text: string) => void;
}

export function diagnoseError(
  command: string,
  exitCode: number | null,
  renderedLines: unknown[] = []
): { reason: string; fix?: string } {
  const cmd = command.trim();
  const first = cmd.split(/\s+/)[0] || "";

  // Combine raw text from rendered lines for deep context analysis
  const fullText = renderedLines
    .map((l: any) => (typeof l === "string" ? l : (l && typeof l === "object" && "text" in l ? l.text : String(l || ""))))
    .join("\n");
  const plainText = fullText.replace(/<[^>]+>/g, "").trim();

  // 1. Specific Git Context Analysis
  if (cmd.startsWith("git ") || plainText.includes("fatal:") || plainText.includes("error:")) {
    // Missing Git author identity
    if (
      plainText.includes("Please tell me who you are") ||
      plainText.includes("unable to auto-detect email address") ||
      (plainText.includes("user.email") && plainText.includes("user.name"))
    ) {
      return {
        reason: "В Git не настроены имя и email автора коммитов. Система требует указать автора перед созданием коммита.", // i18n-ignore
        fix: 'git config --global user.name "Евгений Климов" && git config --global user.email "eklimov84@xmail.ru"',
      };
    }

    // Dubious ownership in repository
    if (plainText.includes("detected dubious ownership in repository")) {
      return {
        reason: "Git заблокировал доступ к репозиторию из соображений безопасности (каталог принадлежит другому пользователю или контейнеру).", // i18n-ignore
        fix: 'git config --global --add safe.directory "*"',
      };
    }

    // Missing upstream branch
    if (
      plainText.includes("has no upstream branch") ||
      plainText.includes("set-upstream") ||
      (cmd.startsWith("git push") && plainText.includes("fatal: The current branch"))
    ) {
      const branchMatch = plainText.match(/git push --set-upstream\s+(\S+)\s+(\S+)/);
      const fixCmd = branchMatch ? branchMatch[0] : "git push -u origin HEAD";
      return {
        reason: "Текущая ветка ещё не опубликована на GitHub и не имеет связанной удалённой (upstream) ветки.", // i18n-ignore
        fix: fixCmd,
      };
    }

    // Nothing to commit
    if (
      plainText.includes("nothing to commit, working tree clean") ||
      plainText.includes("no changes added to commit")
    ) {
      return {
        reason: "Нет измененных файлов для коммита: рабочая директория чиста или изменения не были добавлены в индекс через git add.", // i18n-ignore
        fix: "git status",
      };
    }

    // Local changes would be overwritten by checkout / merge / pull
    if (
      plainText.includes("Your local changes to the following files would be overwritten") ||
      plainText.includes("Please commit your changes or stash them")
    ) {
      return {
        reason: "В рабочей директории есть незакоммиченные локальные изменения, которые конфликтуют с обновлением. Сохраните их во временный стек или закоммитьте.", // i18n-ignore
        fix: "git stash",
      };
    }

    // Merge conflicts
    if (plainText.includes("CONFLICT (content)") || plainText.includes("Automatic merge failed; fix conflicts")) {
      return {
        reason: "Обнаружен конфликт слияния файлов. Автоматическое объединение невозможно, требуется разрешить конфликты вручную.", // i18n-ignore
        fix: "git status",
      };
    }

    // Stale Git lock file
    if (plainText.includes("index.lock': File exists") || plainText.includes("Unable to create") && plainText.includes(".git/index.lock")) {
      return {
        reason: "Файл блокировки .git/index.lock остался от предыдущего процесса Git. Другая команда либо ещё выполняется, либо аварийно завершилась.", // i18n-ignore
        fix: "rm -f .git/index.lock",
      };
    }

    // Push rejected (remote has new commits)
    if (
      plainText.includes("[rejected]") ||
      plainText.includes("fetch first") ||
      plainText.includes("Updates were rejected because the remote contains work")
    ) {
      return {
        reason: "Отправка на GitHub отклонена: на удалённом сервере есть новые коммиты, которых нет в локальной копии. Объедините изменения перед отправкой.", // i18n-ignore
        fix: "git pull --rebase",
      };
    }

    // SSH Permission denied
    if (
      plainText.includes("Permission denied (publickey)") ||
      plainText.includes("Could not read from remote repository")
    ) {
      return {
        reason: "Ошибка SSH-аутентификации с GitHub. Проверьте подключение SSH-ключа или настройте HTTPS-доступ с токеном.", // i18n-ignore
        fix: "ssh -T git@github.com",
      };
    }

    // Not a git repository
    if (plainText.includes("not a git repository")) {
      return {
        reason: "Текущая директория не является Git-репозиторием. Перейдите в каталог проекта (/opt/tterm-server) или инициализируйте репозиторий через git init.", // i18n-ignore
        fix: "cd /opt/tterm-server",
      };
    }
  }

  // 2. Docker & Container Context Analysis
  if (cmd.startsWith("docker ") || plainText.includes("docker")) {
    if (plainText.includes("Cannot connect to the Docker daemon") || plainText.includes("Is the docker daemon running?")) {
      return {
        reason: "Служба Docker не запущена или демон остановлен в операционной системе.", // i18n-ignore
        fix: "sudo systemctl start docker",
      };
    }
    if (plainText.includes("permission denied while trying to connect to the Docker daemon socket")) {
      return {
        reason: "У текущего пользователя нет прав доступа к сокету docker.sock. Требуется sudo или добавление в группу docker.", // i18n-ignore
        fix: `sudo ${cmd}`,
      };
    }
    if (plainText.includes("No such container") || plainText.includes("Error: No such container")) {
      return {
        reason: "Указанный Docker-контейнер не найден или был удалён.", // i18n-ignore
        fix: "docker ps -a",
      };
    }
    if (cmd.startsWith("docker ") && !cmd.startsWith("sudo ") && exitCode === 1) {
      return {
        reason: "Команда Docker завершилась с ошибкой. Проверьте права доступа и состояние контейнеров.", // i18n-ignore
        fix: `sudo ${cmd}`,
      };
    }
  }

  // 3. Port & Networking Conflicts
  if (
    plainText.includes("Address already in use") ||
    plainText.includes("bind: address already in use") ||
    plainText.includes("port is already allocated")
  ) {
    return {
      reason: "Сетевой порт уже занят другим запущенным приложением или контейнером на этой машине.", // i18n-ignore
      fix: "lsof -i -P -n | grep LISTEN",
    };
  }

  // 4. System Package Manager (APT / DPKG)
  if (cmd.startsWith("apt ") || cmd.startsWith("apt-get ") || plainText.includes("dpkg")) {
    if (plainText.includes("Could not get lock") || plainText.includes("Unable to acquire the dpkg frontend lock")) {
      return {
        reason: "Менеджер пакетов APT заблокирован другим активным системным процессом обновления.", // i18n-ignore
        fix: "sudo fuser -vki /var/lib/dpkg/lock-frontend",
      };
    }
    if (!cmd.startsWith("sudo ")) {
      return {
        reason: "Установка и обновление системных пакетов требует прав суперпользователя.", // i18n-ignore
        fix: `sudo ${cmd}`,
      };
    }
  }

  // 5. Systemd Services
  if (cmd.startsWith("systemctl ") && !cmd.startsWith("sudo ")) {
    return {
      reason: "Управление системными службами systemd требует повышенных привилегий.", // i18n-ignore
      fix: `sudo ${cmd}`,
    };
  }

  // 6. Generic POSIX Signals & Exit Codes
  if (exitCode === 127 || plainText.includes("command not found")) {
    return {
      reason: `Команда «${first}» не найдена в операционной системе. Проверьте правильность написания или установите пакет.`, // i18n-ignore
      fix: `which ${first}`,
    };
  }
  if (exitCode === 126 || (plainText.includes("Permission denied") && !cmd.startsWith("git "))) {
    return {
      reason: `Недостаточно прав для запуска «${first}» (Permission Denied). Проверьте права на исполнение или запустите через sudo.`, // i18n-ignore
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
      reason: "Процесс принудительно остановлен системой (сигнал SIGKILL / Out of Memory / превышение лимитов ресурсов).", // i18n-ignore
    };
  }

  // 7. Context Extraction from Error Output
  const errorLines = plainText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("error:") || l.startsWith("fatal:") || l.startsWith("Error:") || l.startsWith("Exception:"));

  if (errorLines.length > 0) {
    return {
      reason: `Ошибка: ${errorLines[0]}`, // i18n-ignore
      fix: cmd.startsWith("git ") ? undefined : (cmd.startsWith("sudo ") ? undefined : `sudo ${cmd}`),
    };
  }

  return {
    reason: `Команда завершилась с ошибкой (код возврата: ${exitCode}). Проверьте параметры запуска.`, // i18n-ignore
    fix: cmd.startsWith("git ") ? undefined : (cmd.startsWith("sudo ") ? undefined : `sudo ${cmd}`),
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
  const [bellActive, setBellActive] = useState(() => isBlockWatched(block.key));
  const wasRunning = useRef(running);

  useEffect(() => {
    setBellActive(isBlockWatched(block.key));
  }, [block.key]);

  useEffect(() => {
    if (wasRunning.current && !running) {
      const durationSec = block.startedAt && block.finishedAt
        ? Math.max(0, Math.round((block.finishedAt - block.startedAt) / 1000))
        : 0;
      notifyCommandCompleted({
        command: block.command,
        exitCode: block.exitCode,
        durationSec,
        blockId: block.key,
        inAppNotify: props.notify,
      });
      setBellActive(false);
    }
    wasRunning.current = running;
  }, [running, block.command, block.exitCode, block.key, block.startedAt, block.finishedAt, props.notify]);

  const toggleBell = async () => {
    const next = !bellActive;
    if (next) {
      await requestNotificationPermission();
    }
    setBlockWatched(block.key, next, {
      command: block.command,
      startedAt: block.startedAt ?? Date.now(),
    });
    setBellActive(next);
  };

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
                <span>👥 <span>{/* i18n-ignore */ block.author.name || "Гость"}</span></span>
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
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className={`button-ghost small ${bellActive ? "pressed" : ""}`}
              onClick={toggleBell}
              title={bellActive ? "Уведомление при завершении активно" /* i18n-ignore */ : "Уведомить push при завершении" /* i18n-ignore */}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: bellActive ? "#a855f7" : undefined,
                background: bellActive ? "rgba(168, 85, 247, 0.15)" : undefined,
                padding: "2px 8px",
                fontSize: 11,
              }}
            >
              <Bell size={12} />
              <span>{bellActive ? "Уведомлю 🔔" /* i18n-ignore */ : "🔔" /* i18n-ignore */}</span>
            </button>
            <button type="button" className="block-stop" onClick={props.onStop}
              title={t("block.stop_title")}>
              <Stop size={11} />
              <span>{t("block.stop")}</span>
              {/* i18n-ignore */}
              <kbd>⌃C</kbd>
            </button>
          </div>
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
        const diag = diagnoseError(block.command, block.exitCode, block.rendered?.lines || []);
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
