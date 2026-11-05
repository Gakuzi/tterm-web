/**
 * Universal clipboard copy utility.
 * Works across all browsers, in iframes, and over plain HTTP (non-secure context)
 * by falling back to document.execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API if available
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  // 2. Robust execCommand fallback with temporary textarea
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "-9999px";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (e) {
      console.warn("execCommand fallback error:", e);
    }
    if (textArea.parentNode) {
      textArea.parentNode.removeChild(textArea);
    }
    return success;
  } catch (err) {
    console.error("Failed to copy using fallback:", err);
    return false;
  }
}
