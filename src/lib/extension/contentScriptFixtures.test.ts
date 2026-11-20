import isolatedFixture from "../../../apps/careercompiler-extension/fixtures/isolated/greenhouse.html?raw";
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
        id: "synthetic-extension",
        onMessage: {
          addListener(fn: typeof listener) {
            listener = fn;
          },
        },
      },
    },
  });
  new Function(contentSource)();
  return (message: Record<string, unknown>, sender: unknown = { id: "synthetic-extension", origin: "chrome-extension://synthetic-extension", url: "chrome-extension://synthetic-extension/background.js" }) => {
    let response: ContentResponse = {};
    const bound = message.type === "CC_FILL_FORM" && !("expectedPageUrl" in message) ? { ...message, expectedPageUrl: window.location.href } : message;
    listener?.(bound, sender, (next) => {
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
      authorization: { hashVersion: "cc-json-sha256-v1", id: "fixture-authorized-token", expiresAtMs: Date.now() + 60_000 },
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
      authorization: { hashVersion: "cc-json-sha256-v1", id: "fixture-refill-token", expiresAtMs: Date.now() + 60_000 },
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

  it("uses parent question text for Lever-style radio groups", () => {
    const send = loadContentScript(
      `<!doctype html><html><body><form>
        <li class="application-question custom-question">
          <div>Are you legally authorized to work in the United States? <span>*</span>
            <div class="application-field full-width required-field">
              <ul>
                <li><label><input type="radio" name="cards[abc][field0]" value="Yes" required />Yes</label></li>
                <li><label><input type="radio" name="cards[abc][field0]" value="No" required />No</label></li>
              </ul>
            </div>
          </div>
        </li>
      </form></body></html>`,
      "/lever/radio/apply",
    );
    const scan = send({ type: "CC_SCAN_FORM" });
    const field = scan.fields?.find((candidate) => candidate.detectedFieldType === "radio_group");
    expect(field?.label).toContain("legally authorized");
    expect(field?.normalizedQuestionType).toBe("work_authorization");
  });
});


it("refuses expired browser payloads before touching fields", () => {
  const send = loadContentScript(genericFixture, "/generic/apply");
  const before = document.querySelector<HTMLInputElement>("input")!.value;
  const response = send({ type: "CC_FILL_FORM", applicationId: "synthetic", authorization: { hashVersion: "cc-json-sha256-v1", id: "expired", expiresAtMs: Date.now() - 1 }, answers: [] });
  expect(response.ok).toBe(false);
  expect(document.querySelector<HTMLInputElement>("input")!.value).toBe(before);
});


describe("isolated synthetic form safety", () => {
  it("scans mixed controls without exposing passwords or inventing unsupported answers", () => {
    const send = loadContentScript(isolatedFixture, "/greenhouse.html");
    const scan = send({ type: "CC_SCAN_FORM" });
    expect(scan.fields?.length).toBeGreaterThan(8);
    expect(scan.fields?.some((field) => field.inputType === "password")).toBe(false);
    const unknown = scan.fields!.find((field) => field.elementId === "unknown")!;
    const fill = send({ type: "CC_FILL_FORM", authorization: { hashVersion: "cc-json-sha256-v1", id: "synthetic", expiresAtMs: Date.now()+60000 }, answers: [{ fieldId: unknown.id, answerSource: "user_required", confidence: 0, answer: "" }] });
    expect(fill.results?.[0].ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>("#unknown")!.value).toBe("");
    expect(document.querySelector<HTMLFormElement>("form")!.checkValidity()).toBe(false);
  });
  it("fails safely if an authorized field disappears before DOM fill", () => {
    const send = loadContentScript(isolatedFixture, "/dynamic.html");
    const field = send({ type: "CC_SCAN_FORM" }).fields!.find((field) => field.elementId === "first_name")!;
    document.querySelector("#first_name")!.remove();
    const response = send({ type: "CC_FILL_FORM", authorization: { hashVersion: "cc-json-sha256-v1", id: "synthetic", expiresAtMs: Date.now()+60000 }, answers: [{ fieldId: field.id, answerSource: "fixed_profile", confidence: 1, answer: "Synthetic" }] });
    expect(response.results?.[0].reason).toBe("field disappeared");
  });
  it("never navigates a multi-step form or triggers a final submit automatically", () => {
    const send = loadContentScript(isolatedFixture, "/multi-step.html");
    let submit = 0; document.querySelector("form")!.addEventListener("submit",(event)=>{event.preventDefault();submit++;});
    document.querySelector("#submit")!.addEventListener("click",()=>{submit++;});
    send({ type: "CC_FILL_FORM", authorization: { hashVersion: "cc-json-sha256-v1", id: "synthetic", expiresAtMs: Date.now()+60000 }, answers: [] });
    expect(submit).toBe(0);expect(document.querySelector<HTMLElement>("#step-two")!.hidden).toBe(true);
  });
});


describe("production partial file recovery", () => {
  it("rejects a changed question before reusing its field ID", () => {
    const send=loadContentScript(isolatedFixture,"/greenhouse.html");const field=send({type:"CC_SCAN_FORM"}).fields!.find(f=>f.elementId==="first_name")!;
    document.querySelector("#first_name")!.closest("label")!.firstChild!.textContent="Country of citizenship";
    const result=send({type:"CC_FILL_FORM",authorization:{id:"changed-question",hashVersion:"cc-json-sha256-v1",expiresAtMs:Date.now()+60000},answers:[{fieldId:field.id,originalQuestion:field.label,answer:"Synthetic",answerSource:"fixed_profile",confidence:1}]});expect(result.results?.[0].ok).toBe(false);expect(document.querySelector<HTMLInputElement>("#first_name")!.value).toBe("");
  });
  it("rejects navigation or missing bound destination before any mutation", () => {
    const send=loadContentScript(isolatedFixture,"/greenhouse.html");
    for(const expectedPageUrl of [undefined,"https://jobs.lever.co/other/apply"]) expect(send({type:"CC_FILL_FORM",expectedPageUrl,authorization:{id:"nav",hashVersion:"cc-json-sha256-v1",expiresAtMs:Date.now()+60000},answers:[]}).ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>("#first_name")!.value).toBe("");
  });
  it("verifies controlled file assignment and avoids duplicate attachment with fresh authorization", () => {
    const send = loadContentScript(isolatedFixture, "/lever.html"); const field=send({type:"CC_SCAN_FORM"}).fields!.find(f=>f.elementId==="resume")!;
    const input=document.querySelector<HTMLInputElement>("#resume")!;
    let files: File[]=[];let mutations=0;Object.defineProperty(input,"files",{configurable:true,get:()=>files,set:(value:File[])=>{files=value;mutations++;}});
    const prior=globalThis.DataTransfer;
    Object.assign(globalThis,{DataTransfer:class {files:File[]=[];items={add:(file:File)=>this.files.push(file)};}});
    try {
      const data={fieldId:field.id,answerSource:"fixed_profile",confidence:1,fillKind:"resume_file",resumeFile:{filename:"Synthetic.pdf",mimeType:"application/pdf",fileBase64:"JVBERi0xLjcK"}};
      const one=send({type:"CC_FILL_FORM",authorization:{id:"controlled-one",hashVersion:"cc-json-sha256-v1",expiresAtMs:Date.now()+60000},answers:[data]});expect(one.results?.[0]).toMatchObject({ok:true,attachmentStatus:"attached"});
      const two=send({type:"CC_FILL_FORM",authorization:{id:"controlled-two",hashVersion:"cc-json-sha256-v1",expiresAtMs:Date.now()+60000},answers:[data]});expect(two.results?.[0]).toMatchObject({ok:true,unchanged:true});expect(mutations).toBe(1);
    } finally {Object.assign(globalThis,{DataTransfer:prior});}
  });
  const token = (id: string) => ({ id, hashVersion: "cc-json-sha256-v1", expiresAtMs: Date.now()+60000 });
  const instruction = (field: Record<string, unknown>, file = false) => ({ fieldId: field.id, originalQuestion: field.label, detectedFieldType: field.detectedFieldType, answer: "Synthetic", answerSource: "fixed_profile", confidence: 1, ...(file ? { fillKind: "resume_file", resumeFile: { filename: "Synthetic.pdf", mimeType: "application/pdf", fileBase64: "JVBERi0xLjcK" } } : {}) });
  it("retains independent fields and reports missing DataTransfer instead of throwing", () => {
    const send = loadContentScript(isolatedFixture, "/lever.html");
    const fields = send({ type: "CC_SCAN_FORM" }).fields!;
    const first = fields.find(f=>f.elementId==="first_name")!; const resume = fields.find(f=>f.elementId==="resume")!;
    const response = send({ type:"CC_FILL_FORM", authorization:token("partial"), answers:[instruction(first),instruction(resume,true)] });
    expect(document.querySelector<HTMLInputElement>("#first_name")!.value).toBe("Synthetic");
    expect(response.ok).toBe(false); expect(response).toMatchObject({ partial:true,error:{code:"partial_fill"} });
    expect(response.results?.find(r=>r.fieldId===resume.id)).toMatchObject({ attachmentStatus:"not_verified",ok:false });
    expect(send({type:"CC_FILL_FORM",authorization:token("partial"),answers:[]} ).ok).toBe(false);
    expect(send({type:"CC_FILL_FORM",authorization:token("retry"),answers:[instruction(first)]}).results?.[0]).toMatchObject({ ok:true,unchanged:true });
  });
  it("rejects a same-metadata file replacement during form events", () => {
    const send = loadContentScript(isolatedFixture, "/lever.html"); const fields = send({ type: "CC_SCAN_FORM" }).fields!;
    const input = document.querySelector<HTMLInputElement>("#resume")!; let files: File[] = [];
    Object.defineProperty(input, "files", { configurable: true, get: () => files, set: (value: File[]) => { files = value; } });
    const prior = globalThis.DataTransfer;
    Object.assign(globalThis, { DataTransfer: class { files: File[] = []; items = { add: (file: File) => this.files.push(file) }; } });
    input.addEventListener("change", () => { const file = files[0]; files = [new File([new Uint8Array(file.size).fill(42)], file.name, { type: file.type })]; });
    try {
      const result = send({ type: "CC_FILL_FORM", authorization: token("counterfeit-file"), answers: [instruction(fields.find(f => f.elementId === "first_name")!), instruction(fields.find(f => f.elementId === "resume")!, true)] });
      expect(result).toMatchObject({ ok: false, partial: true });
      expect(result.results?.find(r => r.fieldId === fields.find(f => f.elementId === "resume")!.id)).toMatchObject({ ok: false, attachmentStatus: "not_verified" });
    } finally { Object.assign(globalThis, { DataTransfer: prior }); }
  });
  it("catches interrupted attachment and continues later fields", () => {
    const send = loadContentScript(isolatedFixture, "/ashby.html"); const fields = send({type:"CC_SCAN_FORM"}).fields!;
    const prior = globalThis.DataTransfer;
    Object.assign(globalThis,{DataTransfer:class { constructor(){throw new Error("synthetic interruption");} }});
    try { const response = send({type:"CC_FILL_FORM",authorization:token("interrupted"),answers:[instruction(fields.find(f=>f.elementId==="resume")!,true),instruction(fields.find(f=>f.elementId==="first_name")!)]});expect(response.results?.[0]).toMatchObject({ok:false,attachmentStatus:"failed"});expect(response.results?.[1].ok).toBe(true); }
    finally { Object.assign(globalThis,{DataTransfer:prior}); }
  });
  it.each([{}, {id:"wrong"}, {id:"synthetic-extension",origin:"https://jobs.lever.co",url:"chrome-extension://synthetic-extension/background.js"}])("rejects forged content sender", sender => { const send=loadContentScript(isolatedFixture,"/greenhouse.html");expect(send({type:"CC_FILL_FORM",authorization:token("bad"),answers:[]},sender).ok).toBe(false); });
});
