export const HASH_VERSION: "cc-json-sha256-v1";
export function canonicalJson(value: unknown): string;
export function canonicalDigest(value: unknown): Promise<string>;
export function supportedApplicationUrl(value: unknown): boolean;
export function trustedPopupSender(sender: unknown, extensionId: string): boolean;
export function trustedWorkerSender(sender: unknown, extensionId: string): boolean;
