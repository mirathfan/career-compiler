const PROTOCOL_VERSION = "careercompiler-autofill-v1";
const NATIVE_HOST = "com.mirathfan.careercompiler";

function validateResponse(response) {
  return response && response.protocolVersion === PROTOCOL_VERSION && Array.isArray(response.answers);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  return tab;
}

async function sendToContent(type, payload = {}) {
  const tab = await activeTab();
  return chrome.tabs.sendMessage(tab.id, { type, ...payload });
}

function requestNative(payload) {
  return new Promise((resolve) => {
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const timeout = setTimeout(() => {
      port.disconnect();
      resolve({ ok: false, error: "CareerCompiler native host did not respond." });
    }, 8000);
    port.onMessage.addListener((message) => {
      clearTimeout(timeout);
      resolve(validateResponse(message) ? { ok: true, message } : { ok: false, error: "Invalid CareerCompiler response schema." });
      port.disconnect();
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
    });
    port.postMessage({ protocolVersion: PROTOCOL_VERSION, ...payload });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "CC_POPUP_SCAN") {
      sendResponse(await sendToContent("CC_SCAN_FORM"));
      return;
    }
    if (message?.type === "CC_POPUP_CLEAR") {
      sendResponse(await sendToContent("CC_CLEAR_HIGHLIGHTS"));
      return;
    }
    if (message?.type === "CC_POPUP_FILL") {
      const scan = await sendToContent("CC_SCAN_FORM");
      if (!scan?.ok) {
        sendResponse({ ok: false, error: "No application form detected." });
        return;
      }
      const native = await requestNative({ type: "prepare_autofill", scan });
      if (!native.ok) {
        sendResponse(native);
        return;
      }
      const fill = await sendToContent("CC_FILL_FORM", { answers: native.message.answers });
      sendResponse({ ok: true, scan, fill, summary: native.message.summary });
      return;
    }
    sendResponse({ ok: false, error: "Unknown CareerCompiler extension message." });
  })();
  return true;
});
