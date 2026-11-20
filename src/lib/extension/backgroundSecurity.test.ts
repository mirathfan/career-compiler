import { describe, expect, it, vi } from "vitest";
import background from "../../../apps/careercompiler-extension/src/background.js?raw";
import { canonicalDigest, HASH_VERSION, supportedApplicationUrl, trustedPopupSender } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
function setup(url = "https://jobs.lever.co/synthetic/apply") {
  let listener!: (message: unknown, sender: unknown, respond: (value: unknown) => void) => boolean;
  const chrome = { runtime: { id: "test", connectNative: vi.fn(), onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } }, tabs: { query: vi.fn(async () => [{ id: 1, url }]), sendMessage: vi.fn(async () => ({ ok: true, fields: [] })) }, storage: { local: { get: vi.fn(async () => ({})) } } };
  new Function("chrome", "canonicalDigest", "HASH_VERSION", "supportedApplicationUrl", "trustedPopupSender", background.replace(/^import .*;\n/, ""))(chrome, canonicalDigest, HASH_VERSION, supportedApplicationUrl, trustedPopupSender);
  return { listener, chrome };
}
const sender = { id: "test", origin: "chrome-extension://test", url: "chrome-extension://test/popup.html" };
describe("actual service worker authorization", () => {
  it.each([{}, undefined, { ...sender, id: "wrong" }, { ...sender, origin: undefined }, { ...sender, tab: { id: 1 } }, { ...sender, url: "https://jobs.lever.co/synthetic" }])("rejects untrusted sender before privileged work", value => {
    const { listener, chrome } = setup(); const respond = vi.fn(); listener({ type: "CC_POPUP_FILL", origin: sender.origin }, value, respond);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false })); expect(chrome.tabs.query).not.toHaveBeenCalled(); expect(chrome.runtime.connectNative).not.toHaveBeenCalled();
  });
  it.each([null, "bad", {}, { type: "READ_FILE" }])("rejects malformed/unsupported messages", async message => { const { listener, chrome } = setup(); const respond = vi.fn(); listener(message, sender, respond); await Promise.resolve(); expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false })); expect(chrome.runtime.connectNative).not.toHaveBeenCalled(); });
  it("rejects unsupported current tab even with forged message origin", async () => { const { listener, chrome } = setup("https://evil.invalid/form"); const result = await new Promise(resolve => listener({ type: "CC_POPUP_SCAN", pageUrl: "https://jobs.lever.co/synthetic" }, sender, resolve)); expect(result).toMatchObject({ ok: false }); expect(chrome.tabs.sendMessage).not.toHaveBeenCalled(); });
});
