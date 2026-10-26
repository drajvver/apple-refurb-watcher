import * as cheerio from "cheerio";
import { Product, ProductSpecs } from "./types";
import { getRefurbUrl, getCountryConfig, DEFAULT_COUNTRY, FETCH_TIMEOUT_MS } from "./config";

interface RawDimensions {
  dimensionCapacity?: string;
  dimensionScreensize?: string;
  refurbClearModel?: string;
  dimensionRelYear?: string;
  dimensionColor?: string;
  tsMemorySize?: string;
}

interface RawTile {
  partNumber: string;
  title: string;
  productDetailsUrl: string;
  price: {
    currentPrice: { raw_amount: string };
    previousPrice?: { raw_amount: string };
    originalProductAmount?: number;
    priceCurrency: string;
    refurbProduct: boolean;
  };
  image?: {
    sources?: { srcSet: string }[];
  };
  filters?: {
    dimensions?: RawDimensions;
  };
}

/** Apple's own labels for every dimension value, e.g. `refurbClearModel.macbookneo.text = "MacBook Neo"`. */
type DimensionLabels = Record<string, Record<string, { text?: string }>>;

interface RefurbGridBootstrap {
  tiles: RawTile[];
  dictionaries?: {
    dimensions?: DimensionLabels;
  };
}

