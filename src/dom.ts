/** Look up an element by id and prove its type, so a wrong id or tag fails with a message instead of a later crash. */
export function byId<T extends HTMLElement>(
  id: string,
  type: new (...args: never[]) => T,
): T {
  const el = document.getElementById(id);

  if (!(el instanceof type)) {
    throw new Error(`#${id} is not ${el ? `a ${type.name}` : "in the page"}`);
  }

  return el;
}

/** The nearest ancestor of an event target that matches a selector, or null (a document or window target has none). */
export function closestEl(
  target: EventTarget | null,
  selector: string,
): HTMLElement | null {
  const el = target instanceof Element ? target.closest(selector) : null;

  return el instanceof HTMLElement ? el : null;
}

/** An element below a root, or null when the selector matches nothing (or something that is not an HTML element). */
export function queryElOrNull(
  root: ParentNode,
  selector: string,
): HTMLElement | null {
  const el = root.querySelector(selector);

  return el instanceof HTMLElement ? el : null;
}

/** An element below a root that the page is built to contain; throws naming the selector if it is not there. */
export function queryEl(root: ParentNode, selector: string): HTMLElement {
  const el = queryElOrNull(root, selector);

  if (!el) {
    throw new Error(`"${selector}" is not in the page here`);
  }

  return el;
}

/** Every HTML element below a root that matches the selector. */
export function queryAllEl(root: ParentNode, selector: string): HTMLElement[] {
  return [...root.querySelectorAll(selector)].filter(
    (el) => el instanceof HTMLElement,
  );
}

/** The 2D drawing context of a canvas; throws if the browser cannot make one. */
export function context2d(
  canvas: Pick<HTMLCanvasElement, "getContext">,
): CanvasRenderingContext2D {
  const g = canvas.getContext("2d");

  if (!g) {
    throw new Error("This browser cannot draw to a 2D canvas");
  }

  return g;
}
