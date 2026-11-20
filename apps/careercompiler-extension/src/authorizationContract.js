// Shared by the desktop authorizer and extension. Not RFC 8785: bounded JSON-v1.
export const HASH_VERSION = "cc-json-sha256-v1";
function jsonString(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("canonical_invalid_unicode");
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("canonical_invalid_unicode");
  }
  return JSON.stringify(value);
}
export function canonicalJson(value) {
  const ancestors = new Set();
  function encode(item, depth) {
    if (depth > 64) throw new Error("canonical_depth_limit");
    if (item === null) return "null";
    if (typeof item === "string") return jsonString(item);
    if (typeof item === "boolean") return item ? "true" : "false";
    if (typeof item === "number") {
      if (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item))) throw new Error("canonical_invalid_number");
      return JSON.stringify(item); // ECMAScript finite-number spelling; -0 equals 0.
    }
    if (typeof item !== "object" || ancestors.has(item)) throw new Error("canonical_unsupported_value");
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error("canonical_unsupported_object");
    if (Object.getOwnPropertySymbols(item).length) throw new Error("canonical_symbol_key");
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) {
      if (Object.keys(item).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length)) throw new Error("canonical_invalid_array");
      const parts = [];
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || !('value' in descriptor)) throw new Error("canonical_invalid_array");
        parts.push(encode(descriptor.value, depth + 1));
      }
      result = `[${parts.join(',')}]`;
    } else {
      const parts = [];
      for (const key of Object.keys(item).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !('value' in descriptor)) throw new Error("canonical_accessor");
        // Optional object members follow the JSON wire contract. Null is retained.
        if (descriptor.value === undefined) continue;
        parts.push(`${jsonString(key)}:${encode(descriptor.value, depth + 1)}`);
      }
      result = `{${parts.join(',')}}`;
    }
    ancestors.delete(item);
    return result;
  }
  return encode(value, 0);
}
export async function canonicalDigest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function supportedApplicationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com'].includes(url.hostname) && url.pathname !== '/';
  } catch { return false; }
}
export function trustedPopupSender(sender, extensionId) {
  const origin = `chrome-extension://${extensionId}`;
  return Boolean(sender && sender.id === extensionId && sender.origin === origin && sender.url === `${origin}/popup.html` && !sender.tab);
}
export function trustedWorkerSender(sender, extensionId) {
  const origin = `chrome-extension://${extensionId}`;
  return Boolean(sender && sender.id === extensionId && sender.origin === origin && sender.url === `${origin}/background.js` && !sender.tab);
}
