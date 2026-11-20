import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalDigest, HASH_VERSION, supportedApplicationUrl, trustedPopupSender, trustedWorkerSender } from "../../../apps/careercompiler-extension/src/authorizationContract.js";

describe("production canonical payload contract", () => {
  it("canonicalizes nested keys, Unicode, escaping and numeric spellings", async () => {
    const a = { z: [1, -0, { text: '日本語 😀 " \\ \n', a: null }], a: true };
    const b = { a: true, z: [1.0, 0e0, { a: null, text: '日本語 😀 " \\ \n' }] };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(await canonicalDigest(a)).toBe(await canonicalDigest(b));
    expect(await canonicalDigest({ a: undefined })).toBe(await canonicalDigest({}));
    expect(await canonicalDigest({ a: null })).not.toBe(await canonicalDigest({}));
  });
  it.each([[{ a: [1, 2] }, { a: [2, 1] }], [{ a: 1 }, { a: "1" }], [{ a: false }, { a: null }], [{ packageRevision: "a" }, { packageRevision: "b" }], [{ resume: "a" }, { resume: "b" }], [{ job: "a" }, { job: "b" }]])("preserves meaningful differences", async (a, b) => { expect(await canonicalDigest(a)).not.toBe(await canonicalDigest(b)); });
  it.each([NaN, Infinity, BigInt(1), undefined, () => 1, new Date(), [undefined], new Array(1), "\ud800", { a: Number.MAX_SAFE_INTEGER + 1 }])("rejects unsupported values", (value) => { expect(() => canonicalJson(value)).toThrow(); });
  it("rejects cycles and getters without executing them", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow();
    let called = false; expect(() => canonicalJson({ get private() { called = true; return 1; } })).toThrow(); expect(called).toBe(false);
  });
  it("has an explicit new hash version", () => expect(HASH_VERSION).toBe("cc-json-sha256-v1"));
});
describe("production extension sender/destination contract", () => {
  const sender = { id: "test", origin: "chrome-extension://test", url: "chrome-extension://test/popup.html" };
  it("accepts only the real popup identity and worker shape", () => { expect(trustedPopupSender(sender, "test")).toBe(true); expect(trustedWorkerSender({ ...sender, url: "chrome-extension://test/background.js" }, "test")).toBe(true); });
  it.each([undefined, {}, { ...sender, id: "other" }, { ...sender, origin: undefined }, { ...sender, origin: "https://jobs.lever.co" }, { ...sender, url: "https://jobs.lever.co/x" }, { ...sender, tab: { id: 1 } }])("rejects missing/forged/content sender", (value) => expect(trustedPopupSender(value, "test")).toBe(false));
  it.each(["http://jobs.lever.co/x", "https://jobs.lever.co.evil.invalid/x", "https://user@jobs.lever.co/x", "http://127.0.0.1:5297/lever.html", "file:///tmp/x", "not-a-url"])('rejects %s', url => expect(supportedApplicationUrl(url)).toBe(false));
});
