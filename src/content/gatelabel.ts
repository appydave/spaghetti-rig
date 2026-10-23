/**
 * Gates are written "G01 · Formatting" in the content file. On screen that becomes a number badge
 * ("1") and a title ("Formatting"); the "G01" code itself is never shown.
 */
export interface GateLabel {
  num: string;
  title: string;
}

const CODE = /G(\d+)([a-z]?)/gi;
const num = (digits: string, letter: string) =>
  `${Number(digits)}${letter.toLowerCase()}`;

export function gateLabel(gate: string): GateLabel {
  const [, digits, letter, rest] =
    /^\s*G(\d+)([a-z]?)\s*[·:–—-]\s*(.*)$/i.exec(gate) ?? [];

  if (digits === undefined || letter === undefined || rest === undefined) {
    return { num: "", title: gate.trim() };
  }

  return {
    num: num(digits, letter),
    title: rest.trim() || `Gate ${num(digits, letter)}`,
  };
}

/** One line of plain text: "Gate 1 · Formatting". */
export function gateText(gate: string): string {
  const g = gateLabel(gate);

  return g.num ? `Gate ${g.num} · ${g.title}` : g.title;
}

/** A tier's gate range: "G00–G02" → "Gates 0–2", "G06" → "Gate 6". */
export function gatesText(gates: string | undefined): string {
  if (!gates) {
    return "";
  }

  const many = (gates.match(CODE) ?? []).length > 1;

  return `${many ? "Gates" : "Gate"} ${gates.replace(CODE, (_, d: string, l: string) => num(d, l))}`;
}
