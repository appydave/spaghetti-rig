// What a player's world has along the road (G04 W5c): the tier and its city and gates, the stop window, the tech debt trailing player 1,
// the boss and the spaghetti pile. The world tells it which state to match (sync); the rest of the world reads and moves the objects.
// Moved out of world.ts as it was.
import * as THREE from "three";
import type { Game, PlayTier } from "#root/src/content/load.ts";
import { nth, present } from "#root/src/nth.ts";
import type { Player } from "#root/src/show/script.ts";
import type { BossModel } from "#root/src/world/models/boss.ts";
import type { BossLayout } from "#root/src/world/code-window/bosslayout.ts";
import type { CameraRig } from "#root/src/world/camera-rig.ts";
import { buildCity, SEGMENT } from "#root/src/world/models/city.ts";
import { CodeWindow } from "#root/src/world/code-window/codewindow.ts";
import { Gate } from "#root/src/world/models/gate.ts";
import type { Debris } from "#root/src/world/combat/physics.ts";
import { makePile } from "#root/src/world/combat/pile.ts";
import {
  makeBossModel,
  makeStopWindow,
  paintStopCard,
} from "#root/src/world/tier-content.ts";
import { disposeTree } from "#root/src/world/models/toon.ts";
import {
  BOSS,
  DEBT_WINDOW_COLS,
  standZ,
  stopZ,
  type State,
} from "#root/src/world/world-shared.ts";

const RATTLE_P1 = 0.5;
const RATTLE_P2 = 0.3;
const RATTLE: Record<Player, number> = { p1: RATTLE_P1, p2: RATTLE_P2 };
const DEBT_WINDOW_WIDTH = 1.1;
const CITY_TAIL_LENGTH = 40;
const CITY_SEED_BASE = 1000;
const CITY_SEED_PER_TIER = 77;
const CITY_CLEAR_BEHIND_ARENA = 16;
const CITY_CLEAR_AHEAD_OF_ARENA = 60;

