import { useState } from "react";
import { detectClientOS, type ClientOS } from "./platform";
import { Check, Close, Computer, Copy, Download } from "./icons";
import { useBriefly } from "./briefly";
import { copyToClipboard } from "./clipboard";

export function ClientInstallerBanner() {
  const [detectedOs] = useState<ClientOS>(() => detectClientOS());
  const [selectedOs, setSelectedOs] = useState<ClientOS>(() => (detectedOs === "other" ? "windows" : detectedOs));
  const [dismissed, setDismissed] = useState(false);
  const [copied, showCopied] = useBriefly<boolean>();

  if (dismissed) return null;

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) showCopied(true);
  };

  // i18n-ignore
  const origin = window.location.origin;
  // i18n-ignore
  const windowsPsCmd = `powershell -ExecutionPolicy Bypass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iwr -useb ${origin}/install_computer.ps1 | iex"`;
  // i18n-ignore
  const linuxCmd = `curl -sSL ${origin}/install.sh | bash`;

  return (
    <div className="client-installer-banner" style={{
      margin: "0 0 20px 0",
      padding: "16px 20px",
      borderRadius: "12px",
      background: "var(--raised)",
      border: "1px solid var(--line)",
      boxShadow: "var(--shadow)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Computer size={18} />
          <strong style={{ color: "var(--ink)" }}>Подключение локальной машины к tTerm {/* i18n-ignore */}</strong>
          {detectedOs === selectedOs && (
            <span style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 6,
              background: "var(--green-tint)",
              color: "var(--green-ink)",
              border: "1px solid var(--green)"
            }}>
              Определена ОС: {selectedOs} {/* i18n-ignore */}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--surface)", borderRadius: 6, padding: 2, border: "1px solid var(--line)" }}>
            <button
              type="button"
              className={`button-ghost small ${selectedOs === "windows" ? "pressed" : ""}`}
              onClick={() => setSelectedOs("windows")}
              style={{ fontSize: 12, padding: "4px 8px" }}
            >
              Windows {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className={`button-ghost small ${selectedOs === "linux" ? "pressed" : ""}`}
              onClick={() => setSelectedOs("linux")}
              style={{ fontSize: 12, padding: "4px 8px" }}
            >
              Linux {/* i18n-ignore */}
            </button>
            <button
              type="button"
              className={`button-ghost small ${selectedOs === "mac" ? "pressed" : ""}`}
              onClick={() => setSelectedOs("mac")}
              style={{ fontSize: 12, padding: "4px 8px" }}
            >
              macOS {/* i18n-ignore */}
            </button>
          </div>
          <button
            type="button"
            className="button-ghost small"
            onClick={() => setDismissed(true)}
            title="Скрыть панель" /* i18n-ignore */
            style={{ padding: "4px 6px" }}
          >
            <Close size={14} />
          </button>
        </div>
      </div>

      {selectedOs === "windows" && (
        <div>
          <p style={{ margin: "0 0 10px 0", fontSize: 13, color: "var(--dim)" }}>
            Нативная программа tTerm Agent для Windows автоматически подключает PowerShell к веб-интерфейсу, настраивает автозапуск при старте системы и работает тихо в фоновом режиме. {/* i18n-ignore */}
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <a
              href={`${origin}/tterm-agent.exe`}
              download="tterm-agent.exe"
              className="button-accent"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", padding: "8px 16px", fontWeight: 600 }}
            >
              <Download size={16} />
              Скачать программу (.exe) {/* i18n-ignore */}
            </a>
            <a
              href={`${origin}/install_windows.bat`}
              download="tterm-setup.bat"
              className="button-ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", padding: "8px 14px", fontSize: 13 }}
            >
              <Computer size={14} />
              Скрипт (.bat) {/* i18n-ignore */}
            </a>
            <span style={{ fontSize: 12, color: "var(--dim)" }}>или запустить в PowerShell: {/* i18n-ignore */}</span>
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "var(--surface)",
            padding: "8px 12px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}>
            <code style={{ flex: 1, overflowX: "auto", whiteSpace: "nowrap" }}>
              {windowsPsCmd}
            </code>
            <button
              type="button"
              className="button-plain small"
              onClick={() => handleCopy(windowsPsCmd)}
              style={{ marginLeft: 10 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Скопировано" /* i18n-ignore */ : "Копировать" /* i18n-ignore */}
            </button>
          </div>
        </div>
      )}

      {selectedOs === "linux" && (
        <div>
          <p style={{ margin: "0 0 10px 0", fontSize: 13, color: "var(--dim)" }}>
            Установка агента tTerm на Linux (Debian, Ubuntu, Arch, Fedora, Alpine): {/* i18n-ignore */}
          </p>
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "var(--surface)",
            padding: "8px 12px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}>
            <code style={{ flex: 1, overflowX: "auto", whiteSpace: "nowrap" }}>
              {linuxCmd}
            </code>
            <button
              type="button"
              className="button-plain small"
              onClick={() => handleCopy(linuxCmd)}
              style={{ marginLeft: 10 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Скопировано" /* i18n-ignore */ : "Копировать" /* i18n-ignore */}
            </button>
          </div>
        </div>
      )}

      {selectedOs === "mac" && (
        <div>
          <p style={{ margin: "0 0 10px 0", fontSize: 13, color: "var(--dim)" }}>
            Для macOS доступно нативное приложение tTerm for Mac и фоновый агент. {/* i18n-ignore */}
          </p>
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "var(--surface)",
            padding: "8px 12px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}>
            <code style={{ flex: 1, overflowX: "auto", whiteSpace: "nowrap" }}>
              {linuxCmd}
            </code>
            <button
              type="button"
              className="button-plain small"
              onClick={() => handleCopy(linuxCmd)}
              style={{ marginLeft: 10 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Скопировано" /* i18n-ignore */ : "Копировать" /* i18n-ignore */}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
