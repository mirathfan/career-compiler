const status = document.querySelector("#status");
const ats = document.querySelector("#ats");
const fields = document.querySelector("#fields");
const safe = document.querySelector("#safe");
const review = document.querySelector("#review");

function setStatus(message) {
  status.textContent = message;
}

function summarize(scan) {
  const detected = scan?.fields || [];
  ats.textContent = scan?.atsPlatform || "-";
  fields.textContent = String(detected.length);
  safe.textContent = String(detected.filter((field) => field.classificationConfidence >= 0.85).length);
  review.textContent = String(detected.filter((field) => field.classificationConfidence < 0.85).length);
}

async function message(type) {
  return chrome.runtime.sendMessage({ type });
}

document.querySelector("#scan").addEventListener("click", async () => {
  try {
    const scan = await message("CC_POPUP_SCAN");
    if (!scan?.ok) throw new Error(scan?.error || "Scan failed.");
    summarize(scan);
    setStatus(`Detected ${scan.fields.length} fields.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector("#fill").addEventListener("click", async () => {
  try {
    setStatus("Requesting reviewed answers from CareerCompiler...");
    const result = await message("CC_POPUP_FILL");
    if (!result?.ok) throw new Error(result?.error || "CareerCompiler is unavailable.");
    summarize(result.scan);
    setStatus("Filled safe fields. Review highlighted answers and submit manually.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector("#clear").addEventListener("click", async () => {
  await message("CC_POPUP_CLEAR");
  setStatus("Highlights cleared.");
});

message("CC_POPUP_SCAN").then((scan) => {
  if (scan?.ok) {
    summarize(scan);
    setStatus(`Detected ${scan.fields.length} fields.`);
  }
}).catch(() => undefined);
