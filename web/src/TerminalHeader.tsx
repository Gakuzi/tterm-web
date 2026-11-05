import { useState } from "react";
import type { Me, TerminalInfo } from "./api";
import { Branch, Folder, FolderOpen, Gear, Paperclip } from "./icons";
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
  onUploadClick?: () => void;
  onSftpClick?: () => void;
}

export function TerminalHeader(props: Props) {
  const {
    terminalId, info, machineName, terminalLabel, where, running, away,
    isEnded, mode, noBlocks, me, onChooseMode, notify,
    onUploadClick, onSftpClick,
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
              {!isEnded && onUploadClick && (
                <button
                  type="button"
                  className="strip-btn-attach"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUploadClick();
                  }}
                  title={`Прикрепить и загрузить файл в ${where}`} /* i18n-ignore */
                  aria-label={`Прикрепить файл в ${where}`} /* i18n-ignore */
                >
                  <Paperclip size={12} />
                </button>
              )}
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
          {!isEnded && onSftpClick && (
            <button
              type="button"
              className="strip-btn-sftp"
              onClick={onSftpClick}
              title={`Параметры SFTP / FTP подключения к ${machineName || "машине"}`} // i18n-ignore
              aria-label="SFTP / FTP" // i18n-ignore
            >
              <FolderOpen size={13} />
              <span className="strip-btn-text">{/* i18n-ignore */}SFTP/FTP</span>
            </button>
          )}

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
