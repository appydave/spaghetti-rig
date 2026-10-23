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
