// strict-colors/no-color-literals: literal colours live in the palette module (src/world/palette.ts) and nowhere else.
// Ported from Omer's lint/color-policy.ts (104c7cc). Oxlint plugins get no type checker, so where he asked the checker "is this
// a Color?", this asks the syntax: a name set from `new Color(...)` or a `: Color` annotation counts as a Color receiver.
// KNOWN BLIND SPOT: a Color whose type is only inferred (a callback parameter, a function's return value) is not seen.
import { resolve } from "node:path";
import { PALETTE_FILE, isColorValue, isNamedColor } from "./color-values.mjs";
import { isColorContext, memberName } from "./color-context.mjs";

const isColorType = (node) =>
  node?.type === "TSTypeReference" && memberName(node.typeName) === "Color";

const isNewColor = (node) =>
  node?.type === "NewExpression" && memberName(node.callee) === "Color";

function dynamicHexColor(node, isColorReceiver) {
  return (
    node.expressions.length > 0 &&
    isColorContext(node, isColorReceiver) &&
    node.quasis.some((quasi) =>
      /^#[\da-f]*$/i.test(quasi.value.cooked ?? quasi.value.raw),
    )
  );
}

/** @type {import("eslint").Rule.RuleModule} */
export const noColorLiterals = {
  meta: {
    type: "suggestion",
    docs: { description: "Keep literal colors in the dedicated palette." },
    schema: [],
    messages: { palette: "Use a named color from src/world/palette.ts." },
  },
  create(context) {
    if (resolve(context.filename) === PALETTE_FILE) {
      return {};
    }

    const colorNames = new Set();
    const isColorReceiver = (receiver) => {
      const name = memberName(receiver);

      return !!name && colorNames.has(name);
    };

    const remember = (name) => {
      if (name) {
        colorNames.add(name);
      }
    };

    function check(node, value) {
      const contextual = isColorContext(node, isColorReceiver);
      const literal =
        typeof value === "string"
          ? isColorValue(value) || (contextual && isNamedColor(value))
          : contextual;

      if (literal) {
        context.report({ node, messageId: "palette" });
      }
    }

    return {
      VariableDeclarator(node) {
        if (
          isNewColor(node.init) ||
          isColorType(node.id.typeAnnotation?.typeAnnotation)
        ) {
          remember(memberName(node.id));
        }
      },
      AssignmentExpression(node) {
        if (isNewColor(node.right)) {
          remember(memberName(node.left));
        }
      },
      PropertyDefinition(node) {
        if (
          isNewColor(node.value) ||
          isColorType(node.typeAnnotation?.typeAnnotation)
        ) {
          remember(memberName(node.key));
        }
      },
      Identifier(node) {
        if (isColorType(node.typeAnnotation?.typeAnnotation)) {
          remember(node.name);
        }
      },
      Literal(node) {
        if (typeof node.value === "string" || typeof node.value === "number") {
          check(node, node.value);
        }
      },
      TemplateLiteral(node) {
        if (dynamicHexColor(node, isColorReceiver)) {
          context.report({ node, messageId: "palette" });

          return;
        }

        for (const quasi of node.quasis) {
          check(node, quasi.value.cooked ?? quasi.value.raw);
        }
      },
    };
  },
};

export default {
  meta: { name: "strict-colors" },
  rules: { "no-color-literals": noColorLiterals },
};
