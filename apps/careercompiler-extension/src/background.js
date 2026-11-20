import { canonicalDigest, HASH_VERSION, supportedApplicationUrl, trustedPopupSender } from "./authorizationContract.js";
const PROTOCOL_VERSION = 3;
const NATIVE_HOST = "com.mirathfan.careercompiler";
const STORAGE_KEYS = {
  credential: "careercompilerCredential",
  pairedExtensionId: "careercompilerPairedExtensionId",
};

const lastPreparedByTab = new Map();

function createRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validateResponse(response) {
  return response && response.protocolVersion === PROTOCOL_VERSION && typeof response.ok === "boolean";
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  if (!supportedApplicationUrl(tab.url)) throw new Error("Unsupported application origin. Use a supported HTTPS ATS application page.");
  return tab;
}

async function sendToContent(type, payload = {}, pinnedTab) {
  const tab = await activeTab();
  if (pinnedTab && (tab.id !== pinnedTab.id || tab.url !== pinnedTab.url)) throw new Error("Application tab changed. Prepare fresh authorization.");
  return chrome.tabs.sendMessage(tab.id, { type, ...payload });
}

async function storageState() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    extensionId: chrome.runtime.id,
    credential: stored[STORAGE_KEYS.credential] || "",
    pairedExtensionId: stored[STORAGE_KEYS.pairedExtensionId] || "",
  };
}

function requestNative(payload, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let port;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
      try {
        port?.disconnect();
      } catch {
        // Chrome may already have closed the port.
      }
    };
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch (error) {
      resolve({ ok: false, error: { code: "native_connect_failed", message: error instanceof Error ? error.message : String(error), retryable: true } });
      return;
    }
    const timeout = setTimeout(() => {
      finish({ ok: false, error: { code: "native_timeout", message: "CareerCompiler native host did not respond.", retryable: true } });
    }, timeoutMs);
    port.onMessage.addListener((message) => {
      if (!validateResponse(message)) {
        finish({ ok: false, error: { code: "schema_invalid", message: "Invalid CareerCompiler response schema.", retryable: false } });
        return;
      }
      finish(message);
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      const message = chrome.runtime.lastError?.message || "CareerCompiler native host disconnected.";
      finish({ ok: false, error: { code: "native_disconnected", message, retryable: true } });
    });
    port.postMessage({ protocolVersion: PROTOCOL_VERSION, ...payload });
  });
}

async function authenticatedNativeRequest(payload, timeoutMs) {
  const state = await storageState();
  if (!state.credential || state.pairedExtensionId !== state.extensionId) {
    return { ok: false, error: { code: "unpaired", message: "Pair the extension with CareerCompiler first.", retryable: false } };
  }
  return requestNative({
    ...payload,
    extensionId: state.extensionId,
    credential: state.credential,
  }, timeoutMs);
}

async function connectionStatus() {
  const state = await storageState();
  const ping = await requestNative({
    type: "ping",
    requestId: createRequestId("ping"),
  }, 8000);
  return {
    ok: ping.ok,
    extensionId: state.extensionId,
    paired: Boolean(state.credential && state.pairedExtensionId === state.extensionId && ping.data?.paired),
    nativeHostAvailable: Boolean(ping.ok),
    error: ping.error,
    data: ping.data,
  };
}

async function pairExtension(pairingCode) {
  const result = await requestNative({
    type: "pair",
    requestId: createRequestId("pair"),
    extensionId: chrome.runtime.id,
    pairingCode,
  }, 12000);
  if (result.ok && result.data?.credential) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.credential]: result.data.credential,
      [STORAGE_KEYS.pairedExtensionId]: chrome.runtime.id,
    });
  }
  return result;
}

