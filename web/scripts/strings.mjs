// The page's strings, checked before every build (npm run build, npm run
// check); any problem stops it, as on the site.
//
//   node scripts/strings.mjs              everything
//   node scripts/strings.mjs --english    only English and the code, while
//                                         the other languages are not there
//   node scripts/strings.mjs --all        every problem, not the first 200
//
// The languages: one file each in src/i18n, as LANGUAGES in src/i18n.ts
// lists them; every one has every key of English and no others, each with
// English's values ({name}) and parts (<b>…</b>), and, where English counts
// (one: … | other: …), the plural forms of its own language (Unicode CLDR).
//
// The code: every t("key") is a string of English, with its values; every
// string of English is used; and no text is left in the code: words in
// JSX, and strings or template literals that read as words, anywhere but
// where code compares or names things (see `skipped`). What is not a text
// although it reads as one says so on its line, or the line before, with
// the comment `i18n-ignore`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const I18N = join(SRC, "i18n");
const onlyEnglish = process.argv.includes("--english");
const shownAll = process.argv.includes("--all");
const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

// ------------------------------------------------------------- languages

const runtime = readFileSync(join(SRC, "i18n.ts"), "utf8");
const block = runtime.slice(runtime.indexOf("export const LANGUAGES"),
  runtime.indexOf("] as const"));
const CODES = [...block.matchAll(/code: "([^"]+)"/g)].map((m) => m[1]);

// The forms of each language, by Unicode CLDR, for whole numbers: those a
// counting string has, exactly (as the site's sitelib.py PLURAL_FORMS).
const FORMS = {
  en: ["one", "other"], de: ["one", "other"], es: ["one", "other"],
  fr: ["one", "other"], it: ["one", "other"], "pt-BR": ["one", "other"],
  tr: ["one", "other"], pl: ["one", "few", "many"], ru: ["one", "few", "many"],
  ja: ["other"], ko: ["other"], "zh-CN": ["other"],
};
// Languages whose "one" is 1 alone: there the one form may leave the
// number out ("a minute"), as English may. In the others it covers more
// (Russian 21, French 0) and keeps {n}.
const ONE_IS_ONE = new Set(["en", "de", "es", "it", "tr"]);

const LINE = /^([a-z0-9][a-z0-9_.-]*) =(?: (.*))?$/;
const PLACE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const TAG = /<([a-z][a-z0-9]*)>|<\/([a-z][a-z0-9]*)>/g;
const PLURALS = ["zero", "one", "two", "few", "many", "other"];

function read(code) {
  const name = `src/i18n/${code}.txt`;
  const out = new Map();
  let text;
  try {
    text = readFileSync(join(I18N, `${code}.txt`), "utf8");
  } catch {
    fail(name, "missing");
    return out;
  }
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.startsWith("#")) return;
    const m = LINE.exec(line);
    if (!m) return fail(`${name}:${i + 1}`, `expected "key = text", found ${JSON.stringify(line.slice(0, 70))}`);
    if (out.has(m[1])) return fail(`${name}:${i + 1}`, `${m[1]} is there twice`);
    if (/\s$/.test(line)) fail(`${name}:${i + 1}`, `${m[1]} ends with a space`);
    out.set(m[1], (m[2] ?? "").replace(/\\([n\\])/g, (_, c) => (c === "n" ? "\n" : "\\")));
  });
  return out;
}

function formsOf(text) {
  const parts = text.split(" | ").map((p) => /^([a-z]+): ([\s\S]*)$/.exec(p));
  if (!parts.every((m) => m && PLURALS.includes(m[1]))) return null;
  return new Map(parts.map((m) => [m[1], m[2]]));
}

