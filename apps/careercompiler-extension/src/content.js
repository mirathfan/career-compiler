const HIGHLIGHT_CLASSES = [
  "cc-autofill-green",
  "cc-autofill-blue",
  "cc-autofill-yellow",
  "cc-autofill-red",
];

const ignoredInputTypes = new Set(["hidden", "submit", "button", "reset", "image", "password"]);
const fieldStates = new Map();
let currentApplicationId = "";

function visible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function isHoneypot(element) {
  const text = `${element.name || ""} ${element.id || ""} ${element.autocomplete || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
  return /honeypot|bot[-_ ]?field|do[-_ ]?not[-_ ]?fill|captcha|recaptcha|turnstile/.test(text) || element.tabIndex === -1;
}

function labelFor(element) {
  const labels = element.labels ? [...element.labels].map((label) => (label.innerText || label.textContent || "").trim()) : [];
  const aria = element.getAttribute("aria-label") || "";
  const placeholder = element.getAttribute("placeholder") || "";
  const id = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() || "" : "";
  return [aria, ...labels, id, placeholder].filter(Boolean).join(" ").trim();
}

function nearbyText(element) {
  const parent = element.closest("label, fieldset, .field, .form-field, .application-question, .ashby-application-form-field, div") || element.parentElement;
  return (parent?.innerText || parent?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 700);
}

function detectAtsPlatform() {
  const host = location.hostname.toLowerCase();
  const body = (document.body.innerText || document.body.textContent || "").slice(0, 5000).toLowerCase();
  if (host.includes("greenhouse") || body.includes("greenhouse") || document.querySelector("[data-source='Greenhouse'], #grnhse_app")) return "greenhouse";
  if (host.includes("lever") || body.includes("lever") || document.querySelector(".lever, .application-form")) return "lever";
  if (host.includes("ashby") || body.includes("ashby") || body.includes("powered by ashby")) return "ashby";
  return "generic";
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

function selectorFor(element, index) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
  element.dataset.careercompilerFieldId = element.dataset.careercompilerFieldId || `cc-field-${index}`;
  return `[data-careercompiler-field-id="${element.dataset.careercompilerFieldId}"]`;
}

function groupSelectorFor(element, index) {
  if (element.name) return `input[name="${CSS.escape(element.name)}"]`;
  element.dataset.careercompilerFieldId = element.dataset.careercompilerFieldId || `cc-field-${index}`;
  return `[data-careercompiler-field-id="${element.dataset.careercompilerFieldId}"]`;
}

function groupOptions(element) {
  const selector = groupSelectorFor(element, 0);
  return [...document.querySelectorAll(selector)]
    .filter((input) => input instanceof HTMLInputElement)
    .map((input) => labelFor(input) || input.value)
    .filter(Boolean);
}

function groupLabelFor(element) {
  const legend = element.closest("fieldset")?.querySelector("legend")?.textContent?.trim() || "";
  if (legend) return legend;
  const question = element.closest(".application-question, .custom-question, .ashby-application-form-field, .form-field, [role='group']");
  const questionText = (question?.innerText || question?.textContent || "").replace(/\s+/g, " ").trim();
  return questionText || labelFor(element);
}

function baseField(element, index, override = {}) {
  const label = override.label ?? labelFor(element);
  const inputType = override.inputType ?? (element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase());
  const detectedFieldType = override.detectedFieldType ?? element.tagName.toLowerCase();
  const nearby = nearbyText(element);
  const [normalizedQuestionType, confidence] = classify({
    label,
    nearbyText: nearby,
    placeholder: element.getAttribute("placeholder") || "",
    name: element.getAttribute("name") || "",
    elementId: element.id || "",
    ariaLabel: element.getAttribute("aria-label") || "",
    inputType,
  });
  const maxLength = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.maxLength : -1;
  return {
    id: override.id ?? element.dataset.careercompilerFieldId ?? `cc-field-${index}`,
    selector: override.selector ?? selectorFor(element, index),
    label,
    nearbyText: nearby,
    placeholder: element.getAttribute("placeholder") || "",
    elementName: element.getAttribute("name") || "",
    elementId: element.id || "",
    ariaLabel: element.getAttribute("aria-label") || "",
    inputType,
    detectedFieldType,
    options: override.options ?? (element instanceof HTMLSelectElement ? [...element.options].map((option) => option.text.trim()).filter(Boolean) : []),
    pageHeading: document.querySelector("h1, h2")?.textContent?.trim() || document.title,
    atsPlatform: detectAtsPlatform(),
    normalizedQuestionType,
    classificationConfidence: confidence,
    required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
    characterLimit: maxLength > 0 ? maxLength : null,
  };
}

function scanFields() {
  const controls = [...document.querySelectorAll("input, textarea, select")]
    .filter((element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    .filter((element) => visible(element))
    .filter((element) => !isHoneypot(element))
    .filter((element) => !(element instanceof HTMLInputElement && ignoredInputTypes.has(element.type)));

  const fields = [];
  const grouped = new Set();
  controls.forEach((element, index) => {
    if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) {
      const groupKey = element.name || element.dataset.careercompilerFieldId || `cc-group-${index}`;
      if (grouped.has(`${element.type}:${groupKey}`)) return;
      grouped.add(`${element.type}:${groupKey}`);
      const selector = groupSelectorFor(element, index);
      const groupElements = [...document.querySelectorAll(selector)].filter((input) => input instanceof HTMLInputElement);
      const fieldId = element.dataset.careercompilerFieldId || `cc-field-${index}`;
      groupElements.forEach((input) => {
        input.dataset.careercompilerFieldId = fieldId;
      });
      fields.push(baseField(element, index, {
        id: fieldId,
        selector,
        inputType: element.type,
        detectedFieldType: `${element.type}_group`,
        label: groupLabelFor(element),
        options: groupOptions(element),
      }));
      return;
    }
    const fieldId = element.dataset.careercompilerFieldId || `cc-field-${index}`;
    element.dataset.careercompilerFieldId = fieldId;
    fields.push(baseField(element, index, { id: fieldId }));
  });
  return fields;
}

function extractPageContext(fields) {
  const atsPlatform = detectAtsPlatform();
  const heading = document.querySelector("h1")?.textContent?.trim() || document.title;
  const company = document.querySelector("[data-company], .company, .posting-company, meta[property='og:site_name']")?.getAttribute("content")
    || document.querySelector("[data-company], .company, .posting-company")?.textContent?.trim()
    || "";
  const descriptionElement = document.querySelector("[data-testid='job-description'], .job-description, .section.page-centered, .content, #content, main");
  const jobDescription = (descriptionElement?.textContent || document.body.innerText || document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 8000);
  return {
    url: location.href,
    title: document.title,
    atsPlatform,
    companyName: company,
    jobTitle: heading,
    jobDescription,
    fieldCount: fields.length,
  };
}

function nativeSetter(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
}

function dispatchFormEvents(element) {
  for (const eventName of ["input", "change", "blur"]) {
    element.dispatchEvent(new Event(eventName, { bubbles: true }));
  }
}

function elementForField(field) {
  return document.querySelector(field.selector);
}

function groupElements(field) {
  return [...document.querySelectorAll(field.selector)].filter((element) => element instanceof HTMLInputElement);
}

function valueForField(field) {
  const element = elementForField(field);
  if (!element) return "";
  if (field.detectedFieldType === "radio_group") {
    return groupElements(field).find((input) => input.checked)?.value || "";
  }
  if (field.detectedFieldType === "checkbox_group") {
    return groupElements(field).filter((input) => input.checked).map((input) => input.value || labelFor(input));
  }
  if (element instanceof HTMLInputElement && element.type === "file") {
    return [...(element.files || [])].map((file) => file.name).join(", ");
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value;
  }
  return "";
}

function setChecked(input, checked) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  setter?.call(input, checked);
  dispatchFormEvents(input);
}

function optionMatches(input, answer) {
  const expected = String(answer).trim().toLowerCase();
  return [input.value, labelFor(input)].some((value) => String(value).trim().toLowerCase() === expected);
}

function fillRegularField(field, answer) {
  const element = elementForField(field);
  if (!element) return { ok: false, reason: "field disappeared" };
  if (field.detectedFieldType === "radio_group") {
    const match = groupElements(field).find((input) => optionMatches(input, answer));
    if (!match) return { ok: false, reason: "radio option not found" };
    setChecked(match, true);
    return { ok: true };
  }
  if (field.detectedFieldType === "checkbox_group") {
    const desired = Array.isArray(answer) ? answer.map((item) => String(item).toLowerCase()) : [String(answer).toLowerCase()];
    let changed = 0;
    for (const input of groupElements(field)) {
      const shouldCheck = typeof answer === "boolean" ? answer : desired.some((value) => optionMatches(input, value));
      if (input.checked !== shouldCheck) changed += 1;
      setChecked(input, shouldCheck);
    }
    return changed ? { ok: true } : { ok: false, reason: "checkbox option not found" };
  }
  if (element instanceof HTMLSelectElement) {
    const option = [...element.options].find((candidate) => candidate.value === answer || candidate.text.trim().toLowerCase() === String(answer).trim().toLowerCase());
    if (!option) return { ok: false, reason: "dropdown option not found" };
    element.value = option.value;
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    nativeSetter(element, String(answer ?? ""));
  } else {
    return { ok: false, reason: "unsupported field" };
  }
  dispatchFormEvents(element);
  return { ok: true };
}

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function fillResumeField(field, answer) {
  const element = elementForField(field);
  if (!(element instanceof HTMLInputElement) || element.type !== "file") return { ok: false, reason: "resume file input not found" };
  if (!answer.resumeFile?.fileBase64) return { ok: false, reason: "resume payload not available" };
  const file = new File(
    [bytesFromBase64(answer.resumeFile.fileBase64)],
    answer.resumeFile.filename,
    { type: answer.resumeFile.mimeType || "application/pdf" },
  );
  const transfer = new DataTransfer();
  transfer.items.add(file);
  element.files = transfer.files;
  dispatchFormEvents(element);
  return { ok: true };
}

function targetForHighlight(field) {
  const element = elementForField(field);
  if (!element) return null;
  return element.closest("fieldset, label, .field, .form-field, .application-question, div") || element;
}

function clearHighlights() {
  document.querySelectorAll(".cc-autofill-badge, .cc-autofill-footer").forEach((badge) => badge.remove());
  document.querySelectorAll(HIGHLIGHT_CLASSES.map((name) => `.${name}`).join(",")).forEach((element) => {
    element.classList.remove(...HIGHLIGHT_CLASSES);
  });
}

function highlight(field, answer, overrideColor) {
  const target = targetForHighlight(field);
  if (!target) return;
  const color = overrideColor || (answer.answerSource === "fixed_profile" || answer.answerSource === "locked_sensitive"
    ? "green"
    : answer.answerSource === "approved_answer"
      ? "blue"
      : answer.requiresReview
        ? "yellow"
        : "red");
  target.classList.remove(...HIGHLIGHT_CLASSES);
  target.classList.add(`cc-autofill-${color}`);
  target.parentElement?.querySelectorAll(`.cc-autofill-badge[data-field-id="${CSS.escape(field.id)}"]`).forEach((badge) => badge.remove());
  const badge = document.createElement("span");
  badge.className = `cc-autofill-badge cc-autofill-badge-${color}`;
  badge.dataset.fieldId = field.id;
  badge.textContent = answer.answerSource || "CareerCompiler";
  badge.title = answer.warnings?.join(" ") || answer.reasoningSummary || "";
  target.insertAdjacentElement("afterend", badge);
}

function markFieldMetadata(field, answer, originallyFilledValue) {
  const elements = field.detectedFieldType.endsWith("_group") ? groupElements(field) : [elementForField(field)].filter(Boolean);
  for (const element of elements) {
    element.dataset.careercompilerFieldId = field.id;
    element.dataset.careercompilerRecordId = answer.recordId || "";
    element.dataset.careercompilerOriginalQuestion = answer.originalQuestion || field.label || "";
    element.dataset.careercompilerQuestionType = answer.normalizedQuestionType || field.normalizedQuestionType || "unknown";
    element.dataset.careercompilerDetectedFieldType = answer.detectedFieldType || field.detectedFieldType || "";
    element.dataset.careercompilerOriginallyFilled = JSON.stringify(originallyFilledValue ?? "");
  }
}

function updateState(field, answer, result) {
  const currentValue = valueForField(field);
  const previous = fieldStates.get(field.id);
  fieldStates.set(field.id, {
    fieldId: field.id,
    recordId: answer.recordId,
    originalQuestion: answer.originalQuestion || field.label || field.nearbyText || field.id,
    normalizedQuestionType: answer.normalizedQuestionType || field.normalizedQuestionType || "unknown",
    detectedFieldType: answer.detectedFieldType || field.detectedFieldType,
    originallyFilledValue: result.ok ? currentValue : previous?.originallyFilledValue ?? "",
    currentValue,
    userEdited: false,
    safeToSave: result.ok && answer.answerSource !== "user_required",
    changedAt: new Date().toISOString(),
  });
}

function editedFields() {
  return [...fieldStates.values()].filter((state) => state.userEdited);
}

function ensureFooter() {
  if (document.querySelector(".cc-autofill-footer")) return;
  const form = document.querySelector("form") || document.body;
  const footer = document.createElement("div");
  footer.className = "cc-autofill-footer";
  footer.textContent = "CareerCompiler filled this application. Review all highlighted answers and submit manually.";
  form.appendChild(footer);
}

function fillAnswers(answers, options = {}) {
  const fields = scanFields();
  const answersByField = new Map((answers || []).map((answer) => [answer.fieldId, answer]));
  const edited = fields.filter((field) => fieldStates.get(field.id)?.userEdited && answersByField.has(field.id));
  if (edited.length && !options.forceUserEdits) {
    return { ok: false, needsConfirmation: true, editedCount: edited.length, results: [] };
  }

  clearHighlights();
  const results = [];
  for (const answer of answers || []) {
    const field = fields.find((candidate) => candidate.id === answer.fieldId);
    if (!field) {
      results.push({ fieldId: answer.fieldId, ok: false, reason: "field disappeared" });
      continue;
    }
    if (answer.answerSource === "user_required" || answer.confidence < 0.65) {
      highlight(field, { ...answer, requiresReview: true }, "red");
      markFieldMetadata(field, answer, valueForField(field));
      updateState(field, answer, { ok: false });
      results.push({ fieldId: answer.fieldId, ok: false, reason: "user input required" });
      continue;
    }
    const result = answer.fillKind === "resume_file" ? fillResumeField(field, answer) : fillRegularField(field, answer.answer);
    highlight(field, answer, result.ok ? undefined : "yellow");
    markFieldMetadata(field, answer, valueForField(field));
    updateState(field, answer, result);
    results.push({ fieldId: answer.fieldId, ...result });
  }
  ensureFooter();
  return { ok: true, results, editedCount: edited.length };
}

function trackUserEdit(target) {
  const fieldId = target.dataset.careercompilerFieldId;
  if (!fieldId) return;
  const fields = scanFields();
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field) return;
  const state = fieldStates.get(fieldId);
  const currentValue = valueForField(field);
  const originallyFilled = state?.originallyFilledValue ?? target.dataset.careercompilerOriginallyFilled ?? "";
  fieldStates.set(fieldId, {
    fieldId,
    recordId: target.dataset.careercompilerRecordId || state?.recordId || "",
    originalQuestion: target.dataset.careercompilerOriginalQuestion || state?.originalQuestion || field.label || fieldId,
    normalizedQuestionType: target.dataset.careercompilerQuestionType || state?.normalizedQuestionType || field.normalizedQuestionType,
    detectedFieldType: target.dataset.careercompilerDetectedFieldType || state?.detectedFieldType || field.detectedFieldType,
    originallyFilledValue: originallyFilled,
    currentValue,
    userEdited: JSON.stringify(currentValue) !== JSON.stringify(originallyFilled),
    safeToSave: true,
    changedAt: new Date().toISOString(),
  });
}

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    trackUserEdit(target);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    trackUserEdit(target);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CC_SCAN_FORM") {
    const fields = scanFields();
    sendResponse({ ok: true, fields, pageContext: extractPageContext(fields), atsPlatform: detectAtsPlatform(), title: document.title, url: location.href });
    return true;
  }
  if (message?.type === "CC_FILL_FORM") {
    currentApplicationId = message.applicationId || currentApplicationId;
    sendResponse({ ok: true, applicationId: currentApplicationId, ...fillAnswers(message.answers || [], { forceUserEdits: Boolean(message.forceUserEdits) }) });
    return true;
  }
  if (message?.type === "CC_GATHER_EDITS") {
    sendResponse({ ok: true, applicationId: currentApplicationId, fields: editedFields() });
    return true;
  }
  if (message?.type === "CC_CLEAR_HIGHLIGHTS") {
    clearHighlights();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
