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
  const windowsPsCmd = `powershell -ExecutionPolicy Bypass -Command "iwr -useb ${window.location.protocol}//${window.location.hostname}:8291/install_computer.ps1 | iex"`;
  // i18n-ignore
  const linuxCmd = `curl -sSL ${window.location.protocol}//${window.location.hostname}:8291/install.sh | bash`;

  return (
    <div className="client-installer-banner" style={{
      margin: "0 0 20px 0",
      padding: "16px 20px",
      borderRadius: "12px",
      background: "var(--color-bg-secondary, #1e1e24)",
      border: "1px solid var(--color-border, #33333d)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Computer size={18} />
          <strong>Подключение локальной машины к tTerm {/* i18n-ignore */}</strong>
          {detectedOs === selectedOs && (
            <span style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 6,
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              border: "1px solid rgba(16, 185, 129, 0.3)"
            }}>
              Определена ОС: {selectedOs} {/* i18n-ignore */}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: 2 }}>
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
          <p style={{ margin: "0 0 10px 0", fontSize: 13, color: "var(--color-text-secondary, #999)" }}>
            Агент tTerm для Windows позволяет подключать локальные сессии PowerShell и CMD к веб-интерфейсу, управлять терминалами и предоставлять доступ ИИ-ассистентам. {/* i18n-ignore */}
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <a
              href="/install_windows.bat"
              download="install_windows.bat"
              className="button-accent"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", padding: "6px 14px" }}
            >
              <Download size={15} />
              Скачать установщик (.bat) {/* i18n-ignore */}
            </a>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>или запустить в консоли: {/* i18n-ignore */}</span>
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(0,0,0,0.35)",
            padding: "8px 12px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            border: "1px solid rgba(255,255,255,0.08)"
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
          <p style={{ margin: "0 0 10px 0", fontSize: 13, color: "var(--color-text-secondary, #999)" }}>
            Установка агента tTerm на Linux (Debian, Ubuntu, Arch, Fedora, Alpine): {/* i18n-ignore */}
          </p>
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(0,0,0,0.35)",
            padding: "8px 12px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            border: "1px solid rgba(255,255,255,0.08)"
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
          <p style={{ margin: "0 0 10px 0", fontSize: 13, color: "var(--color-text-secondary, #999)" }}>
            Для macOS доступно нативное приложение tTerm for Mac и фоновый агент. {/* i18n-ignore */}
          </p>
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(0,0,0,0.35)",
            padding: "8px 12px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            border: "1px solid rgba(255,255,255,0.08)"
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
