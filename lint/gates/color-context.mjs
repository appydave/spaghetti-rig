// Where a literal is a colour: a Color or light constructor, a colour method, a colour-named field. Ported from Omer's
// lint/color-context.ts (104c7cc). His type-checker hook is a syntactic detector here (see color-policy.mjs).
const COLOR_FIELD =
  /(?:colors?)$|^(?:tint|background|fill|fillStyle|stroke|strokeStyle|emissive|specular)$/i;
const COLOR_CONSTRUCTORS = new Set([
  "Color",
  "Fog",
  "FogExp2",
  "AmbientLight",
  "DirectionalLight",
  "HemisphereLight",
  "PointLight",
  "SpotLight",
  "RectAreaLight",
  "Light",
]);
const COLOR_METHODS = new Set([
  "setHex",
  "setRGB",
  "setHSL",
  "setStyle",
  "setColor",
  "setClearColor",
]);
const RGB_COMPONENTS = 3;
const FIRST_ARGUMENT = 0;
const SECOND_ARGUMENT = 1;
const COLOR_WRAPPERS = new Set([
  "ConditionalExpression",
  "LogicalExpression",
  "ArrayExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "ChainExpression",
]);

/** The last name of an identifier, a string key or a member chain, if it has one. */
export function memberName(node) {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  if (node.type === "MemberExpression") {
    return memberName(node.property);
  }

  // `THREE.Color` written as a type.
  if (node.type === "TSQualifiedName") {
    return memberName(node.right);
  }

  return undefined;
}

function argumentPosition(node, child) {
  for (const [position, argument] of node.arguments.entries()) {
    if (argument === child) {
      return position;
    }
  }

  return -1;
}

function constructorColor(node, child) {
  const name = memberName(node.callee);

  if (!name || !COLOR_CONSTRUCTORS.has(name)) {
    return false;
  }

  const count = name === "Color" ? RGB_COMPONENTS : FIRST_ARGUMENT + 1;
  const position = argumentPosition(node, child);

  return (
    position >= FIRST_ARGUMENT &&
    (position < count ||
      (name === "HemisphereLight" && position === SECOND_ARGUMENT))
  );
}

/** A `receiver.set(...)` call that sets a colour: the receiver is named like one, built as one or told to be one, and the argument is a channel. */
function colorSet(node, position, isColorReceiver) {
  const receiver = node.callee.object;
  const receiverName = memberName(receiver);
  const color =
    (!!receiverName && COLOR_FIELD.test(receiverName)) ||
    isColorReceiver(receiver);
  const constructed =
    receiver.type === "NewExpression" &&
    memberName(receiver.callee) === "Color";
  const validPosition = position >= FIRST_ARGUMENT && position < RGB_COMPONENTS;

  return (color || constructed) && validPosition;
}

function callColor(node, child, isColorReceiver) {
  if (node.callee.type !== "MemberExpression") {
    return false;
  }

  const name = memberName(node.callee.property);
  const position = argumentPosition(node, child);

  if (name === "addColorStop") {
    return position === SECOND_ARGUMENT;
  }

  if (name && COLOR_METHODS.has(name)) {
    const count = name === "setRGB" || name === "setHSL" ? RGB_COMPONENTS : 1;

    return position >= FIRST_ARGUMENT && position < count;
  }

  return name === "set" && colorSet(node, position, isColorReceiver);
}

function parentColor(parent, child, isColorReceiver) {
  if (
    parent.type === "Property" ||
    parent.type === "PropertyDefinition" ||
    parent.type === "AccessorProperty"
  ) {
    const name = memberName(parent.key);

    return child === parent.value && !!name && COLOR_FIELD.test(name);
  }

  if (parent.type === "AssignmentExpression") {
    const name = memberName(parent.left);

    return child === parent.right && !!name && COLOR_FIELD.test(name);
  }

  if (parent.type === "VariableDeclarator") {
    const name = memberName(parent.id);

    return !!name && /(?:colors?|tint|palette)$/i.test(name);
  }

  if (parent.type === "NewExpression") {
    return constructorColor(parent, child);
  }

  return (
    parent.type === "CallExpression" &&
    callColor(parent, child, isColorReceiver)
  );
}

/** Follow wrappers and conditional branches, without treating unrelated object fields as colours. */
export function isColorContext(node, isColorReceiver = () => false) {
  let child = node;

  while (child.parent) {
    const parent = child.parent;

    if (parentColor(parent, child, isColorReceiver)) {
      return true;
    }

    if (!COLOR_WRAPPERS.has(parent.type)) {
      return false;
    }

    child = parent;
  }

  return false;
}
