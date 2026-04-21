import * as cheerio from "cheerio";
import { Product, ProductSpecs } from "./types";
import { getRefurbUrl, getCountryConfig, DEFAULT_COUNTRY } from "./config";

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

interface RefurbGridBootstrap {
  tiles: RawTile[];
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
  macbookair: "MacBook Air",
  macbookpro: "MacBook Pro",
  imac: "iMac",
  macmini: "Mac Mini",
  macstudio: "Mac Studio",
  macpro: "Mac Pro",
};

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
};

function formatStorage(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/gb/i, " GB").replace(/tb/i, " TB").toUpperCase();
}

function formatMemory(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/gb/i, " GB").toUpperCase();
}

function parseChipFromTitle(title: string): string {
  const match = title.match(/Apple\s+(M\d+(?:\s+(?:Pro|Max|Ultra))?)/i);
  return match ? match[1].replace(/\s+/g, " ") : "";
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
  language: string
): ProductSpecs {
  return {
    model: MODEL_NAMES[dims?.refurbClearModel ?? ""] ?? "",
    screenSize: dims?.dimensionScreensize
      ? dims.dimensionScreensize.replace("inch", '"')
      : "",
    chip: parseChipFromTitle(title),
    memory: formatMemory(dims?.tsMemorySize),
    storage: formatStorage(dims?.dimensionCapacity),
    color: COLOR_NAMES[dims?.dimensionColor ?? ""] ?? dims?.dimensionColor ?? "",
    year: dims?.dimensionRelYear ?? "",
  };
}

function parseSpecsFromTitle(title: string, country: string): ProductSpecs {
  const language = getCountryConfig(country).language;
  const modelMatch = title.match(
    /(MacBook\s+Air|MacBook\s+Pro|iMac|Mac\s+Mini|Mac\s+Studio|Mac\s+Pro)/i
  );
  const screenSize = parseScreenSizeFromTitle(title, language);
  const chip = parseChipFromTitle(title);
  const colorMatch = title.match(/[–\u2013]\s*([^\s].+)$/);

  return {
    model: modelMatch ? modelMatch[1] : "",
    screenSize,
    chip,
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
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseProducts(html, country);
}

function parseProducts(html: string, country: string): Product[] {
  const bootstrap = extractBootstrapData(html);

  if (bootstrap && bootstrap.tiles && bootstrap.tiles.length > 0) {
    return bootstrap.tiles.map((tile) => normalizeTile(tile, country));
  }

  return parseFromHtml(html, country);
}

function normalizeTile(tile: RawTile, country: string): Product {
  const config = getCountryConfig(country);
  const refurbPrice = parsePrice(tile.price.currentPrice.raw_amount);
  const originalPrice =
    tile.price.originalProductAmount ??
    (tile.price.previousPrice
      ? parsePrice(tile.price.previousPrice.raw_amount)
      : null);

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
      ? buildSpecsFromDimensions(dims, tile.title, language)
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
