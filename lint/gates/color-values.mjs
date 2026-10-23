// What counts as a colour value, and the one file allowed to hold them. Ported from Omer's lint/color-values.mjs (104c7cc).
import { fileURLToPath } from "node:url";
import { Color } from "three";

/** The palette module: the only file where literal colours may live. */
export const PALETTE_FILE = fileURLToPath(
  new URL("../../src/world/palette.ts", import.meta.url),
);

const FUNCTION_NAMES =
  "rgba?|hsla?|hwb|lab|lch|oklab|oklch|color(?:-mix)?|device-cmyk|light-dark|contrast-color";
const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const COLOR_FUNCTION = new RegExp(`^(?:${FUNCTION_NAMES})\\s*\\(`, "i");

/** @param {string} value */
export function isColorValue(value) {
  const text = value.trim();

  return HEX_COLOR.test(text) || COLOR_FUNCTION.test(text);
}

/** @param {string} value */
export function isNamedColor(value) {
  const text = value.trim().toLowerCase();

  return text === "transparent" || Object.hasOwn(Color.NAMES, text);
}
