// exports/no-reexport: a module exports what it defines, and every importer names the module that defines it. A re-export gives a name a
// second home, and archlint cannot see through one: a module of only `export … from` lines is not in its graph, so the coupling and hub gates
// (G14, G15) count the edge against the wrong file or not at all. Four shapes fail, with or without `type`: `export { x } from`,
// `export * from` (and `export * as ns from`), `export { x }` where x was imported, and `export default x` where x was imported. `export const y = x` is new code and passes.
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
      // Only an identifier declaration has a `name`; a function, class or expression default is the module's own code.
      ExportDefaultDeclaration: (node) => {
        if (imported.has(node.declaration.name)) {
          report(node);
        }
      },
      ExportNamedDeclaration: (node) => {
        // A declaration (`export const y = x`) has no specifiers, so only `export { … }` lists reach the import check.
        const reexported =
          node.source !== null ||
          node.specifiers.some((s) => imported.has(s.local.name));

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
