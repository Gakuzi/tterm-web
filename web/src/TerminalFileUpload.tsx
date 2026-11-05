import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  getTerminalSftpInfo,
  uploadFilesToTerminal,
  type SftpCredentials,
} from "./api";
import { useBriefly } from "./briefly";
import { copyToClipboard } from "./clipboard";
import { Check, Close, Copy, Folder, Server, Upload } from "./icons";

export interface TerminalFileUploadHandle {
  openFileDialog: () => void;
  openSftpModal: () => void;
}

export interface TerminalFileUploadProps {
  terminalId: string;
  machineName?: string;
  terminalLabel?: string;
  cwd?: string;
  notify: (text: string) => void;
  isEnded?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
}

export const TerminalFileUpload = forwardRef<
  TerminalFileUploadHandle,
  TerminalFileUploadProps
>(function TerminalFileUpload(props, ref) {
  const {
    terminalId,
    machineName,
    terminalLabel,
    cwd,
    notify,
    isEnded,
    containerRef,
    children,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [sftpModalOpen, setSftpModalOpen] = useState(false);

  const dragCounter = useRef(0);

  const cwdDisplay = cwd || "текущую папку терминала"; // i18n-ignore

  // Handle uploading files array
  const handleUploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0 || isEnded) return;

      const targetDir = cwd && cwd.trim() ? cwd.trim() : undefined;
      const targetLabel = cwd ? cwd : "папку терминала"; // i18n-ignore

      setUploading(true);
      setUploadProgress(0);
      const nameSummary =
        files.length === 1
          ? files[0].name
          : `${files.length} файлов`; // i18n-ignore
      setUploadFileName(nameSummary);

      try {
        const res = await uploadFilesToTerminal(
          terminalId,
          files,
          targetDir,
          (percent) => {
            setUploadProgress(percent);
          }
        );

        setUploadProgress(100);
        const targetMach = res.files?.[0]?.machine_name || machineName || "машину"; // i18n-ignore
        const targetPath = res.files?.[0]?.dest_path || targetLabel;
        if (files.length === 1) {
          notify(`Файл "${files[0].name}" успешно загружен на ${targetMach} (${targetPath})`); // i18n-ignore
        } else {
          notify(`Успешно загружено файлов: ${files.length} на ${targetMach} (${targetPath})`); // i18n-ignore
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка при загрузке файлов"; // i18n-ignore
        notify(msg);
      } finally {
        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
          setUploadFileName("");
        }, 1200);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [terminalId, cwd, isEnded, notify]
  );

  // File picker handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleUploadFiles(e.target.files);
    }
  };

  const openFileDialog = useCallback(() => {
    if (isEnded) {
      notify("Терминал завершён. Загрузка файлов недоступна."); // i18n-ignore
      return;
    }
    fileInputRef.current?.click();
  }, [isEnded, notify]);

  const openSftpModal = useCallback(() => {
    setSftpModalOpen(true);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      openFileDialog,
      openSftpModal,
    }),
    [openFileDialog, openSftpModal]
  );

  // Attach drag events to containerRef if provided
  useEffect(() => {
    const el = containerRef?.current;
    if (!el || isEnded) return;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) { // i18n-ignore
        setIsDragging(true);
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDragging(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void handleUploadFiles(e.dataTransfer.files);
      }
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [containerRef, isEnded, handleUploadFiles]);

  return (
    <>
      {children}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      {isDragging && (
        <div className="terminal-dropzone-overlay" aria-live="polite">
          <div className="terminal-dropzone-content">
            <div className="dropzone-animated-icon">
              <Upload size={36} />
            </div>
            <h3 className="dropzone-title">
              {/* i18n-ignore */}
              📥 Отпустите файлы для загрузки на {machineName || "ноду"}: в {cwdDisplay}
            </h3>
            <p className="dropzone-subtitle">
              {/* i18n-ignore */}
              Файлы сохраняются прямо в файловую систему машины {machineName || "терминала"}
            </p>
          </div>
        </div>
      )}

      {uploading && (
        <div className="file-upload-progress" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="file-upload-progress-header">
            <div className="file-upload-progress-title">
              <Upload size={14} />
              <span>{/* i18n-ignore */}Загрузка: {uploadFileName}</span>
            </div>
            <span className="file-upload-progress-pct">{uploadProgress}%</span>
          </div>
          <div className="file-upload-progress-track">
            <div
              className="file-upload-progress-bar"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {sftpModalOpen && (
        <SftpModal
          terminalId={terminalId}
          machineName={machineName}
          terminalLabel={terminalLabel}
          cwd={cwd}
          onClose={() => setSftpModalOpen(false)}
          notify={notify}
        />
      )}
    </>
  );
});

interface SftpModalProps {
  terminalId: string;
  machineName?: string;
  terminalLabel?: string;
  cwd?: string;
  onClose: () => void;
  notify: (text: string) => void;
}

export function SftpModal(props: SftpModalProps) {
  const { terminalId, machineName, terminalLabel, cwd, onClose, notify } = props;
  const [loading, setLoading] = useState(true);
  const [sftp, setSftp] = useState<SftpCredentials | null>(null);

  const [copiedUrl, showCopiedUrl] = useBriefly<boolean>();
  const [copiedCmd, showCopiedCmd] = useBriefly<boolean>();
  const [copiedHost, showCopiedHost] = useBriefly<boolean>();

  useEffect(() => {
    let live = true;
    getTerminalSftpInfo(terminalId, machineName)
      .then((info) => {
        if (!live) return;
        setSftp(info);
      })
      .catch(() => {
        // Fallback default
        if (!live) return;
        const fallbackHost = typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "localhost";
        setSftp({
          host: fallbackHost,
          port: 22,
          username: "developer",
          sftp_url: `sftp://developer@${fallbackHost}:22`,
          web_dav_hint: "Доступно через SSH/SFTP и Web-загрузку", // i18n-ignore
          default_dir: "/home/developer",
          terminal_id: terminalId,
          auth_methods: ["ssh_key", "password"],
          command_hint: `sftp -P 22 developer@${fallbackHost}`,
          ftp_command_hint: `ftp ${fallbackHost}`,
        });
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [terminalId, machineName]);

  const copyVal = async (text: string, showFn: (v: boolean) => void) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      showFn(true);
      notify("Скопировано в буфер обмена"); // i18n-ignore
    } else {
      notify("Не удалось скопировать"); // i18n-ignore
    }
  };

  const targetDir = cwd && cwd.trim() ? cwd.trim() : (sftp?.default_dir || "/tmp");
  const hostVal = sftp?.host || (typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "localhost");
  const portVal = sftp?.port ?? 22;
  const userVal = sftp?.username || "developer";
  const sftpUrlVal = sftp?.sftp_url || `sftp://${userVal}@${hostVal}:${portVal}`;
  const sftpCmdVal = sftp?.command_hint || `sftp -P ${portVal} ${userVal}@${hostVal}`;

  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="dialog sftp-modal-box"
        role="dialog"
        aria-modal="true"
      >
        <header className="dialog-head">
          <div className="dialog-title-group">
            <h2 className="dialog-title">
              {/* i18n-ignore */}
              📁 Параметры FTP / SFTP подключения
            </h2>
            <p className="dialog-subtitle">
              {/* i18n-ignore */}
              Прямой доступ к файловой системе {terminalLabel || "терминала"} на {machineName || "сервере"}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть" // i18n-ignore
          >
            <Close size={18} />
          </button>
        </header>

        <div className="dialog-body sftp-modal-content">
          {loading ? (
            <div className="sftp-loading">
              <span className="spinner" aria-hidden="true" />
              <span>{/* i18n-ignore */}Загрузка параметров подключения…</span>
            </div>
          ) : (
            <>
              <div className="sftp-params-grid">
                <div className="sftp-param-card">
                  <span className="sftp-param-label">{/* i18n-ignore */}Хост (IP / Домен)</span>
                  <div className="sftp-param-value-row">
                    <span className="sftp-param-value">{hostVal}</span>
                    <button
                      type="button"
                      className="sftp-mini-copy-btn"
                      onClick={() => void copyVal(hostVal, showCopiedHost)}
                      title="Копировать хост" // i18n-ignore
                    >
                      {copiedHost ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div className="sftp-param-card">
                  <span className="sftp-param-label">{/* i18n-ignore */}Порт SFTP/SSH</span>
                  <span className="sftp-param-value">{portVal}</span>
                </div>

                <div className="sftp-param-card">
                  <span className="sftp-param-label">{/* i18n-ignore */}Пользователь (Login)</span>
                  <span className="sftp-param-value">{userVal}</span>
                </div>

                <div className="sftp-param-card">
                  <span className="sftp-param-label">{/* i18n-ignore */}Рабочий каталог</span>
                  <span className="sftp-param-value mono small">{targetDir}</span>
                </div>
              </div>

              <div className="sftp-field-group">
                <label className="field-label">
                  <Server size={14} />
                  <span>{/* i18n-ignore */}SFTP URL (для браузера, FileZilla, Cyberduck)</span>
                </label>
                <div className="input-with-action">
                  <input
                    type="text"
                    className="text-input mono"
                    readOnly
                    value={sftpUrlVal}
                  />
                  <button
                    type="button"
                    className="button-accent"
                    onClick={() => void copyVal(sftpUrlVal, showCopiedUrl)}
                  >
                    {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedUrl ? "Скопировано" : "Копировать URL"}</span> {/* i18n-ignore */}
                  </button>
                </div>
              </div>

              <div className="sftp-field-group">
                <label className="field-label">
                  <Folder size={14} />
                  <span>{/* i18n-ignore */}Команда для консоли / терминала</span>
                </label>
                <div className="input-with-action">
                  <input
                    type="text"
                    className="text-input mono"
                    readOnly
                    value={sftpCmdVal}
                  />
                  <button
                    type="button"
                    className="button-plain"
                    onClick={() => void copyVal(sftpCmdVal, showCopiedCmd)}
                  >
                    {copiedCmd ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedCmd ? "Скопировано" : "Копировать"}</span> {/* i18n-ignore */}
                  </button>
                </div>
              </div>

              <div className="sftp-instructions-card">
                <div className="sftp-inst-title">
                  {/* i18n-ignore */}
                  💡 Подключение через графические SFTP/FTP клиенты
                </div>
                <ul className="sftp-inst-list">
                  <li>
                    <strong>FileZilla / WinSCP / Cyberduck:</strong> {/* i18n-ignore */}
                    <span>{/* i18n-ignore */}Выберите протокол <code>SFTP</code>, введите хост <code>{hostVal}</code>, порт <code>{portVal}</code>, пользователя <code>{userVal}</code> и путь <code>{targetDir}</code>.</span>
                  </li>
                  <li>
                    <strong>Drag & Drop в браузере:</strong> {/* i18n-ignore */}
                    <span>{/* i18n-ignore */}Вы можете просто перетащить файл из папки компьютера прямо на экран терминала tTerm или нажать кнопку [Загрузить] в верхней панели.</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        <footer className="dialog-foot">
          <button type="button" className="button-accent" onClick={onClose}>
            {/* i18n-ignore */}
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
