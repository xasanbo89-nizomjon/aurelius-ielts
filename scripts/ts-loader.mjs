// Module-loader hooks that let the maintenance scripts in this folder import the app's own TypeScript modules in plain Node:
//   "@/…" paths -> src/…, extension-less imports -> .ts/.tsx, "server-only" -> an empty module, TypeScript -> JavaScript (via the project's own `typescript`).
// Used only through scripts/register-ts.mjs (node --import ./scripts/register-ts.mjs …). Nothing in the app imports this file.
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(pathToFileURL(path.join(ROOT, "package.json")));
const ts = require("typescript");
const EMPTY = pathToFileURL(path.join(ROOT, "scripts", "stub-empty.mjs")).href;

function tryFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: EMPTY, shortCircuit: true };

  if (specifier.startsWith("@/")) {
    const file = tryFile(path.join(ROOT, "src", specifier.slice(2)));
    if (!file) throw new Error(`alias not found: ${specifier}`);
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  const parent = context.parentURL;
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && parent?.startsWith("file:") && !path.extname(specifier)) {
    const file = tryFile(path.resolve(path.dirname(fileURLToPath(parent)), specifier));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  // next/* subpaths need an explicit .js in native ESM.
  if (/^next\/[a-z-]+$/.test(specifier)) return nextResolve(`${specifier}.js`, context);

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && /\.(ts|tsx)$/.test(url)) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: fileURLToPath(url),
    });
    return { format: "module", source: out.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
