const HIGHLIGHT_CLASSES = [
  "cc-autofill-green",
  "cc-autofill-blue",
  "cc-autofill-yellow",
  "cc-autofill-red",
];

const SUBMIT_PATTERN = /\b(submit|send application|finish|finalize|complete application)\b/i;

function visible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function isHoneypot(element) {
  const text = `${element.name || ""} ${element.id || ""} ${element.autocomplete || ""}`.toLowerCase();
  return /honeypot|bot[-_ ]?field|do[-_ ]?not[-_ ]?fill|captcha/.test(text) || element.tabIndex === -1;
}

function labelFor(element) {
  const labels = element.labels ? [...element.labels].map((label) => label.innerText.trim()) : [];
  const aria = element.getAttribute("aria-label") || "";
  const placeholder = element.getAttribute("placeholder") || "";
  const id = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() || "" : "";
  return [aria, ...labels, id, placeholder].filter(Boolean).join(" ").trim();
}

function nearbyText(element) {
  const parent = element.closest("label, fieldset, .field, .form-field, .application-question, div") || element.parentElement;
  return (parent?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function optionsFor(element) {
  if (element instanceof HTMLSelectElement) return [...element.options].map((option) => option.text.trim()).filter(Boolean);
  if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) {
    const name = element.name;
    if (!name) return [];
    return [...document.querySelectorAll(`input[name="${CSS.escape(name)}"]`)]
      .map((input) => labelFor(input))
      .filter(Boolean);
  }
  return [];
}

function classify(field) {
  const text = `${field.label} ${field.nearbyText} ${field.placeholder} ${field.name} ${field.elementId} ${field.ariaLabel}`.toLowerCase();
  if (field.inputType === "email" || /\bemail\b/.test(text)) return ["email", 0.99];
  if (field.inputType === "tel" || /\b(phone|mobile|telephone)\b/.test(text)) return ["phone", 0.96];
  if (/\bfirst\s*name\b/.test(text)) return ["first_name", 0.98];
  if (/\blast\s*name\b|\bsurname\b/.test(text)) return ["last_name", 0.98];
  if (/\bfull\s*name\b|^name$/.test(text)) return ["full_name", 0.94];
  if (/linkedin/.test(text)) return ["linkedin", 0.97];
  if (/github/.test(text)) return ["github", 0.97];
  if (/portfolio|website|personal site/.test(text)) return ["portfolio", 0.9];
  if (/authorized to work|work authorization|employment authorization/.test(text)) return ["work_authorization", 0.96];
  if (/sponsor|visa|now or in the future/.test(text)) return ["future_sponsorship", 0.96];
  if (/salary|compensation|pay range/.test(text)) return ["salary_expectation", 0.94];
  if (/relocat/.test(text)) return ["relocation", 0.93];
  if (/travel/.test(text)) return ["travel", 0.9];
  if (/security clearance|clearance/.test(text)) return ["security_clearance", 0.95];
  if (/why.*company|why.*join/.test(text)) return ["why_company", 0.82];
  if (/why.*role|why.*position/.test(text)) return ["why_role", 0.82];
  if (/project/.test(text)) return ["relevant_project", 0.78];
  if (/gender|race|ethnicity|veteran|disability/.test(text)) return ["demographic", 0.96];
  if (/certif|attest|terms|privacy|background check/.test(text)) return ["legal_attestation", 0.94];
  return ["unknown", 0.35];
}

function detectAtsPlatform() {
  const host = location.hostname.toLowerCase();
  const body = document.body.innerText.slice(0, 5000).toLowerCase();
  if (host.includes("greenhouse") || body.includes("greenhouse")) return "greenhouse";
  if (host.includes("lever") || body.includes("lever")) return "lever";
  if (host.includes("ashby") || body.includes("ashby")) return "ashby";
  return "generic";
}

function scanFields() {
  const controls = [...document.querySelectorAll("input, textarea, select")]
    .filter((element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    .filter((element) => visible(element))
    .filter((element) => !isHoneypot(element))
    .filter((element) => !(element instanceof HTMLInputElement && ["hidden", "submit", "button", "reset", "image"].includes(element.type)));
  return controls.map((element, index) => {
    const label = labelFor(element);
    const [normalizedQuestionType, confidence] = classify({
      label,
      nearbyText: nearbyText(element),
      placeholder: element.getAttribute("placeholder") || "",
      name: element.getAttribute("name") || "",
      elementId: element.id || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      inputType: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
    });
    return {
      id: element.dataset.careercompilerFieldId || `cc-field-${index}`,
      selector: selectorFor(element, index),
      label,
      nearbyText: nearbyText(element),
      placeholder: element.getAttribute("placeholder") || "",
      elementName: element.getAttribute("name") || "",
      elementId: element.id || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      inputType: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
      detectedFieldType: element.tagName.toLowerCase(),
      options: optionsFor(element),
      pageHeading: document.querySelector("h1, h2")?.textContent?.trim() || document.title,
      atsPlatform: detectAtsPlatform(),
      normalizedQuestionType,
      classificationConfidence: confidence,
    };
  });
}

function selectorFor(element, index) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
  element.dataset.careercompilerFieldId = `cc-field-${index}`;
  return `[data-careercompiler-field-id="cc-field-${index}"]`;
}

function nativeSetter(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
}

function fillControl(element, value) {
  if (SUBMIT_PATTERN.test(String(value))) return { ok: false, reason: "submit-like value refused" };
  if (element instanceof HTMLSelectElement) {
    const option = [...element.options].find((candidate) => candidate.value === value || candidate.text.trim().toLowerCase() === String(value).trim().toLowerCase());
    if (!option) return { ok: false, reason: "dropdown option not found" };
    element.value = option.value;
  } else if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    element.checked = Boolean(value);
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    nativeSetter(element, String(value));
  } else {
    return { ok: false, reason: "unsupported field" };
  }
  for (const eventName of ["input", "change", "blur"]) {
    element.dispatchEvent(new Event(eventName, { bubbles: true }));
  }
  return { ok: true };
}

function clearHighlights() {
  document.querySelectorAll(".cc-autofill-badge").forEach((badge) => badge.remove());
  document.querySelectorAll(HIGHLIGHT_CLASSES.map((name) => `.${name}`).join(",")).forEach((element) => {
    element.classList.remove(...HIGHLIGHT_CLASSES);
  });
}

function highlight(element, answer) {
  const color = answer.answerSource === "fixed_profile" || answer.answerSource === "locked_sensitive"
    ? "green"
    : answer.answerSource === "approved_answer"
      ? "blue"
      : answer.requiresReview
        ? "yellow"
        : "red";
  element.classList.remove(...HIGHLIGHT_CLASSES);
  element.classList.add(`cc-autofill-${color}`);
  const badge = document.createElement("span");
  badge.className = `cc-autofill-badge cc-autofill-badge-${color}`;
  badge.textContent = answer.answerSource || "CareerCompiler";
  badge.title = answer.warnings?.join(" ") || answer.reasoningSummary || "";
  element.insertAdjacentElement("afterend", badge);
}

function fillAnswers(answers) {
  clearHighlights();
  const results = [];
  for (const answer of answers) {
    const field = scanFields().find((candidate) => candidate.id === answer.fieldId);
    const element = field ? document.querySelector(field.selector) : null;
    if (!element) {
      results.push({ fieldId: answer.fieldId, ok: false, reason: "field disappeared" });
      continue;
    }
    if (answer.answerSource === "user_required" || answer.confidence < 0.65) {
      highlight(element, { ...answer, requiresReview: true });
      results.push({ fieldId: answer.fieldId, ok: false, reason: "user input required" });
      continue;
    }
    const result = fillControl(element, answer.answer);
    highlight(element, answer);
    results.push({ fieldId: answer.fieldId, ...result });
  }
  return results;
}

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (!target.className.toString().includes("cc-autofill")) return;
  target.dataset.careercompilerUserEdited = "true";
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CC_SCAN_FORM") {
    sendResponse({ ok: true, fields: scanFields(), atsPlatform: detectAtsPlatform(), title: document.title, url: location.href });
    return true;
  }
  if (message?.type === "CC_FILL_FORM") {
    sendResponse({ ok: true, results: fillAnswers(message.answers || []) });
    return true;
  }
  if (message?.type === "CC_CLEAR_HIGHLIGHTS") {
    clearHighlights();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
