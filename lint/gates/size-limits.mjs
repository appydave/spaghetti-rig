// size/*: the parts of Omer's lint/limits.ts (3a0475f) that Oxlint has no native rule for. His no-restricted-syntax selectors become three rules:
// a member cap per class, interface and object type; a parameter cap on TypeScript signatures; and, in test files only, the function-length
// cap that skips describe() callbacks (a describe() groups it() blocks, it is not a long function). Each limit is the { max } option set
// in .oxlintrc.json beside the native rules, and nowhere else. Lines are counted as Omer counts them: blank lines and comments count.
const SIGNATURES = [
  "TSMethodSignature",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
  "TSConstructorType",
  "TSEmptyBodyFunctionExpression",
];

const isThis = (param) => param.type === "Identifier" && param.name === "this";
const calleeRoot = (callee) =>
  callee.type === "MemberExpression" ? calleeRoot(callee.object) : callee;
const isDescribe = (node) =>
  node.parent?.type === "CallExpression" &&
  node.parent.arguments.includes(node) &&
  ["describe", "suite"].includes(calleeRoot(node.parent.callee).name);

const MAX_SCHEMA = [
  {
    type: "object",
    properties: { max: { type: "integer", minimum: 1 } },
    required: ["max"],
    additionalProperties: false,
  },
];

/** @type {import("eslint").Rule.RuleModule} */
const maxMembers = {
  meta: {
    type: "suggestion",
    schema: MAX_SCHEMA,
    messages: {
      many: "{{what}} may declare at most {{max}} members: move a group of related members into its own {{part}}.",
    },
  },
  create(context) {
    const [{ max }] = context.options;
    const check = (node, members, what, part) => {
      if (members.length > max) {
        context.report({ node, messageId: "many", data: { what, max, part } });
      }
    };

    return {
      ClassBody: (node) => check(node, node.body, "Classes", "class"),
      TSInterfaceBody: (node) =>
        check(node, node.body, "Interfaces", "interface"),
      TSTypeLiteral: (node) =>
        check(node, node.members, "Object types", "type"),
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const maxSignatureParams = {
  meta: {
    type: "suggestion",
    schema: MAX_SCHEMA,
    messages: {
      many: "TypeScript signatures may declare at most {{max}} parameters (excluding this): group the parameters into one options object.",
    },
  },
  create(context) {
    const [{ max }] = context.options;
    const check = (node) => {
      if (node.params.filter((p) => !isThis(p)).length > max) {
        context.report({ node, messageId: "many", data: { max } });
      }
    };

    return Object.fromEntries(SIGNATURES.map((type) => [type, check]));
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const maxTestFunctionLines = {
  meta: {
    type: "suggestion",
    schema: MAX_SCHEMA,
    messages: {
      long: "A test function may be at most {{max}} lines (a describe() callback may be any length): split the test into smaller it() blocks, or move setup into a helper.",
    },
  },
  create(context) {
    const [{ max }] = context.options;
    const check = (node) => {
      const lines = node.loc.end.line - node.loc.start.line + 1;

      if (lines > max && !isDescribe(node)) {
        context.report({ node, messageId: "long", data: { max } });
      }
    };

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};

export default {
  meta: { name: "size" },
  rules: {
    "max-members": maxMembers,
    "max-signature-params": maxSignatureParams,
    "max-test-function-lines": maxTestFunctionLines,
  },
};
