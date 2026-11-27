import { brotliCompressSync } from "node:zlib";

export interface Budgets {
  coldEntryJs: number;
  firstViewCss: number;
}

export const BUDGETS: Budgets = { coldEntryJs: 150_000, firstViewCss: 50_000 };

const STATIC_IMPORT = /(?:^|[;}\s])import\s*(?:[\w$*{}\s,]+from\s*)?["'](\.\/[^"']+\.js)["']/g;
const SCRIPT_SRC = /<script[^>]+src="\.?\/?([^"]+\.js)"/g;

const STYLESHEET_HREF =
  /<link[^>]+rel="stylesheet"[^>]+href="\.?\/?([^"]+\.css)"|<link[^>]+href="\.?\/?([^"]+\.css)"[^>]+rel="stylesheet"/g;

export interface BudgetReport {
  js: { files: string[]; brotli: number };
  css: { files: string[]; brotli: number };
  failures: string[];
}

/** Every JS file a cold load executes before first render: entry scripts plus their static imports, each counted once. */
export interface ColdEntryFiles {
  js: string[];
  css: string[];
}

export function coldEntryFiles(html: string, read: (file: string) => string): ColdEntryFiles {
  const js = new Set<string>();
  const queue = [...html.matchAll(SCRIPT_SRC)].map((match) => match[1] ?? "");

  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (!file || js.has(file)) continue;

    js.add(file);

    for (const match of read(file).matchAll(STATIC_IMPORT)) queue.push((match[1] ?? "").slice(2));
  }

  const css = [...html.matchAll(STYLESHEET_HREF)].map((match) => match[1] ?? match[2] ?? "");

  return { js: [...js], css: css.filter(Boolean) };
}

export function checkBudgets(
  html: string,
  read: (file: string) => string,
  budgets: Budgets = BUDGETS,
): BudgetReport {
  const files = coldEntryFiles(html, read);

  const size = (list: string[]) =>
    list.reduce((sum, file) => sum + brotliCompressSync(read(file)).byteLength, 0);

  const js = { files: files.js, brotli: size(files.js) };
  const css = { files: files.css, brotli: size(files.css) };
  const failures: string[] = [];

  if (js.brotli > budgets.coldEntryJs)
    failures.push(`cold-entry JS ${js.brotli} B > ${budgets.coldEntryJs} B`);

  if (css.brotli > budgets.firstViewCss)
    failures.push(`first-view CSS ${css.brotli} B > ${budgets.firstViewCss} B`);

  return { js, css, failures };
}
