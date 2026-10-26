import path from "path";
import { DATA_DIR } from "./config";
import { readJson, writeJsonAtomic } from "./storage";

export interface AutoRefreshConfig {
  enabled: boolean;
  intervalMinutes: number;
}

export interface AppSettings {
  autoRefresh: Record<string, AutoRefreshConfig>;
}

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export function loadSettings(): AppSettings {
  const parsed = readJson<Partial<AppSettings>>(SETTINGS_FILE);
  return {
    autoRefresh: parsed?.autoRefresh ?? {},
  };
}

export function saveSettings(settings: AppSettings): void {
  writeJsonAtomic(SETTINGS_FILE, settings);
}

export function getAutoRefreshConfig(country: string): AutoRefreshConfig {
  const settings = loadSettings();
  return settings.autoRefresh[country] ?? { enabled: false, intervalMinutes: 60 };
}

export function setAutoRefreshConfig(
  country: string,
  config: AutoRefreshConfig
): void {
  const settings = loadSettings();
  settings.autoRefresh[country] = config;
  saveSettings(settings);
}
