// exports/no-reexport: a module exports what it defines, and every importer names the module that defines it. A re-export gives a name a
// second home, and archlint cannot see through one: a module of only `export … from` lines is not in its graph, so the coupling and hub gates
// (G14, G15) count the edge against the wrong file or not at all. Three shapes fail, with or without `type`: `export { x } from`,
// `export * from` (and `export * as ns from`), and `export { x }` where x was imported. `export const y = x` is new code and passes.
const MESSAGE =
  "Import it from the module that defines it: do not re-export a name, or the import graph counts the wrong file.";

const importedNames = (program) =>
  new Set(
    program.body
      .filter((node) => node.type === "ImportDeclaration")
      .flatMap((node) => node.specifiers.map((s) => s.local.name)),
  );

/** @type {import("eslint").Rule.RuleModule} */
const noReexport = {
  meta: {
    type: "problem",
    schema: [],
    messages: { reexport: MESSAGE },
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: "reexport" });
    let imported = new Set();

    return {
      Program: (program) => {
        imported = importedNames(program);
      },
      ExportAllDeclaration: report,
      ExportNamedDeclaration: (node) => {
        const reexported =
          node.source !== null ||
          (node.declaration === null &&
            node.specifiers.some((s) => imported.has(s.local.name)));

        if (reexported) {
          report(node);
        }
      },
    };
  },
};

export default {
  meta: { name: "exports" },
  rules: { "no-reexport": noReexport },
};
