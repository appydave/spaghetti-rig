// The pieces the Director is played against (G04 H2): the page it lives in (the real index.html body), a stage whose lanes follow the
// mode, two worlds that record every call and hold scripted numbers, and a recording BroadcastChannel. Used by director-proof.test.ts,
// which runs under happy-dom. Nothing here lays out or paints anything: happy-dom has no layout, no CSS cascade and no rendering.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Game } from "../../src/content/load";
import type { DirectorMessage, PresenterState } from "../../src/show/messages";
import type { Mode, Player, Step } from "../../src/show/script";

const WIDTH = 1600;
const HEIGHT = 900;
const FULL = 100;
const HEALTH_PERIOD = 120;
const HEALTH_SPEED = 13;
const PLAYER_OFFSET = 37;
const SCORE_STEP = 7;
const SHIPPED_EVERY = 11;
const AIM_PERIOD = 7;
const AIM_ON = 3;
const AIM_X = 0.25;
const AIM_Y = -0.5;
const AIM = { x: AIM_X, y: AIM_Y };
const DECIMALS = 3;

export type Log = string[];
export type Lane = {
  player: Player;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** The body of the real page, without its scripts, plus the one element main.ts adds. */
export function pageBody(): string {
  const html = readFileSync(
    join(import.meta.dirname, "../../index.html"),
    "utf8",
  );
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));

  return `${body.replace(/<body[^>]*>/, "").replaceAll(/<script[\s\S]*?<\/script>/g, "")}<div id="backdrop"></div>`;
}

/** What a BroadcastChannel records, and lets the harness deliver a message to the Director through. */
export class FakeChannel {
  static log: Log = [];
  static current: FakeChannel | null = null;
  private listener: ((e: { data: DirectorMessage }) => void) | null = null;

  constructor() {
    FakeChannel.current = this;
  }

  addEventListener(
    _type: string,
    fn: (e: { data: DirectorMessage }) => void,
  ): void {
    this.listener = fn;
  }

  postMessage(m: PresenterState): void {
    FakeChannel.log.push(`broadcast ${JSON.stringify(m)}`);
  }

  deliver(data: DirectorMessage): void {
    this.listener?.({ data });
  }
}

/** A stage with the lanes the real one has for a mode, at a fixed size. */
export class FakeStage {
  view = "none";
  readonly vs: { solo: Mode | null; reset: () => void };

  constructor(
    public mode: Mode,
    private readonly log: Log,
  ) {
    this.vs = { solo: null, reset: () => log.push("vs.reset") };
  }

  lanes(): Lane[] {
    const half = Math.floor(WIDTH / 2);

    if (this.mode === "p1" || this.mode === "p2") {
      return [{ player: this.mode, x: 0, y: 0, w: WIDTH, h: HEIGHT }];
    }

    return [
      { player: "p1", x: 0, y: 0, w: half, h: HEIGHT },
      { player: "p2", x: half, y: 0, w: WIDTH - half, h: HEIGHT },
    ];
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.log.push(`stage.setMode ${m}`);
  }
}

/** A world that records what the Director asks of it and holds numbers the harness scripts. */
export class FakeWorld {
  health = FULL;
  score = 0;
  shipped = 0;
  bossTotal = 0;
  bossLeft = 0;
  autoplay = false;
  aimOn = false;
  onSlip?: () => void;

  constructor(
    readonly player: Player,
    private readonly log: Log,
  ) {}

  private note(what: string): void {
    this.log.push(`${this.player}.${what}`);
  }

  enter(s: Step): void {
    this.note(`enter ${s.phase}${s.stop}.${s.part}`);
  }

  settle(s: Step): void {
    this.note(`settle ${s.phase}${s.stop}.${s.part}`);
  }

  setWalk(u: number): void {
    this.note(`setWalk ${u.toFixed(DECIMALS)}`);
  }

  update(dt: number): void {
    this.note(`update ${dt}`);
  }

  snapCamera(): void {
    this.note("snapCamera");
  }

  pointer(ndc: { x: number; y: number } | null, fire: boolean): void {
    const at = ndc
      ? `${ndc.x.toFixed(DECIMALS)},${ndc.y.toFixed(DECIMALS)}`
      : "null";

    this.note(`pointer ${at} ${fire}`);
  }

  autoAimScreen(): { x: number; y: number } | null {
    return this.aimOn ? AIM : null;
  }
}

/** Script the numbers a world would hold at this clock: health that falls and heals, a score that climbs, a boss that loses parts. */
export function script(
  w: FakeWorld,
  clock: number,
  step: Step,
  game: Game,
): void {
  const t =
    Math.floor(clock * HEALTH_SPEED) + (w.player === "p1" ? 0 : PLAYER_OFFSET);
  const parts = game.tiers[step.tier]?.boss.parts.length ?? 0;
  const boss = ["boss", "bossPart", "bossDown"].includes(step.phase);

  w.health = FULL - (t % HEALTH_PERIOD);
  w.score += SCORE_STEP;
  w.shipped = Math.floor(w.score / (SCORE_STEP * SHIPPED_EVERY));
  w.bossTotal = boss ? parts : 0;
  w.bossLeft = boss ? Math.max(0, parts - Math.max(0, step.part + 1)) : 0;
  w.aimOn = Math.floor(clock * HEALTH_SPEED) % AIM_PERIOD < AIM_ON;
}
