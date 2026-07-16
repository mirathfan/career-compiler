import { describe, expect, it } from "vitest";
import contentSource from "../../../apps/careercompiler-extension/src/content.js?raw";
import ashbyFixture from "../../../apps/careercompiler-extension/fixtures/ashby.html?raw";
import genericFixture from "../../../apps/careercompiler-extension/fixtures/generic.html?raw";
import greenhouseFixture from "../../../apps/careercompiler-extension/fixtures/greenhouse.html?raw";
import leverFixture from "../../../apps/careercompiler-extension/fixtures/lever.html?raw";

type ContentResponse = Record<string, unknown> & {
  ok?: boolean;
  fields?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
  needsConfirmation?: boolean;
};

function loadContentScript(html: string, url: string) {
  document.documentElement.innerHTML = html;
  window.history.pushState({}, "", url);
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.assign(globalThis, {
    CSS: window.CSS ?? { escape: (value: string) => value.replace(/"/g, "\\\"") },
    Event: window.Event,
    File: window.File,
    HTMLInputElement: window.HTMLInputElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
  });
  let listener: ((message: Record<string, unknown>, sender: unknown, sendResponse: (response: ContentResponse) => void) => boolean) | null = null;
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        onMessage: {
          addListener(fn: typeof listener) {
            listener = fn;
          },
        },
      },
    },
  });
  new Function(contentSource)();
  return (message: Record<string, unknown>) => {
    let response: ContentResponse = {};
    listener?.(message, {}, (next) => {
      response = next;
    });
    return response;
  };
}

describe("extension content script fixtures", () => {
  it.each([
    ["generic", genericFixture, "/generic/apply"],
    ["greenhouse", greenhouseFixture, "/greenhouse/jobs/1"],
    ["lever", leverFixture, "/lever/1/apply"],
    ["ashby", ashbyFixture, "/ashby/1"],
  ])("scans %s fixture fields", (_name, html, url) => {
    const send = loadContentScript(html, url);
    const scan = send({ type: "CC_SCAN_FORM" });
    expect(scan.ok).toBe(true);
    expect(scan.fields?.length).toBeGreaterThan(3);
    expect(scan.fields?.some((field) => field.normalizedQuestionType === "email")).toBe(true);
  });

  it("fills without submitting and preserves user edits unless forced", () => {
    const send = loadContentScript(genericFixture, "/generic/apply");
    const form = document.querySelector("form")!;
    const submitButton = document.querySelector<HTMLButtonElement>("button[type='submit']")!;
    let submitEvents = 0;
    let submitClicks = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitEvents += 1;
    });
    submitButton.addEventListener("click", () => {
      submitClicks += 1;
    });

    const scan = send({ type: "CC_SCAN_FORM" });
    const firstName = scan.fields!.find((field) => field.normalizedQuestionType === "first_name")!;
    const email = scan.fields!.find((field) => field.normalizedQuestionType === "email")!;
    const fill = send({
      type: "CC_FILL_FORM",
      applicationId: "application-fixture",
      answers: [
        {
          fieldId: firstName.id,
          recordId: "field-first",
          originalQuestion: firstName.label,
          normalizedQuestionType: "first_name",
          detectedFieldType: firstName.detectedFieldType,
          answer: "Mir",
          answerSource: "fixed_profile",
          confidence: 0.96,
          requiresReview: false,
          warnings: [],
          reasoningSummary: "",
        },
        {
          fieldId: email.id,
          recordId: "field-email",
          originalQuestion: email.label,
          normalizedQuestionType: "email",
          detectedFieldType: email.detectedFieldType,
          answer: "mir@example.com",
          answerSource: "fixed_profile",
          confidence: 0.96,
          requiresReview: false,
          warnings: [],
          reasoningSummary: "",
        },
      ],
    });
    expect(fill.ok).toBe(true);
    expect(document.querySelector<HTMLInputElement>("input[name='first_name']")?.value).toBe("Mir");
    expect(submitClicks).toBe(0);
    expect(submitEvents).toBe(0);

    const firstInput = document.querySelector<HTMLInputElement>("input[name='first_name']")!;
    firstInput.value = "Manual";
    firstInput.dispatchEvent(new Event("input", { bubbles: true }));
    const refill = send({
      type: "CC_FILL_FORM",
      applicationId: "application-fixture",
      answers: [
        {
          fieldId: firstName.id,
          recordId: "field-first",
          originalQuestion: firstName.label,
          normalizedQuestionType: "first_name",
          detectedFieldType: firstName.detectedFieldType,
          answer: "Override",
          answerSource: "fixed_profile",
          confidence: 0.96,
          requiresReview: false,
          warnings: [],
          reasoningSummary: "",
        },
      ],
    });
    expect(refill.needsConfirmation).toBe(true);
    expect(firstInput.value).toBe("Manual");
    expect(submitClicks).toBe(0);
    expect(submitEvents).toBe(0);
  });
});
