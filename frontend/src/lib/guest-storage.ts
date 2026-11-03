// Claim secrets and the guest's name live only in this browser.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded.

const SECRETS_KEY = "gimme:claim-secrets";
const NAME_KEY = "gimme:claimer-name";

function readSecrets(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SECRETS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeSecrets(secrets: Record<string, string>) {
  try {
    localStorage.setItem(SECRETS_KEY, JSON.stringify(secrets));
  } catch {
    // Without storage the guest just can't unclaim later
  }
}

export function getClaimSecret(itemId: string): string | undefined {
  return readSecrets()[itemId];
}

export function saveClaimSecret(itemId: string, secret: string) {
  writeSecrets({ ...readSecrets(), [itemId]: secret });
}

export function forgetClaimSecret(itemId: string) {
  const { [itemId]: _, ...rest } = readSecrets();
  writeSecrets(rest);
}

export function getClaimerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveClaimerName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembering the name is fine
  }
}

// Share tokens of lists the signed-in owner has on this device. The guest page uses them to
// hide claims when an owner opens their own link, so they don't spoil the surprise by accident.
const OWN_TOKENS_KEY = "gimme:own-share-tokens";

function readOwnTokens(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OWN_TOKENS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// `replace` sets the full list (from the lists screen, which knows every current token);
// otherwise the tokens are added, e.g. after a new share link is made
export function rememberOwnShareTokens(tokens: string[], replace = false) {
  const next = replace ? tokens : [...new Set([...readOwnTokens(), ...tokens])];
  try {
    localStorage.setItem(OWN_TOKENS_KEY, JSON.stringify(next));
  } catch {
    // Without storage the owner just sees claims on their own link, as before
  }
}

export const isOwnShareToken = (token: string) =>
  readOwnTokens().includes(token);
