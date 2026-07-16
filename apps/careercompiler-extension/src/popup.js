const status = document.querySelector("#status");
const pairing = document.querySelector("#pairing");
const pairingCode = document.querySelector("#pairing-code");
const pairButton = document.querySelector("#pair");
const fillButton = document.querySelector("#fill");
const saveEditsButton = document.querySelector("#save-edits");
const ats = document.querySelector("#ats");
const fields = document.querySelector("#fields");
const safe = document.querySelector("#safe");
const review = document.querySelector("#review");
const company = document.querySelector("#company");
const role = document.querySelector("#role");

let paired = false;

function setStatus(message, tone = "") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function errorMessage(result, fallback) {
  return result?.error?.message || result?.error || fallback;
}

function summarize(scan) {
  const detected = scan?.fields || [];
  ats.textContent = scan?.atsPlatform || scan?.pageContext?.atsPlatform || "-";
  fields.textContent = String(detected.length);
  safe.textContent = String(detected.filter((field) => field.classificationConfidence >= 0.85).length);
  review.textContent = String(detected.filter((field) => field.classificationConfidence < 0.85 || field.required).length);
  company.textContent = scan?.pageContext?.companyName || "-";
  role.textContent = scan?.pageContext?.jobTitle || scan?.title || "-";
}

async function message(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function refreshStatus() {
  const result = await message("CC_POPUP_STATUS");
  paired = Boolean(result?.paired);
  fillButton.disabled = !paired;
  saveEditsButton.disabled = !paired;
  pairing.hidden = paired;
  if (paired) {
    setStatus("Paired and connected to CareerCompiler.", "ok");
  } else if (result?.nativeHostAvailable) {
    setStatus(`Native host found. Extension ID: ${result.extensionId}`, "warn");
  } else {
    setStatus(errorMessage(result, "Native host is not registered."), "error");
  }
}

pairButton.addEventListener("click", async () => {
  try {
    pairButton.disabled = true;
    setStatus("Pairing with CareerCompiler...");
    const result = await message("CC_POPUP_PAIR", { pairingCode: pairingCode.value.trim() });
    if (!result?.ok) throw new Error(errorMessage(result, "Pairing failed."));
    pairingCode.value = "";
    await refreshStatus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    pairButton.disabled = false;
  }
});

document.querySelector("#scan").addEventListener("click", async () => {
  try {
    const scan = await message("CC_POPUP_SCAN");
    if (!scan?.ok) throw new Error(errorMessage(scan, "Scan failed."));
    summarize(scan);
    setStatus(`Detected ${scan.fields.length} fields.`, paired ? "ok" : "warn");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
});

async function fill(forceUserEdits = false) {
  setStatus(forceUserEdits ? "Replacing edited fields after confirmation..." : "Requesting reviewed answers from CareerCompiler...");
  const result = await message("CC_POPUP_FILL", { forceUserEdits });
  if (!result?.ok) throw new Error(errorMessage(result, "CareerCompiler is unavailable."));
  if (result.needsConfirmation) {
    const confirmed = window.confirm(`${result.editedCount} edited field(s) would be replaced. Continue?`);
    if (!confirmed) {
      setStatus("Kept your browser edits. Nothing was overwritten.", "warn");
      return;
    }
    await fill(true);
    return;
  }
  summarize(result.scan);
  const hardConflicts = result.summary?.hardConflicts?.length || 0;
  const warnings = result.summary?.warnings?.length || 0;
  setStatus(
    hardConflicts
      ? `Filled available fields. ${hardConflicts} answer(s) require review.`
      : warnings
        ? `Filled available fields with ${warnings} warning(s).`
        : "Filled safe fields. Review highlighted answers and submit manually.",
    hardConflicts ? "warn" : "ok",
  );
}

fillButton.addEventListener("click", async () => {
  try {
    fillButton.disabled = true;
    await fill(false);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    fillButton.disabled = !paired;
  }
});

saveEditsButton.addEventListener("click", async () => {
  try {
    saveEditsButton.disabled = true;
    const result = await message("CC_POPUP_SAVE_EDITS");
    if (!result?.ok) throw new Error(errorMessage(result, "Could not save browser edits."));
    setStatus(`Saved ${result.data?.savedFieldCount ?? 0} edited field(s) to the application draft.`, "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    saveEditsButton.disabled = !paired;
  }
});

document.querySelector("#clear").addEventListener("click", async () => {
  await message("CC_POPUP_CLEAR");
  setStatus("Highlights cleared.", paired ? "ok" : "warn");
});

refreshStatus()
  .then(() => message("CC_POPUP_SCAN"))
  .then((scan) => {
    if (scan?.ok) summarize(scan);
  })
  .catch(() => undefined);