const places = (text) => [...text.matchAll(PLACE)].map((m) => m[1]).sort();
const tags = (text) => [...text.matchAll(TAG)].map((m) => m[1] ? `<${m[1]}>` : `</${m[2]}>`).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const english = read("en");
// While the strings are being written in parts (src/i18n/parts/*.txt, one
// for each who writes them), English is all of them together.
if (onlyEnglish) {
  let parts = [];
  try {
    parts = readdirSync(join(I18N, "parts")).filter((f) => f.endsWith(".txt"));
  } catch {
    // No parts: English is en.txt alone.
  }
  for (const part of parts) {
    for (const [key, text] of read(`parts/${part.slice(0, -4)}`)) {
      if (english.has(key)) fail(`src/i18n/parts/${part}`, `${key} is in English already`);
      english.set(key, text);
    }
  }
}
const englishPlaces = new Map();
for (const [key, text] of english) {
  const forms = formsOf(text);
  if (forms) {
    const own = [...forms.keys()].sort();
    if (!same(own, [...FORMS.en].sort())) fail(`src/i18n/en.txt`, `${key} has the forms ${own}, English has one and other`);
    if (!places(forms.get("other") ?? "").includes("n")) fail(`src/i18n/en.txt`, `${key} counts, so its other form has {n}`);
    englishPlaces.set(key, places(forms.get("other") ?? ""));
  } else {
    englishPlaces.set(key, [...new Set(places(text))].sort());
  }
}

function checkLanguage(code) {
  const own = read(code);
  const name = `src/i18n/${code}.txt`;
  const missing = [...english.keys()].filter((k) => !own.has(k));
  const extra = [...own.keys()].filter((k) => !english.has(k));
  if (missing.length) fail(name, `lacks ${missing.length} strings: ${missing.slice(0, 8).join(", ")}`);
  if (extra.length) fail(name, `has strings English does not: ${extra.slice(0, 8).join(", ")}`);
  for (const [key, text] of own) {
    const source = english.get(key);
    if (source === undefined) continue;
    if (source.trim() && !text.trim()) fail(name, `${key} is empty`);
    const theirs = formsOf(source);
    const ours = formsOf(text);
    const wanted = englishPlaces.get(key);
    if (theirs) {
      if (!ours) {
        fail(name, `${key} counts in English, so it has the forms ${FORMS[code].join(", ")}`);
        continue;
      }
      if (!same([...ours.keys()].sort(), [...FORMS[code]].sort())) {
        fail(name, `${key} has the forms ${[...ours.keys()].join(", ")}; the language's are ${FORMS[code].join(", ")}`);
      }
      for (const [form, part] of ours) {
        const got = [...new Set(places(part))].sort();
        const need = form === "one" && ONE_IS_ONE.has(code) ? wanted.filter((p) => p !== "n") : wanted;
        if (!need.every((p) => got.includes(p)) || !got.every((p) => wanted.includes(p))) {
          fail(name, `${key} (${form}) has the values {${got.join("}, {")}}; English has {${wanted.join("}, {")}}`);
        }
        if (!same(tags(part), tags(theirs.get("other") ?? ""))) fail(name, `${key} (${form}) has other parts <…> than English`);
      }
    } else {
      if (ours) fail(name, `${key} does not count in English: no forms`);
      const got = [...new Set(places(text))].sort();
      if (!same(got, wanted)) fail(name, `${key} has the values {${got.join("}, {")}}; English has {${wanted.join("}, {")}}`);
      if (!same(tags(text), tags(source))) fail(name, `${key} has other parts <…> than English`);
    }
  }
}

const files = readdirSync(I18N).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4));
for (const f of files) if (!CODES.includes(f)) fail(`src/i18n/${f}.txt`, "is no language of LANGUAGES");
if (!onlyEnglish) for (const code of CODES.slice(1)) checkLanguage(code);

// ------------------------------------------------------------------ code

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

// Words that are no text to translate: the product's names, keys, units.
const NAMES = new Set(["tTerm", "tTerm Web", "Free", "Personal", "GitHub",
  "Telegram", "Mac", "macOS", "Windows", "Linux", "Esc", "Enter", "Tab",
  "Shift", "Ctrl", "Alt", "Cmd", "Option", "Return", "Backspace", "OK"]);
