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
