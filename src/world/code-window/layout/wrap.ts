/** A break in a long line is searched for backwards only as far as this share of the wrap width. */
const WRAP_SEARCH_SHARE = 0.5;

/** The width of the chunk that starts at `start`: a wrapped continuation is indented. */
function widthAt(start: number, cols: number, indent: number): number {
  return start ? cols - indent : cols;
}

/** Where to cut the chunk that starts at `start`: after a space or punctuation if one is near, else at the full width. */
function cutFor(text: string, start: number, width: number): number {
  for (let i = start + width; i > start + width * WRAP_SEARCH_SHARE; i--) {
    if (/[\s,;({[=>]/.test(text.charAt(i - 1))) {
      return i;
    }
  }

  return start + width;
}

/** Break a row into chunks of at most `cols`, preferring to break after spaces or punctuation. */
export function wrapPoints(
  text: string,
  cols: number,
  indent: number,
): number[] {
  const cuts = [0];
  let start = 0;

  while (text.length - start > widthAt(start, cols, indent)) {
    start = cutFor(text, start, widthAt(start, cols, indent));
    cuts.push(start);
  }

  return cuts;
}