export class Street {
  tier: PlayTier | null = null;
  city: THREE.Group | null = null;
  gates: Gate[] = [];
  window: { win: CodeWindow; key: string; reading: boolean } | null = null;
  debt: { win: CodeWindow; key: string }[] = [];
  boss: BossModel | null = null;
  /** Kept after the boss breaks, so the camera holds its shot. */
  bossLayout: BossLayout | null = null;
  pile: THREE.Group | null = null;
  bossTotal = 0;
  bossLeft = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly game: Game,
    private readonly player: Player,
    private readonly rig: CameraRig,
  ) {}

  /** The tier being played. Set when the first step builds it, so a step that needs it before then is a bug. */
  get playing(): PlayTier {
    return present(this.tier, "the tier");
  }

  /** For tests: the key of the stop window on show, or "" when there is none. */
  get windowKey(): string {
    return this.window?.key ?? "";
  }

  get shownWindow() {
    return present(this.window, "the stop window");
  }

  get bossModel(): BossModel {
    return present(this.boss, "the boss");
  }

  /** Take the stop window off the street without disposing it, so the caller can animate it away. */
  releaseWindow() {
    const w = this.window;

    this.window = null;

    return w;
  }

  /** Show that this many of the boss's parts are broken. */
  setBroken(parts: number) {
    this.bossLeft = this.bossTotal - parts;
  }

  /** Spaghetti buries player 1: add the pile to the scene and return it. */
  bury() {
    const pile = makePile();

    this.pile = pile;
    this.scene.add(pile);

    return pile;
  }

  /** The boss is beaten: break it apart and take it off the street. */
  defeat(debris: Debris, from: THREE.Vector3) {
    this.bossModel.destroy(debris, from);
    this.boss = null;
  }

  gateAt(stop: number): Gate {
    return nth(this.gates, stop, "gates");
  }

  /** Take the old tier's objects away. */
  clear() {
    if (this.city) {
      disposeTree(this.city);
    }

    for (const g of this.gates) {
      g.dispose();
    }

    this.window?.win.dispose();
    this.window = null;
    for (const d of this.debt) {
      d.win.dispose();
    }

    this.debt = [];
    this.boss?.dispose();
    this.boss = null;
    this.bossLayout = null;
  }

  /** Build a tier's city and gates. */
  build(tier: PlayTier) {
    const length = (tier.stops.length + 1) * SEGMENT + CITY_TAIL_LENGTH;
    // The boss stands in an open plaza beyond the last stop, so no building can hide any part of it.
    const arena = standZ(tier.stops.length);

    this.city = buildCity(
      length,
      CITY_SEED_BASE + tier.index * CITY_SEED_PER_TIER,
      tier.hasBoss
        ? {
            from: arena + CITY_CLEAR_BEHIND_ARENA,
            to: arena - CITY_CLEAR_AHEAD_OF_ARENA,
          }
        : undefined,
    );
    this.scene.add(this.city);
    this.gates = tier.stops.map((s, k) => {
      const g = new Gate(s.gate, stopZ(k));

      this.scene.add(g.group);

      return g;
    });
    this.tier = tier;
  }

  addBoss(tier: PlayTier): BossModel {
    const boss = makeBossModel(this.game, tier);

    this.bossLayout = boss.layout;
    this.scene.add(boss.group);

    return boss;
  }

  /** Make the street match a state, reusing whatever already matches. */
  sync(s: State, tier: PlayTier) {
    this.syncGates(s);
    this.syncWindow(s, tier);
    this.syncDebt(s, tier);
    this.syncBoss(s, tier);
    this.syncPile(s);
  }

  private syncGates(s: State) {
    for (const [i, g] of s.gates.entries()) {
      const gate = this.gates[i];

      if (gate) {
        gate.state = g;
      }
    }
  }

  private syncWindow(s: State, tier: PlayTier) {
    const wantKey =
      s.window === "none" ? "" : `${s.stop}:${s.window}:${this.rig.shape}`;

    if ((this.window?.key ?? "") !== wantKey) {
      this.window?.win.dispose();
      this.window = wantKey ? this.openWindow(s, tier, wantKey) : null;
    }

    if (this.window) {
      this.window.reading = true;
      this.window.win.rattle = s.window === "problem" ? RATTLE[this.player] : 0;
    }
  }

  private openWindow(s: State, tier: PlayTier, key: string) {
    const stop = nth(tier.stops, s.stop, "stops");
    const win = makeStopWindow(
      { game: this.game, tier },
      stop,
      s.window === "fixed" ? "fixed" : "problem",
      this.rig.shape,
    );

    this.scene.add(win.group);

    return { win, key, reading: true };
  }

  private syncDebt(s: State, tier: PlayTier) {
    while (this.debt.length > s.debt) {
      this.debt.pop()?.win.dispose();
    }

    for (let k = this.debt.length; k < s.debt; k++) {
      const stop = nth(tier.stops, k, "stops");
      const win = new CodeWindow(
        paintStopCard(
          { game: this.game, tier },
          stop,
          "problem",
          DEBT_WINDOW_COLS,
        ),
        DEBT_WINDOW_WIDTH,
        "angry",
      );

      this.scene.add(win.group);
      this.debt.push({ win, key: String(k) });
    }
  }

  private syncBoss(s: State, tier: PlayTier) {
    if (s.boss === "none" || s.boss === "dead") {
      this.boss?.dispose();
      this.boss = null;
    } else {
      if (
        !this.boss ||
        this.boss.remaining < tier.boss.parts.length - s.broken
      ) {
        this.boss?.dispose();
        this.boss = this.addBoss(tier);
      }

      for (let i = 0; i < s.broken; i++) {
        this.boss.dropPart(i);
      }

      this.boss.group.position.set(
        0,
        BOSS.y,
        s.z - this.rig.bossBack(present(this.bossLayout, "boss layout")),
      );
    }

    this.bossTotal = tier.hasBoss ? tier.boss.parts.length : 0;
    this.bossLeft = s.boss === "dead" ? 0 : this.bossTotal - s.broken;
  }

  private syncPile(s: State) {
    if (s.pile && !this.pile) {
      this.pile = makePile();
      this.scene.add(this.pile);
    }

    if (!s.pile && this.pile) {
      disposeTree(this.pile);
      this.pile = null;
    }

    if (this.pile) {
      this.pile.position.set(0, 0, s.z);
    }
  }
}
