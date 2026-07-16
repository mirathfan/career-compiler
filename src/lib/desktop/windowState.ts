const WINDOW_STATE_KEY = "careercompiler-window-size-v3";
const RESUME_DRAFT_KEY = "careercompiler-resume-draft-v3";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function hasUnsavedResumeDraft(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    const value = storage.getItem(RESUME_DRAFT_KEY);
    if (!value) return false;
    const parsed = JSON.parse(value) as { state?: { dirty?: unknown } };
    return parsed.state?.dirty === true;
  } catch {
    return false;
  }
}

export async function initializeWindowState() {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  const stored = localStorage.getItem(WINDOW_STATE_KEY);
  if (stored) {
    try {
      const size = JSON.parse(stored) as { width: number; height: number };
      if (size.width >= 1120 && size.height >= 720) {
        await appWindow.setSize(new LogicalSize(size.width, size.height));
      }
    } catch {
      localStorage.removeItem(WINDOW_STATE_KEY);
    }
  }
  let timer = 0;
  await appWindow.onResized(async () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const size = await appWindow.innerSize();
      const scale = await appWindow.scaleFactor();
      localStorage.setItem(
        WINDOW_STATE_KEY,
        JSON.stringify({ width: Math.round(size.width / scale), height: Math.round(size.height / scale) }),
      );
    }, 250);
  });
  await appWindow.onCloseRequested((event) => {
    if (hasUnsavedResumeDraft() && !window.confirm("Close CareerCompiler and keep this unsaved resume draft for next launch?")) {
      event.preventDefault();
    }
  });
}
