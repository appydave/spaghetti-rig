// The G05 name audit (tier 4, PR 1): lists the upper-case constants in production code and flags the names an agent should not trust. Read-only on
// src/; the six asset-data files are not audited (their numbers are procedural data), though their uses of a constant count as references.
//   node lint/gates/name-audit.mjs [--json] [--root <checkout>]
// It reports: (1) positional names (_A.._F, _1.._9), (2) names that echo their value (FORTY, HALF, LEN_120), (3) one name defined in more than one
// file, (4) every constant equal to 0.5, (5) the constants referenced exactly once, per file. A report is a list to read, not a verdict: a flagged
// name can be right (`_F` is a frequency, a `HALF_` is a half-extent), and the PR says which it kept and why.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = new URL("../../", import.meta.url).pathname;
const UPPER = /^[A-Z][A-Z0-9_]*$/;
const HALF = 0.5;
const POSITIONAL = /(?:_[A-F]|_[1-9])(?:_|$)/;
const NUMBER_WORDS = new Set(
  "ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE TWENTY THIRTY FORTY FIFTY SIXTY HUNDRED THOUSAND HALF QUARTER DOUBLE TRIPLE".split(
    " ",
  ),
);
const OPERATIONS = new Map([
  [ts.SyntaxKind.PlusToken, (a, b) => a + b],
  [ts.SyntaxKind.MinusToken, (a, b) => a - b],
  [ts.SyntaxKind.AsteriskToken, (a, b) => a * b],
  [ts.SyntaxKind.SlashToken, (a, b) => a / b],
]);

/** The six asset-data files, read from exemptions.ts (the one home of the list; name-audit.test.ts checks this reads it whole). */
export function assetDataFiles(root = ROOT) {
  const src = readFileSync(join(root, "lint/gates/exemptions.ts"), "utf8");
  const block = /ASSET_DATA = \[([^\]]*)\]/.exec(src)?.[1] ?? "";

  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function sourceFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);

    if (e.isDirectory()) {
      sourceFiles(p, out);
    } else if (e.name.endsWith(".ts") && !/\.(test|d)\.ts$/.test(e.name)) {
      out.push(p);
    }
  }

  return out;
}

/** The number an initializer evaluates to (literals, - + * /, parentheses, same-file constants), or NaN. */
function numberOf(node, known) {
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (ts.isParenthesizedExpression(node)) {
    return numberOf(node.expression, known);
  }

  if (ts.isIdentifier(node)) {
    return known.get(node.text) ?? Number.NaN;
  }

  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken
  ) {
    return -numberOf(node.operand, known);
  }

  const op = ts.isBinaryExpression(node)
    ? OPERATIONS.get(node.operatorToken.kind)
    : undefined;

  return op
    ? op(numberOf(node.left, known), numberOf(node.right, known))
    : Number.NaN;
}

/** The upper-case const a declarator declares, with the number it evaluates to, or undefined for any other declarator. */
function constantOf(sf, d, known) {
  if (!ts.isIdentifier(d.name) || !UPPER.test(d.name.text) || !d.initializer) {
    return undefined;
  }

  const value = numberOf(d.initializer, known);

  if (!Number.isNaN(value)) {
    known.set(d.name.text, value);
  }

  const line = sf.getLineAndCharacterOfPosition(d.getStart()).line + 1;
  const modifiers = ts.getModifiers(d.parent.parent) ?? [];
  const exported = modifiers.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword,
  );

  return {
    name: d.name.text,
    file: sf.fileName,
    line,
    init: d.initializer.getText(sf),
    value,
    exported,
    id: d.name,
  };
}

/** The module-level upper-case consts of a source file, with the number each one evaluates to (NaN when it is not a number). */
function declarations(sf) {
  const known = new Map();
  const statements = sf.statements.filter(
    (st) =>
      ts.isVariableStatement(st) &&
      st.declarationList.flags & ts.NodeFlags.Const,
  );
  const declarators = statements.flatMap((st) => [
    ...st.declarationList.declarations,
  ]);

  return declarators.map((d) => constantOf(sf, d, known)).filter(Boolean);
}