// Attributes whose values are code, not words.
const CODE_ATTRS = new Set(["className", "type", "role", "id", "key", "name",
  "value", "href", "src", "rel", "target", "autoComplete", "inputMode",
  "method", "lang", "htmlFor", "style", "accept", "pattern", "enterKeyHint",
  "autoCapitalize", "spellCheck", "dir", "form", "action", "kind", "icon",
  "size", "variant", "tone", "mode", "state", "color", "tint", "page",
  "aria-haspopup", "aria-controls", "aria-labelledby", "aria-describedby",
  "aria-live", "aria-current", "aria-expanded", "aria-checked",
  "aria-pressed", "aria-selected", "aria-hidden", "aria-orientation",
  "aria-autocomplete", "aria-activedescendant", "aria-owns", "aria-sort",
  "aria-modal", "aria-invalid", "aria-busy", "aria-disabled", "aria-level",
  "aria-multiline", "aria-readonly", "aria-required", "aria-relevant",
  "aria-atomic", "aria-valuemin", "aria-valuemax", "aria-valuenow"]);
// Calls whose strings are code: names of events, storage, selectors…
const CODE_CALLS = /^(console\.\w+|localStorage\.\w+|sessionStorage\.\w+|\w+\.(querySelector|querySelectorAll|closest|matches|addEventListener|removeEventListener|getAttribute|setAttribute|removeAttribute|hasAttribute|toggleAttribute|getItem|setItem|removeItem|createElement|matchMedia|dispatchEvent|getPropertyValue|setProperty|postMessage|startsWith|endsWith|includes|indexOf|lastIndexOf|split|replace|replaceAll|padStart|padEnd|join|test|exec|match|matchAll|toLocaleString|toLocaleDateString|toLocaleTimeString)|classList\.\w+|\w+\.classList\.\w+|matchMedia|fetch|RegExp|new RegExp|CustomEvent|new CustomEvent|Error|new Error|import|require|structuredClone|Symbol|Intl\.\w+|new Intl\.\w+|encodeURIComponent|decodeURIComponent|atob|btoa|parseInt|parseFloat|Number|String|BigInt|JSON\.\w+|history\.\w+|location\.\w+|window\.open|open|setTimeout|setInterval|requestAnimationFrame|Object\.\w+|Reflect\.\w+)$/;

/** Words to people: a capital and small letters ("Close", "Settings"),
 * two words or more ("no connection"), a sentence's end, or letters
 * beyond ASCII. Not: identifiers, CSS classes (with - or _), keys (with
 * dots), paths, addresses, single words in small letters. */
function readsAsWords(text) {
  const s = text.trim();
  if (!s || NAMES.has(s)) return false;
  if (/^[a-z0-9][a-z0-9_.-]*$/.test(s)) return false;
  if (/^(\/|\.\/|\.\.\/|https?:|mailto:|data:|#|--|@|\$)/.test(s)) return false;
  // A CSS selector or a list of them.
  if (/^[\w\s,.#:>~+*()\[\]='"-]+$/.test(s) && /[\[\]=#>]|^[a-z-]+(,\s*[a-z-]+)+$/.test(s)) return false;
  if (!/\p{L}{2}/u.test(s)) return false;
  if (/[\p{L}--[\p{ASCII}]]/v.test(s) && /\p{L}{2}/u.test(s)) return true;
  const words = s.split(/\s+/);
  if (words.some((w) => /[-_./=:]\w/.test(w) && !/^[A-Z][a-z]+[.:]?$/.test(w))) {
    // A class list, a path, an expression: unless prose is around it.
    if (!/[A-Z][a-z]{2,}.*\s\w{2,}/.test(s) && !/\b(the|a|an|is|of|to|in|on)\b/.test(s)) return false;
  }
  if (words.length === 1) return /^[A-Z][a-z]{1,}[a-z…!?.,:]*$/.test(s) && !NAMES.has(s.replace(/[…!?.,:]+$/, ""));
  return words.filter((w) => /^\p{L}{2,}/u.test(w)).length >= 2 || /[.?!…]$/.test(s);
}

function ignoredLine(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lines = sourceFile.text.split("\n");
  return /i18n-ignore/.test(lines[line] ?? "") || /i18n-ignore/.test(lines[line - 1] ?? "");
}

function calleeName(call) {
  const text = call.expression.getText();
  return call.kind === ts.SyntaxKind.NewExpression ? `new ${text}` : text;
}

/** Whether a string at `node` is code by where it is: an import, a
 * property's name, a comparison, a case, a type, an attribute of code, an
 * argument of a call that takes names. A value picked or put together
 * (a ? "x" : "y", a ?? "x", `a ${b}`) is where its whole is. */
function skipped(node) {
  let at = node;
  let parent = node.parent;
  while (parent && (ts.isConditionalExpression(parent) && parent.condition !== at ||
      ts.isParenthesizedExpression(parent) || ts.isTemplateSpan(parent) ||
      ts.isTemplateExpression(parent) && parent !== node ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isBinaryExpression(parent) && [ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.AmpersandAmpersandToken].includes(parent.operatorToken.kind))) {
    at = parent;
    parent = parent.parent;
  }
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) ||
      ts.isExternalModuleReference(parent) || ts.isLiteralTypeNode(parent)) return true;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) ||
       ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === at) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === at) return true;
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(parent.operatorToken.kind)) return true;
  if (ts.isCaseClause(parent)) return true;
  if (ts.isJsxAttribute(parent) || (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent))) {
    const attr = ts.isJsxAttribute(parent) ? parent : parent.parent;
    const name = attr.name.getText();
    if (CODE_ATTRS.has(name) || name.startsWith("data-") || /^on[A-Z]/.test(name)) return true;
  }
  if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(at)) {
    if (CODE_CALLS.test(calleeName(parent))) return true;
  }
  return false;
}

