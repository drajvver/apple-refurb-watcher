import path from "path";

export interface CountryConfig {
  code: string;
  name: string;
  urlPath: string;
  locale: string;
  currency: string;
  language: string;
  thousandSeparator: string;
  decimalSeparator: string;
}

export const COUNTRIES: CountryConfig[] = [
  { code: "pl", name: "Poland", urlPath: "pl", locale: "pl-PL", currency: "PLN", language: "pl", thousandSeparator: ".", decimalSeparator: "," },
  { code: "us", name: "United States", urlPath: "us", locale: "en-US", currency: "USD", language: "en", thousandSeparator: ",", decimalSeparator: "." },
  { code: "uk", name: "United Kingdom", urlPath: "uk", locale: "en-GB", currency: "GBP", language: "en", thousandSeparator: ",", decimalSeparator: "." },
  { code: "de", name: "Germany", urlPath: "de", locale: "de-DE", currency: "EUR", language: "de", thousandSeparator: ".", decimalSeparator: "," },
  { code: "fr", name: "France", urlPath: "fr", locale: "fr-FR", currency: "EUR", language: "fr", thousandSeparator: " ", decimalSeparator: "," },
  { code: "es", name: "Spain", urlPath: "es", locale: "es-ES", currency: "EUR", language: "es", thousandSeparator: ".", decimalSeparator: "," },
  { code: "it", name: "Italy", urlPath: "it", locale: "it-IT", currency: "EUR", language: "it", thousandSeparator: ".", decimalSeparator: "," },
  { code: "ca", name: "Canada", urlPath: "ca", locale: "en-CA", currency: "CAD", language: "en", thousandSeparator: ",", decimalSeparator: "." },
  { code: "au", name: "Australia", urlPath: "au", locale: "en-AU", currency: "AUD", language: "en", thousandSeparator: ",", decimalSeparator: "." },
];

export const DEFAULT_COUNTRY = "pl";

export function getCountryConfig(code: string): CountryConfig {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function getRefurbUrl(country: string): string {
  const config = getCountryConfig(country);
  return `https://www.apple.com/${config.urlPath}/shop/refurbished/mac`;
}

export const DATA_DIR = path.join(process.cwd(), "data");
export const LEGACY_STATE_FILE = path.join(DATA_DIR, "state.json");

export function getStateFile(country: string): string {
  return path.join(DATA_DIR, `state-${country}.json`);
}
