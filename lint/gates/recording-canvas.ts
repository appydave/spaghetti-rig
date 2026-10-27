// A canvas for the world harnesses (G04 H1c): it accepts every drawing call and writes each one, and each property set, into its log.
// The builders paint label textures on a canvas. Every drawing call and every property set is written into the canvas's log (its text, its
// colours, its places), which the scene fingerprint hashes; what a call returns is a plain stand-in that accepts anything.
/** What a canvas call that is read as a number (a text width, say) comes out as. */
const NUMBER_STANDIN = 8;
const callable = () => undefined;

export const hole: any = new Proxy(callable, {
  get: (_t, p) => (p === Symbol.toPrimitive ? () => NUMBER_STANDIN : hole),
  apply: () => hole,
  set: () => true,
});

const recorder = (log: string[]): any =>
  new Proxy(callable, {
    get: (_t, p) =>
      p === Symbol.toPrimitive
        ? () => NUMBER_STANDIN
        : (...args: unknown[]) => {
            log.push(`${String(p)}(${args.map(String).join(",")})`);

            return hole;
          },
    set: (_t, p, v) => {
      log.push(`${String(p)}=${String(v)}`);

      return true;
    },
  });

/** A canvas starts at the browser's default size. */
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;

export const makeCanvas = () => {
  const log: string[] = [];
  const ctx = recorder(log);

  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    getContext: () => ctx,
    style: {},
    log,
  };
};

/** A stand-in for `document` where every canvas is a recording canvas: all a model, a world or a showcase needs from the browser. */
export const canvasDocument = () => ({
  createElement: (tag: string) => (tag === "canvas" ? makeCanvas() : {}),
});
