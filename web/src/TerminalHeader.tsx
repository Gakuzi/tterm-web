import { useState } from "react";
import type { Me, TerminalInfo } from "./api";
import { Branch, Folder, Gear } from "./icons";
import { ModeToggle } from "./InputLine";
import { ProjectAccessDialog } from "./ProjectAccessDialog";

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

          <button
            type="button"
            className="strip-settings-btn"
            onClick={() => setAccessDialogOpen(true)}
            title="Настройки проекта, команды, Docker и терминала" // i18n-ignore
            aria-label="Настройки" // i18n-ignore
          >
            <Gear size={15} />
            <span className="strip-settings-text">{/* i18n-ignore */}Настройки</span>
          </button>
        </div>
      </div>

      {accessDialogOpen && (
        <ProjectAccessDialog
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
