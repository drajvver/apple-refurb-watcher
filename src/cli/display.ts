import Table from "cli-table3";
import chalk from "chalk";
import { ProductSpecs, Product, WatcherResult } from "../types/product";

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    if (parts.length >= 5) {
      const part = parts[4].toUpperCase();
      const suffix = parts[5] ? "/" + parts[5].charAt(0).toUpperCase() : "";
      return `apple.com${u.pathname.substring(0, u.pathname.indexOf(parts[4]))}${part}${suffix}`;
    }
    return `apple.com${u.pathname}`;
  } catch {
    return url;
  }
}

function dim(val: string): string {
  return val ? val : chalk.gray("—");
}

function shortSummary(p: Product): string {
  const s = p.specs;
  const parts = [s.model, s.screenSize, s.chip, s.memory, s.storage, s.color].filter(Boolean);
  return parts.join(" ");
}

export function displayProductTable(products: Product[]): void {
  if (products.length === 0) {
    console.log(chalk.yellow("No refurbished Mac products found."));
    return;
  }

  const sorted = [...products].sort((a, b) => a.refurbPrice - b.refurbPrice);

  const table = new Table({
    head: [
      chalk.cyan.bold("#"),
      chalk.cyan.bold("Model"),
      chalk.cyan.bold("Size"),
      chalk.cyan.bold("Chip"),
      chalk.cyan.bold("RAM"),
      chalk.cyan.bold("Storage"),
      chalk.cyan.bold("Color"),
      chalk.cyan.bold("Orig."),
      chalk.cyan.bold("Refurb"),
      chalk.cyan.bold("Save"),
      chalk.cyan.bold("Link"),
    ],
    colWidths: [4, 14, 6, 12, 7, 7, 12, 11, 11, 18, 40],
    style: { head: [], border: ["gray"] },
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
  });

  sorted.forEach((p, i) => {
    const s: ProductSpecs = p.specs;
    const original = p.originalPrice
      ? formatPrice(p.originalPrice, p.currency)
      : chalk.gray("—");

    const refurb = formatPrice(p.refurbPrice, p.currency);

    let savings: string;
    if (p.savings !== null && p.savingsPercent !== null) {
      const savingsStr = formatPrice(p.savings, p.currency);
      savings = chalk.green(`${p.savingsPercent}% ${savingsStr}`);
    } else {
      savings = chalk.gray("—");
    }

    table.push([
      String(i + 1),
      dim(s.model),
      dim(s.screenSize),
      dim(s.chip),
      dim(s.memory),
      dim(s.storage),
      dim(s.color),
      original,
      refurb,
      savings,
      chalk.dim(cleanUrl(p.url)),
    ]);
  });

  console.log(table.toString());
  console.log(
    chalk.dim(
      `\n  ${products.length} products found • Sorted by price (low → high)\n`
    )
  );
}

export function displayChanges(result: WatcherResult, showHeader = true): void {
  if (showHeader) {
    const time = new Date(result.timestamp).toLocaleTimeString("pl-PL");
    const header = chalk.dim(`[${time}]`) + ` Polling... ${result.currentProducts.length} products`;
    if (result.changes.length === 0) {
      console.log(header + chalk.dim(" • no changes"));
      return;
    }
    console.log(header);
    console.log("");
  }

  for (const change of result.changes) {
    const summary = shortSummary(change.product);
    switch (change.type) {
      case "added":
        console.log(
          chalk.green.bold("    + NEW") +
            ` ${summary}` +
            chalk.dim(` — ${formatPrice(change.product.refurbPrice, change.product.currency)}`)
        );
        break;
      case "removed":
        console.log(
          chalk.red.bold("    - GONE") +
            ` ${summary}` +
            chalk.dim(` — was ${formatPrice(change.product.refurbPrice, change.product.currency)}`)
        );
        break;
      case "price_changed":
        console.log(
          chalk.yellow.bold("    ~ PRICE") +
            ` ${summary}` +
            chalk.dim(
              ` — ${formatPrice(change.previousPrice!, change.product.currency)} → ${formatPrice(change.product.refurbPrice, change.product.currency)}`
            )
        );
        break;
    }
  }
  console.log("");
}
