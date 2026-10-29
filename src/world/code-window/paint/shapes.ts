import { CARD } from "#root/src/world/palette.ts";

export interface Point {
  x: number;
  y: number;
}
export interface Box extends Point {
  w: number;
  h: number;
}

/** A pin: its radius, and how far below its centre the number's baseline sits. */
const PIN_RADIUS = 16;
const PIN_DIGIT_DROP = 7;

/** Begin a rounded-rectangle path; the caller fills or strokes it. */
export function roundRect(g: CanvasRenderingContext2D, box: Box, r: number) {
  g.beginPath();
  g.roundRect(box.x, box.y, box.w, box.h, r);
}

/** A numbered pin centred on a point. */
export function pin(
  g: CanvasRenderingContext2D,
  at: Point,
  n: number,
  color: string,
) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(at.x, at.y, PIN_RADIUS, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = CARD.pinInk;
  g.stroke();
  g.fillStyle = CARD.pinInk;
  g.font = `700 21px Space, Arial, sans-serif`;
  g.textAlign = "center";
  g.fillText(String(n), at.x, at.y + PIN_DIGIT_DROP);
  g.textAlign = "left";
}
