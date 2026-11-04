import { useState } from "react";
import type { Me, TerminalInfo } from "./api";
import { Branch, Folder, Spark, People } from "./icons";
import { ModeToggle } from "./InputLine";
import { TerminalAccessDialog } from "./TerminalAccessDialog";

interface Props {
  terminalId: string;
  info: TerminalInfo | null;
  machineName?: string;
  terminalLabel: string;
  where: string;
  running: boolean;
  away: boolean;
  isEnded: boolean;
  mode: "line" | "classic";
  noBlocks?: string;
  me: Me;
  onChooseMode: (mode: "line" | "classic") => void;
  notify: (text: string) => void;
}

export function TerminalHeader(props: Props) {
  const {
    terminalId, info, machineName, terminalLabel, where, running, away,
    isEnded, mode, noBlocks, me, onChooseMode, notify,
  } = props;
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);

  const aiAccess = info?.aiAccess ?? true;
  const aiMode = info?.aiMode ?? "execute";

  const aiBadgeText = !aiAccess
    ? "🚫 Доступ ИИ отозван" // i18n-ignore
    : aiMode === "guard"
      ? "🛡️ Режим подтверждения" // i18n-ignore
      : aiMode === "readonly"
        ? "👁️ Только чтение" // i18n-ignore
        : "⚡ Доступ ИИ активен"; // i18n-ignore

  const aiBadgeClass = !aiAccess
    ? "ai-badge-revoked"
    : aiMode === "guard"
      ? "ai-badge-guard"
      : aiMode === "readonly"
        ? "ai-badge-readonly"
        : "ai-badge-active";

  return (
    <>
      <div className="terminal-header-strip">
        <div className="strip-left">
          <div className="strip-machine">
            <span className={`status-dot ${isEnded ? "ended" : away ? "away" : running ? "busy" : "online"}`} />
            <strong className="machine-title">{machineName || "Компьютер"}</strong> {/* i18n-ignore */}
            <span className="terminal-badge">{terminalLabel}</span>
          </div>

          {where && (
            <div className="strip-cwd" title={where}>
              <Folder size={12} />
              <span>{where}</span>
            </div>
          )}

          {info?.branch && (
            <div className="strip-branch">
              <Branch size={12} />
              <span>{info.branch}</span>
            </div>
          )}

          {running && !isEnded && (
            <span className="strip-running-pill">
              {/* i18n-ignore */}
              ⏳ Выполняется…
            </span>
          )}
        </div>

        <div className="strip-right">
          <div className="strip-me-badge" title="Текущий пользователь"> {/* i18n-ignore */}
            <span className="me-avatar">👤</span>
            <span className="me-name">{me.name || "Вы"}</span> {/* i18n-ignore */}
            <span className="me-role">{/* i18n-ignore */}Владелец</span>
          </div>

          <button
            type="button"
            className={`strip-ai-btn ${aiBadgeClass}`}
            onClick={() => setAccessDialogOpen(true)}
            title="Настройка прав и доступа ИИ-агентов (Antigravity, Cursor) к этому терминалу" // i18n-ignore
          >
            <Spark size={13} className="spark-icon" />
            <span className="ai-btn-text">{/* i18n-ignore */}🤖 Доступ ИИ и команды</span>
            <span className="ai-mode-pill">{aiBadgeText}</span>
          </button>

          <button
            type="button"
            className="strip-team-btn"
            onClick={() => setAccessDialogOpen(true)}
            title="Совместный доступ для коллег и команды" // i18n-ignore
          >
            <People size={13} />
            <span>{/* i18n-ignore */}👥 Команда</span>
          </button>

          {!isEnded && (
            <div className="strip-mode-toggle">
              <ModeToggle
                mode={mode}
                disabled={noBlocks}
                onLine={() => onChooseMode("line")}
                onClassic={() => onChooseMode("classic")}
              />
            </div>
          )}
        </div>
      </div>

      {accessDialogOpen && (
        <TerminalAccessDialog
          terminalId={terminalId}
          machineName={machineName || "Компьютер"} // i18n-ignore
          terminalLabel={terminalLabel}
          me={me}
          onClose={() => setAccessDialogOpen(false)}
          notify={notify}
        />
      )}
    </>
  );
}