/** How many times each name is used as an expression in a file: not as a declaration, an import or an export specifier. */
function usesIn(sf, declared) {
  const uses = new Map();
  const isReference = (n) =>
    ts.isIdentifier(n) &&
    !declared.has(n) &&
    !ts.isImportSpecifier(n.parent) &&
    !ts.isExportSpecifier(n.parent);
  const visit = (n) => {
    if (isReference(n)) {
      uses.set(n.text, (uses.get(n.text) ?? 0) + 1);
    }

    ts.forEachChild(n, visit);
  };

  visit(sf);

  return uses;
}

/** Every module-level upper-case const in one file, and how many times each name is used there. */
export function readFile(text, file) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const decls = declarations(sf);
  const uses = usesIn(sf, new Set(decls.map((d) => d.id)));

  return { decls: decls.map((d) => ({ ...d, id: undefined })), uses };
}

const tokens = (name) => name.split("_").filter(Boolean);
const spellsItsValue = (d) => {
  const t = tokens(d.name);

  return (
    t.some((w) => NUMBER_WORDS.has(w)) ||
    t.some((w) => /^\d+$/.test(w) && Number(w) === d.value)
  );
};

function duplicates(decls) {
  const byName = new Map();

  for (const d of decls) {
    byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
  }

  return [...byName]
    .filter(([, v]) => new Set(v.map((d) => d.file)).size > 1)
    .map(([name, v]) => ({
      name,
      files: v.map((d) => `${d.file}:${d.line}`),
      values: v.map((d) => d.init),
    }));
}

function singleUseByFile(decls) {
  const out = {};

  for (const d of decls.filter((x) => x.refs === 1)) {
    out[d.file] = (out[d.file] ?? 0) + 1;
  }

  return out;
}

/** How many times a constant is used: in its own file, and, if it is exported, in every other file. */
function referencesOf(decl, parsed) {
  return parsed.reduce((n, f) => {
    const uses = f.uses.get(decl.name) ?? 0;

    return f.file === decl.file || decl.exported ? n + uses : n;
  }, 0);
}

/** The audit of the files under `root`: the five reports. */
export function auditNames(root = ROOT, assets = assetDataFiles(root)) {
  const parsed = sourceFiles(join(root, "src")).map((p) => {
    const file = relative(root, p);

    return { file, ...readFile(readFileSync(p, "utf8"), file) };
  });
  const decls = parsed
    .filter((f) => !assets.includes(f.file))
    .flatMap((f) =>
      f.decls.map((d) => ({ ...d, refs: referencesOf(d, parsed) })),
    );
  const singleUse = singleUseByFile(decls);

  return {
    constants: decls.length,
    positional: decls.filter((d) => POSITIONAL.test(d.name)),
    echoes: decls.filter((d) => spellsItsValue(d)),
    duplicates: duplicates(decls),
    halves: decls.filter((d) => d.value === HALF),
    singleUse,
    singleUseTotal: Object.values(singleUse).reduce((a, b) => a + b, 0),
  };
}

const row = (d) =>
  `\n  ${d.file}:${d.line}  ${d.name} = ${d.init}  (refs ${d.refs})`;
const dupRow = (d) =>
  `\n  ${d.name}: ${d.files.join(", ")}  [${d.values.join(" | ")}]`;
const fileRow = ([f, n]) => `\n  ${n}  ${f}`;

function print(r) {
  const byCount = Object.entries(r.singleUse).sort((a, b) => b[1] - a[1]);

  console.log(`${r.constants} upper-case constants outside the asset files\n`);
  console.log(
    `1. positional names (${r.positional.length})${r.positional.map((d) => row(d)).join("")}`,
  );
  console.log(
    `\n2. names that echo their value (${r.echoes.length})${r.echoes.map((d) => row(d)).join("")}`,
  );
  console.log(
    `\n3. one name in more than one file (${r.duplicates.length})${r.duplicates.map((d) => dupRow(d)).join("")}`,
  );
  console.log(
    `\n4. constants equal to 0.5 (${r.halves.length})${r.halves.map((d) => row(d)).join("")}`,
  );
  console.log(
    `\n5. constants referenced exactly once: ${r.singleUseTotal}${byCount.map((e) => fileRow(e)).join("")}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf("--root");
  const root = at > 0 ? process.argv[at + 1] : ROOT;
  const r = auditNames(root, assetDataFiles(root));

  if (r.constants === 0) {
    console.error("name audit read no constants: the instrument is broken");
    process.exit(1);
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    print(r);
  }
}