const used = new Set();

function checkCall(file, sourceFile, call) {
  const callee = call.expression.getText(sourceFile);
  if (!/^(t|t\.rich|say|say\.rich|props\.t|\w+\.t)$/.test(callee)) return;
  const [first, second] = call.arguments;
  if (!first) return;
  const where = `${file}:${sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1}`;
  if (ts.isNoSubstitutionTemplateLiteral(first) || ts.isTemplateExpression(first)) {
    return fail(where, `${callee}() takes a key as it is, not one put together: ${first.getText(sourceFile)}`);
  }
  if (!ts.isStringLiteral(first)) return;
  const key = first.text;
  if (!english.has(key)) return fail(where, `no string ${key} in src/i18n/en.txt`);
  if (second && ts.isObjectLiteralExpression(second) &&
      !second.properties.some((p) => ts.isSpreadAssignment(p))) {
    const given = second.properties.map((p) => p.name?.getText(sourceFile)).filter(Boolean);
    const text = english.get(key);
    const forms = formsOf(text);
    const wanted = new Set(places(forms ? [...forms.values()].join(" ") : text));
    if (forms) wanted.add("n");
    for (const w of wanted) if (!given.includes(w)) fail(where, `${key} wants {${w}}`);
    if (callee.endsWith("rich")) {
      for (const m of text.matchAll(/<([a-z][a-z0-9]*)>/g)) if (!given.includes(m[1])) fail(where, `${key} wants <${m[1]}>`);
    }
  }
}

for (const path of sources(SRC)) {
  const file = relative(ROOT, path);
  if (file === join("src", "i18n.ts")) continue;
  const text = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    const at = () => `${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`;
    if (ts.isCallExpression(node)) checkCall(file, sourceFile, node);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (english.has(node.text)) used.add(node.text);
      else if (!skipped(node) && readsAsWords(node.text) && !ignoredLine(sourceFile, node)) {
        fail(at(), `text in the code: ${JSON.stringify(node.text.slice(0, 60))}`);
      }
    } else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" {} ");
      if (!skipped(node) && readsAsWords(parts) && !ignoredLine(sourceFile, node)) {
        fail(at(), `text in the code: ${JSON.stringify(parts.slice(0, 60))}`);
      }
    } else if (ts.isJsxText(node)) {
      const words = node.text.replace(/\s+/g, " ").trim();
      if (/\p{L}/u.test(words) && !NAMES.has(words) && !ignoredLine(sourceFile, node)) {
        fail(at(), `text in JSX: ${JSON.stringify(words.slice(0, 60))}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

for (const key of english.keys()) if (!used.has(key)) fail("src/i18n/en.txt", `${key} is used nowhere`);

if (problems.length) {
  const shown = shownAll ? problems : problems.slice(0, 200);
  for (const p of shown) console.error(`  ✗ ${p}`);
  if (problems.length > shown.length) console.error(`  … and ${problems.length - shown.length} more`);
  console.error(`strings: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`strings: ${english.size} in ${onlyEnglish ? "English" : `${CODES.length} languages`}, all in place.`);