function extractBootstrapData(html: string): RefurbGridBootstrap | null {
  const match = html.match(
    /window\.REFURB_GRID_BOOTSTRAP\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/
  );
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function parsePrice(raw: string): number {
  return parseFloat(raw.replace(/[^\d.]/g, ""));
}

const MODEL_NAMES: Record<string, string> = {
  macbookneo: "MacBook Neo",
  macbookair: "MacBook Air",
  macbookpro: "MacBook Pro",
  imac: "iMac",
  macmini: "Mac mini",
  macstudio: "Mac Studio",
  macpro: "Mac Pro",
};

// Ordered so the more specific names win (e.g. "Studio Display XDR" before "Studio Display").
const MODEL_PATTERNS: [RegExp, string][] = [
  [/MacBook\s+Neo/i, "MacBook Neo"],
  [/MacBook\s+Air/i, "MacBook Air"],
  [/MacBook\s+Pro/i, "MacBook Pro"],
  [/iMac/i, "iMac"],
  [/Mac\s+mini/i, "Mac mini"],
  [/Mac\s+Studio/i, "Mac Studio"],
  [/Mac\s+Pro/i, "Mac Pro"],
  [/Studio\s+Display\s+XDR/i, "Studio Display XDR"],
  [/Pro\s+Display\s+XDR/i, "Pro Display XDR"],
  [/Studio\s+Display/i, "Studio Display"],
];

const COLOR_NAMES: Record<string, string> = {
  silver: "Silver",
  spacegray: "Space Gray",
  space_gray: "Space Gray",
  spaceblack: "Space Black",
  space_black: "Space Black",
  midnight: "Midnight",
  starlight: "Starlight",
  skyblue: "Sky Blue",
  blue: "Blue",
  green: "Green",
  pink: "Pink",
  purple: "Purple",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  graphite: "Graphite",
  gold: "Gold",
  citrus: "Citrus",
  blush: "Blush",
  indigo: "Indigo",
};

/** "16gb" → "16 GB", "1_5tb" / "1point5tb" → "1.5 TB" */
function formatSize(raw?: string): string {
  if (!raw) return "";
  const match = raw.toLowerCase().match(/^(\d+)(?:(?:_|point)(\d+))?(gb|tb)$/);
  if (!match) return raw.toUpperCase();
  const [, whole, fraction, unit] = match;
  return `${whole}${fraction ? `.${fraction}` : ""} ${unit.toUpperCase()}`;
}

function parseModelFromTitle(title: string): string {
  return MODEL_PATTERNS.find(([pattern]) => pattern.test(title))?.[1] ?? "";
}

function resolveModel(key: string | undefined, title: string, labels?: DimensionLabels): string {
  const label = key ? labels?.refurbClearModel?.[key]?.text : undefined;
  // "display" covers Studio Display, Studio Display XDR, etc. — only the title tells them apart.
  if (key === "display") return parseModelFromTitle(title) || label || "Display";
  if (key && MODEL_NAMES[key]) return MODEL_NAMES[key];
  // Unknown (newly launched) model: trust Apple's own label over title guessing.
  return label || parseModelFromTitle(title) || key || "";
}

function resolveColor(key: string | undefined, labels?: DimensionLabels): string {
  if (!key) return "";
  return COLOR_NAMES[key] ?? labels?.dimensionColor?.[key]?.text ?? key;
}

// Matches "Apple M5 Pro chip", "chip M4 de Apple" (es), "Apple A18 Pro chip", ...
function parseChipFromTitle(title: string): string {
  const match = title.match(/\b([AM]\d{1,2}(?:\s+(?:Pro|Max|Ultra))?)\b/);
  return match ? match[1].replace(/\s+/g, " ") : "";
}

// Languages that put the count after the label: "CPU 10 cœurs", "CPU de 10 núcleos", "CPU 10-core".
const COUNT_AFTER_LABEL_LANGUAGES = new Set(["fr", "es", "it"]);

/** "10‑Core CPU and 8‑Core GPU" → "10C CPU / 8C GPU" */
function parseCoresFromTitle(title: string, language: string): string {
  const countAfter = COUNT_AFTER_LABEL_LANGUAGES.has(language);
  const count = (unit: "CPU" | "GPU") => {
    const pattern = countAfter
      ? new RegExp(`${unit}\\D{0,6}?(\\d+)`)
      : new RegExp(`(\\d+)[^\\d,]{0,20}?${unit}`);
    return title.match(pattern)?.[1];
  };
  const cpu = count("CPU");
  const gpu = count("GPU");
  return [cpu && `${cpu}C CPU`, gpu && `${gpu}C GPU`].filter(Boolean).join(" / ");
}

function parseScreenSizeFromTitle(title: string, language: string): string {
  if (language === "pl") {
    const match = title.match(/(\d+)[\u2011\-]calowy/);
    if (match) return match[1] + '"';
  }
  const match = title.match(/(\d+(?:\.\d+)?)\s*(?:-?inch|")/i);
  if (match) return match[1] + '"';
  const frMatch = title.match(/(\d+(?:[,\.]\d+)?)\s*pouces?/i);
  if (frMatch) return frMatch[1].replace(",", ".") + '"';
  return "";
}

function buildSpecsFromDimensions(
  dims: RawDimensions | undefined,
  title: string,
  language: string,
  labels?: DimensionLabels
): ProductSpecs {
  return {
    model: resolveModel(dims?.refurbClearModel, title, labels),
    screenSize: dims?.dimensionScreensize
      ? dims.dimensionScreensize.replace(/point|_/, ".").replace("inch", '"')
      : parseScreenSizeFromTitle(title, language),
    chip: parseChipFromTitle(title),
    cores: parseCoresFromTitle(title, language),
    memory: formatSize(dims?.tsMemorySize),
    storage: formatSize(dims?.dimensionCapacity),
    color: resolveColor(dims?.dimensionColor, labels),
    year: dims?.dimensionRelYear ?? "",
  };
}

function parseSpecsFromTitle(title: string, country: string): ProductSpecs {
  const language = getCountryConfig(country).language;
  const screenSize = parseScreenSizeFromTitle(title, language);
  const chip = parseChipFromTitle(title);
  const colorMatch = title.match(/[–\u2013]\s*([^\s].+)$/);

  return {
    model: parseModelFromTitle(title),
    screenSize,
    chip,
    cores: parseCoresFromTitle(title, language),
    memory: "",
    storage: "",
    color: colorMatch ? colorMatch[1].trim() : "",
    year: "",
  };
}

export async function fetchProducts(country: string = DEFAULT_COUNTRY): Promise<Product[]> {
  const config = getCountryConfig(country);
  const url = getRefurbUrl(country);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": `${config.locale},${config.language};q=0.9,en-US;q=0.8,en;q=0.7`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseProducts(html, country);
}

export function parseProducts(html: string, country: string): Product[] {
  const bootstrap = extractBootstrapData(html);

  // The embedded catalog is authoritative, even when it is legitimately empty.
  if (bootstrap && Array.isArray(bootstrap.tiles)) {
    const labels = bootstrap.dictionaries?.dimensions;
    return bootstrap.tiles
      .map((tile) => normalizeTile(tile, country, labels))
      .filter((p) => Number.isFinite(p.refurbPrice) && p.refurbPrice > 0);
  }

  // No catalog and no product markup usually means a blocked or redesigned page.
  // Throwing keeps the previous state instead of reporting every product as removed.
  const products = parseFromHtml(html, country);
  if (products.length === 0) {
    throw new Error(
      "No products found on Apple's page. The page layout may have changed."
    );
  }
  return products;
}

function normalizeTile(tile: RawTile, country: string, labels?: DimensionLabels): Product {
  const config = getCountryConfig(country);
  const refurbPrice = parsePrice(tile.price.currentPrice.raw_amount);
  const listedOriginal =
    tile.price.originalProductAmount ??
    (tile.price.previousPrice
      ? parsePrice(tile.price.previousPrice.raw_amount)
      : null);
  // Apple sometimes repeats the current price as the "previous" one; that is not a discount.
  const originalPrice =
    listedOriginal !== null && listedOriginal > refurbPrice ? listedOriginal : null;

  const savings =
    originalPrice !== null ? Math.round((originalPrice - refurbPrice) * 100) / 100 : null;
  const savingsPercent =
    originalPrice !== null
      ? Math.round(((originalPrice - refurbPrice) / originalPrice) * 100 * 10) / 10
      : null;

  const dims = tile.filters?.dimensions;
  const language = config.language;
  const specs =
    dims && Object.keys(dims).length > 0
      ? buildSpecsFromDimensions(dims, tile.title, language, labels)
      : parseSpecsFromTitle(tile.title, country);

  return {
    partNumber: tile.partNumber,
    title: tile.title,
    url: `https://www.apple.com${tile.productDetailsUrl}`,
    refurbPrice,
    originalPrice,
    savings,
    savingsPercent,
    currency: tile.price.priceCurrency || config.currency,
    image: tile.image?.sources?.[0]?.srcSet,
    specs,
  };
}

function parseLocalePrice(text: string, country: string): number {
  const config = getCountryConfig(country);
  let cleaned = text.replace(/[^\d.,\s]/g, "");

  if (config.thousandSeparator === ",") {
    cleaned = cleaned.replace(/,/g, "");
  } else if (config.thousandSeparator === ".") {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (config.thousandSeparator === " ") {
    cleaned = cleaned.replace(/\s/g, "").replace(",", ".");
  }

  return parseFloat(cleaned) || 0;
}

function parseFromHtml(html: string, country: string): Product[] {
  const config = getCountryConfig(country);
  const $ = cheerio.load(html);
  const products: Product[] = [];

  $(".rf-refurb-category-grid-no-js li").each((_, el) => {
    const li = $(el);
    const titleEl = li.find("h3 a");
    const title = titleEl.text().trim();
    const url = "https://www.apple.com" + titleEl.attr("href");

    const currentPriceText = li
      .find(".as-price-currentprice, .as-producttile-currentprice")
      .text();
    const refurbPrice = parseLocalePrice(currentPriceText, country);

    const prevPriceText = li
      .find(".as-price-previousprice")
      .text();
    const originalPrice = parseLocalePrice(prevPriceText, country) || null;

    const savings =
      originalPrice !== null
        ? Math.round((originalPrice - refurbPrice) * 100) / 100
        : null;
    const savingsPercent =
      originalPrice !== null
        ? Math.round(((originalPrice - refurbPrice) / originalPrice) * 100 * 10) / 10
        : null;

    const partNumber =
      url.split("/").pop()?.split("?")[0]?.toUpperCase() || "";

    if (title && refurbPrice > 0) {
      products.push({
        partNumber,
        title,
        url,
        refurbPrice,
        originalPrice,
        savings,
        savingsPercent,
        currency: config.currency,
        specs: parseSpecsFromTitle(title, country),
      });
    }
  });

  return products;
}
