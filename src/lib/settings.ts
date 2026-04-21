import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config";

export interface AutoRefreshConfig {
  enabled: boolean;
  intervalMinutes: number;
}

export interface AppSettings {
  autoRefresh: Record<string, AutoRefreshConfig>;
}

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const DEFAULT_SETTINGS: AppSettings = {
  autoRefresh: {},
};

export function loadSettings(): AppSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return DEFAULT_SETTINGS;
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      autoRefresh: parsed.autoRefresh ?? {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
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
