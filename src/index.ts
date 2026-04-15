#!/usr/bin/env node

import chalk from "chalk";
import { fetchProducts } from "./services/scraper";
import { fetchAndDetectChanges } from "./services/watcher";
import { displayProductTable, displayChanges } from "./cli/display";
import { DEFAULT_POLL_INTERVAL_SECONDS, REFURB_MAC_URL } from "./config";

function parseArgs(): { command: string; interval: number } {
  const args = process.argv.slice(2);
  const command = args[0] || "list";

  let interval = DEFAULT_POLL_INTERVAL_SECONDS;
  const intervalIdx = args.indexOf("--interval");
  if (intervalIdx !== -1 && args[intervalIdx + 1]) {
    const parsed = parseInt(args[intervalIdx + 1], 10);
    if (parsed > 0) interval = parsed;
  }

  return { command, interval };
}

async function listCommand(): Promise<void> {
  console.log(chalk.dim(`Fetching ${REFURB_MAC_URL}...\n`));
  const result = await fetchAndDetectChanges(fetchProducts);
  displayProductTable(result.currentProducts);

  if (result.isFirstRun) {
    console.log(chalk.dim("  State saved. Next run will show changes since this snapshot.\n"));
    return;
  }

  if (result.changes.length === 0) {
    console.log(chalk.dim("  No changes since last run.\n"));
    return;
  }

  console.log(chalk.cyan.bold("  Changes since last run:"));
  displayChanges(result);
}

async function watchCommand(intervalSeconds: number): Promise<void> {
  console.log(
    chalk.cyan("Apple Refurb Watcher") +
      chalk.dim(` — polling every ${intervalSeconds}s\n`)
  );

  const poll = async () => {
    try {
      const result = await fetchAndDetectChanges(fetchProducts);
      displayChanges(result);
    } catch (err) {
      const time = new Date().toLocaleTimeString("pl-PL");
      console.error(
        chalk.dim(`[${time}]`) + chalk.red(` Error: ${(err as Error).message}`)
      );
    }
  };

  await poll();
  setInterval(poll, intervalSeconds * 1000);
}

function printHelp(): void {
  console.log(`
${chalk.cyan("apple-refurb-watcher")} — monitor Apple's refurbished Mac store (Poland)

${chalk.bold("Usage:")}
  apple-refurb-watcher list                Fetch and display current listings (default)
  apple-refurb-watcher watch [--interval N] Poll every N seconds (default 300)
  apple-refurb-watcher help                 Show this help

${chalk.bold("Examples:")}
  apple-refurb-watcher                      Show current refurb Mac listings
  apple-refurb-watcher list                 Same as above
  apple-refurb-watcher watch                Watch for changes every 5 minutes
  apple-refurb-watcher watch --interval 60  Watch every 60 seconds
`);
}

async function main(): Promise<void> {
  const { command, interval } = parseArgs();

  switch (command) {
    case "list":
      await listCommand();
      break;
    case "watch":
      await watchCommand(interval);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(chalk.red(`Unknown command: ${command}`));
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${(err as Error).message}`));
  process.exit(1);
});
