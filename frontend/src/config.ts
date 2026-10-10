export type AppConfig = {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
};

let config: AppConfig | undefined;

// Loaded at runtime (not baked into the build) so CDK can write it on deploy
export async function loadConfig() {
  const response = await fetch("/config.json");

  if (!response.ok) {
    throw new Error(`Could not load /config.json (${response.status})`);
  }

  config = (await response.json()) as AppConfig;
  return config;
}

export function getConfig() {
  if (!config) {
    throw new Error("Config not loaded");
  }

  return config;
}
