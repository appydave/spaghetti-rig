// The two functions that run inside the page for tests/computed-colours.spec.ts. Each is serialised into the browser, so each is
// self-contained: it may use nothing from this file but its own arguments.

/** Every colour a style rule or keyframe declares, resolved on a probe element, even for states never shown: key -> resolved value. */
export function collectRules(properties: string[]) {
  const probe = document.createElement("div");

  document.body.append(probe);

  // The browser resolves url(...) against the page, so the origin (the dev server's port) is dropped: it is not a colour.
  const read = () =>
    properties
      .map((p) => getComputedStyle(probe).getPropertyValue(p))
      .join(" | ")
      .replaceAll(location.origin, "");
  const blank = read();
  const out: Record<string, string> = {};
  const seen: Record<string, number> = {};

  // The whole rule at once: a var() inside a shorthand only resolves as part of its shorthand.
  const addDeclarations = (where: string, style: CSSStyleDeclaration) => {
    probe.style.cssText = style.cssText;

    const now = read();

    if (now !== blank) {
      seen[where] = (seen[where] ?? 0) + 1;
      out[`${where}|${seen[where]}`] = now;
    }
  };

  const walk = (rules: CSSRuleList, context: string) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        addDeclarations(`${context}${rule.selectorText}`, rule.style);
      } else if (rule instanceof CSSKeyframesRule) {
        for (const frame of rule.cssRules) {
          if (frame instanceof CSSKeyframeRule) {
            addDeclarations(
              `@keyframes ${rule.name} ${frame.keyText}`,
              frame.style,
            );
          }
        }
      } else if (rule instanceof CSSConditionRule) {
        walk(rule.cssRules, `${context}${rule.conditionText} `);
      }
    }
  };

  for (const sheet of document.styleSheets) {
    walk(sheet.cssRules, "");
  }

  probe.remove();

  return out;
}

/** A screen: a hash of every element's computed colours in place (so a swap between two elements shows) and how many times each colour string occurs. */
export interface ScreenColours {
  hash: string;
  counts: Record<string, number>;
}

/** Runs in the page: every element's computed colours, for the page, ::before and ::after, reduced to a ScreenColours. */
export function collectScreen(properties: string[]): ScreenColours {
  const place = (el: Element) => {
    const parts: string[] = [];

    for (let n: Element | null = el; n; n = n.parentElement) {
      const same = n.parentElement
        ? [...n.parentElement.children].filter((c) => c.tagName === n?.tagName)
        : [n];

      parts.unshift(
        `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}[${same.indexOf(n)}]`,
      );
    }

    return parts.join(">");
  };

  // Two FNV-style runs with different starts and multipliers: 64 bits, enough that a colour change cannot go unseen.
  const state = [0x811c9dc5, 0xdeadbeef];
  const multipliers = [0x01000193, 0x5bd1e995];

  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      for (let h = 0; h < state.length; h++) {
        state[h] = Math.imul(
          (state[h] ?? 0) ^ text.charCodeAt(i),
          multipliers[h] ?? 1,
        );
      }
    }
  };

  const counts: Record<string, number> = {};

  for (const el of document.querySelectorAll("body, body *")) {
    for (const pseudo of [null, "::before", "::after"]) {
      const style = getComputedStyle(el, pseudo);
      const colours = properties
        .map((p) => style.getPropertyValue(p))
        .join(" | ")
        .replaceAll(location.origin, "");

      feed(`${place(el)}${pseudo ?? ""}=${colours};`);
      counts[colours] = (counts[colours] ?? 0) + 1;
    }
  }

  const hash = state
    .map((h) => (h >>> 0).toString(16).padStart(8, "0"))
    .join("");

  return { hash, counts };
}