async function fillCurrentTab(forceUserEdits = false) {
  const tab = await activeTab();
  const scan = await sendToContent("CC_SCAN_FORM", {}, tab);
  if (scan?.pageContext?.url !== tab.url) return { ok: false, error: { code: "page_context_mismatch", message: "The page changed. Scan and prepare again.", retryable: true } };
  if (!scan?.ok) return { ok: false, error: { code: "scan_failed", message: "No supported application form detected.", retryable: true } };

  let prepared = lastPreparedByTab.get(tab.id);
  if (!prepared || !forceUserEdits) {
    const native = await authenticatedNativeRequest({
      type: "prepare_application",
      requestId: createRequestId("prepare"),
      pageContext: scan.pageContext,
      fields: scan.fields,
    }, 30000);
    if (!native.ok) return native;
    prepared = native.data;
    lastPreparedByTab.set(tab.id, prepared);
  }

  if (!prepared.authorization || prepared.authorization.hashVersion !== HASH_VERSION || prepared.authorization.expiresAtMs <= Date.now()) {
    lastPreparedByTab.delete(tab.id);
    return { ok: false, error: { code: "payload_expired", message: "Prepare a fresh application payload.", retryable: true } };
  }
  const { authorization: _token, ...content } = prepared;
  if (await canonicalDigest(content) !== prepared.authorization.payloadHash) return { ok: false, error: { code: "payload_hash_mismatch", message: "Payload changed. Prepare fresh authorization.", retryable: true } };
  const authorization = await authenticatedNativeRequest({ type: "authorize_fill", requestId: createRequestId("authorize-fill"), prepared, pageUrl: scan.pageContext.url }, 8000);
  if (!authorization.ok) { lastPreparedByTab.delete(tab.id); return authorization; }
  // Token is single-use. Any user-edit retry must prepare and authorize anew.
  lastPreparedByTab.delete(tab.id);
  let fill;
  try { fill = await sendToContent("CC_FILL_FORM", {
    expectedPageUrl: tab.url,
    applicationId: prepared.applicationId,
    authorization: prepared.authorization,
    answers: prepared.fields,
    forceUserEdits,
  }, tab); } catch { return { ok: false, error: { code: "browser_interrupted", message: "Browser fill was interrupted; some fields may have changed. Review them and prepare fresh authorization before retrying.", retryable: true } }; }
  if (!fill?.ok && !fill?.needsConfirmation) return fill ?? { ok: false, error: { code: "fill_failed", message: "Browser fill failed.", retryable: true } };
  if (fill?.needsConfirmation) {
    return { ok: true, needsConfirmation: true, editedCount: fill.editedCount, scan, prepared };
  }
  if (prepared.applicationId) {
    const acknowledged = await authenticatedNativeRequest({
      type: "mark_filled",
      fillAuthorizationId: prepared.authorization.id,
      requestId: createRequestId("filled"),
      applicationId: prepared.applicationId,
    }, 8000);
    if (!acknowledged.ok) return { ok: false, error: { code: "fill_acknowledgement_failed", message: "Fields may be filled, but desktop completion was not confirmed. Review before retrying.", retryable: true }, fill };
  }
  return {
    ok: true,
    scan,
    fill,
    prepared,
    summary: {
      companyName: prepared.companyName,
      jobTitle: prepared.jobTitle,
      warnings: prepared.warnings,
      hardConflicts: prepared.hardConflicts,
    },
  };
}

async function saveEdits() {
  const edits = await sendToContent("CC_GATHER_EDITS");
  if (!edits?.ok) return { ok: false, error: { code: "edits_unavailable", message: "Could not read browser edits.", retryable: true } };
  if (!edits.applicationId) return { ok: false, error: { code: "application_missing", message: "Fill an application before saving edits.", retryable: false } };
  return authenticatedNativeRequest({
    type: "save_application_edits",
    requestId: createRequestId("save-edits"),
    applicationId: edits.applicationId,
    fields: edits.fields || [],
  }, 15000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!trustedPopupSender(sender, chrome.runtime.id) || !message || typeof message !== "object" || typeof message.type !== "string") {
    sendResponse({ ok: false, error: { code: "sender_denied", message: "Only the CareerCompiler popup may request browser actions.", retryable: false } }); return false;
  }
  (async () => {
    if (message?.type === "CC_POPUP_STATUS") {
      sendResponse(await connectionStatus());
      return;
    }
    if (message?.type === "CC_POPUP_PAIR") {
      sendResponse(await pairExtension(message.pairingCode || ""));
      return;
    }
    if (message?.type === "CC_POPUP_SCAN") {
      sendResponse(await sendToContent("CC_SCAN_FORM"));
      return;
    }
    if (message?.type === "CC_POPUP_CLEAR") {
      sendResponse(await sendToContent("CC_CLEAR_HIGHLIGHTS"));
      return;
    }
    if (message?.type === "CC_POPUP_FILL") {
      sendResponse(await fillCurrentTab(Boolean(message.forceUserEdits)));
      return;
    }
    if (message?.type === "CC_POPUP_SAVE_EDITS") {
      sendResponse(await saveEdits());
      return;
    }
    sendResponse({ ok: false, error: { code: "unknown_message", message: "Unknown CareerCompiler extension message.", retryable: false } });
  })().catch(() => sendResponse({ ok: false, error: { code: "browser_operation_failed", message: "Browser operation failed. Review the page before retrying.", retryable: true } }));
  return true;
});
