// A player's shooting (G04 W4): the pointer and its pick, the shot and what it hits, the autoplay hand, the enemies on the road and what
// happens when one gets past. Moved out of world.ts as it was; what it needs from the world around it comes in as CombatDeps.
import * as THREE from "three";
import {
  AutoGunner,
  chooseAutoTarget,
} from "#root/src/world/combat/autogunner.ts";
import { Enemy, SCORE } from "#root/src/world/models/enemies.ts";
import { type EnemyKind } from "#root/src/world/motion/enemy-motion.ts";
import { EVENT } from "#root/src/world/palette.ts";
import {
  bounceFx,
  killFx,
  shootFx,
  slipFx,
  type CombatDeps,
} from "#root/src/world/combat/shot-effects.ts";
import { disposeTree } from "#root/src/world/models/toon.ts";
import { RANDOM_CENTRE } from "#root/src/world/random-spread.ts";

const GUNNER_SEED_P1 = 11;
const GUNNER_SEED_P2 = 29;
const STREET_CLEAR_BURST_COUNT = 10;
const STREET_CLEAR_BURST_SPEED = 3;
const POINTER_FALLBACK_DISTANCE = 30;
const ENEMY_HIT_PADDING = 1.15;
const ENEMY_HIT_VOLUME = 0.6;
const ENEMY_HIT_BURST_COUNT = 12;
const ENEMY_HIT_BURST_SPEED = 5;
const GROUND_SPLASH_BELOW = 0.3;
const GROUND_SPLASH_Y = 0.05;
const MISS_BURST_COUNT = 5;
const BOSS_AIM_SPREAD_X = 3;
const BOSS_AIM_FRONT_Z = 0.6;
const AUTO_REST_Y = 1.2;
const AUTO_REST_Z = -14;
const SLIP_PAST_CHARACTER = 4;

interface Hit {
  point: THREE.Vector3;
  enemy?: Enemy;
  boss?: boolean;
}

export class Combat {
  enemies: Enemy[] = [];
  aim: THREE.Vector3 | null = null;
  autoTarget = -1;
  score = 0;
  /** Trigger pulls, from the mouse or autoplay. */
  shots = 0;
  /** Enemies that got past player 1: bugs shipped to production. */
  shipped = 0;
  /** An enemy got past: shipped (player 1) or caught by CI (player 2). */
  onSlip?: (kind: EnemyKind) => void;
  private readonly gunner: AutoGunner;

  constructor(private readonly d: CombatDeps) {
    this.gunner = new AutoGunner(
      d.player === "p1" ? GUNNER_SEED_P1 : GUNNER_SEED_P2,
    );
  }

  /** Aim at a point on screen (normalised device coords); fire if asked. Returns true when something was hit. */
  pointer(ndc: THREE.Vector2 | null, fire: boolean): boolean {
    if (!ndc) {
      this.aim = null;

      return false;
    }

    const ray = new THREE.Raycaster();

    ray.setFromCamera(ndc, this.d.camera);

    const hit = this.pick(ray.ray);
    const point =
      hit?.point ?? ray.ray.at(POINTER_FALLBACK_DISTANCE, new THREE.Vector3());

    this.aim = point;
    if (fire) {
      this.fireAt(point, hit?.enemy ?? null, hit?.boss ?? false);
    }

    return !!hit;
  }

  private pick(ray: THREE.Ray): Hit | null {
    return this.pickEnemy(ray) ?? this.pickBoss(ray);
  }

  /** The nearest enemy the ray goes through. */
  private pickEnemy(ray: THREE.Ray): Hit | null {
    let best: Hit | null = null;
    let bestD = Infinity;
    const c = new THREE.Vector3();

    for (const e of this.enemies) {
      e.center(c);

      const sphere = new THREE.Sphere(c, e.radius * ENEMY_HIT_PADDING);
      const p = ray.intersectSphere(sphere, new THREE.Vector3());

      if (p) {
        const d = p.distanceTo(ray.origin);

        if (d < bestD) {
          bestD = d;
          best = { point: p, enemy: e };
        }
      }
    }

    return best;
  }

  private pickBoss(ray: THREE.Ray): Hit | null {
    const boss = this.d.boss();

    if (!boss) {
      return null;
    }

    const box = new THREE.Box3().setFromObject(boss.core.group);
    const p = ray.intersectBox(box, new THREE.Vector3());

    return p ? { point: p, boss: true } : null;
  }

  private fireAt(point: THREE.Vector3, enemy: Enemy | null, boss: boolean) {
    const from = this.d.character.muzzleWorld();

    this.d.character.fire();
    this.shots++;
    shootFx(this.d, from, point);
    if (enemy) {
      this.hitEnemy(point, enemy, from);
    } else if (boss) {
      if (this.d.player === "p1" || this.d.boss()) {
        bounceFx(this.d, point);
      }
    } else {
      this.missShot(point);
    }
  }

  private hitEnemy(point: THREE.Vector3, enemy: Enemy, from: THREE.Vector3) {
    this.d.sfx("enemyHit", ENEMY_HIT_VOLUME);
    this.d.fx.burst(point, {
      n: ENEMY_HIT_BURST_COUNT,
      speed: ENEMY_HIT_BURST_SPEED,
    });
    if (enemy.hit()) {
      this.kill(enemy, from);
    }
  }

  private missShot(point: THREE.Vector3) {
    this.d.fx.burst(
      point.y < GROUND_SPLASH_BELOW ? point.setY(GROUND_SPLASH_Y) : point,
      { n: MISS_BURST_COUNT, speed: 2, colors: EVENT.shotBurst },
    );
  }

  shootBoss() {
    const boss = this.d.boss();

    if (!boss) {
      return;
    }

    const to = boss.core.group
      .getWorldPosition(new THREE.Vector3())
      .add(
        new THREE.Vector3(
          (Math.random() - RANDOM_CENTRE) * BOSS_AIM_SPREAD_X,
          (Math.random() - RANDOM_CENTRE) * 2,
          BOSS_AIM_FRONT_Z,
        ),
      );

    this.d.character.aimAt(to);
    this.fireAt(to, null, true);
  }

  private kill(e: Enemy, from: THREE.Vector3) {
    const at = e.center();

    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.score += SCORE[e.kind];
    killFx(this.d, e, from, at);
  }

  /** Autoplay: a seeded hand that drifts onto the nearest enemy ahead and fires like a person would. */
  autoShoot(dt: number) {
    const me = this.d.character.root.position;
    const target = chooseAutoTarget(this.enemies, me.z, this.autoTarget);

    this.autoTarget = target?.seed ?? -1;

    const rest = me.clone().add(new THREE.Vector3(0, AUTO_REST_Y, AUTO_REST_Z));
    const shot = this.gunner.update(
      dt,
      target
        ? { id: target.seed, centre: target.center(), radius: target.radius }
        : null,
      rest,
    );

    this.aim = this.gunner.aim;
    if (!shot) {
      return;
    }

    // Where the hand points is where the shot goes: a pulled shot really misses.
    const dir = shot.at.clone().sub(this.d.camera.position).normalize();
    const hit = this.pick(new THREE.Ray(this.d.camera.position.clone(), dir));

    this.fireAt(hit?.point ?? shot.at, hit?.enemy ?? null, false);
  }

  /** An enemy reached the end of its path alive. */
  private slip(e: Enemy) {
    if (this.d.player === "p1") {
      this.shipped++;
    }

    slipFx(this.d, e);
    this.onSlip?.(e.kind);
  }

  /** Move the enemies on; one that got past slips. Iterates a snapshot: enemies that got past are spliced out of the live list inside the loop. */
  stepEnemies(dt: number) {
    const me = this.d.character.root.position;
    const enemySnapshot = this.enemies.slice();

    for (const e of enemySnapshot) {
      e.update(dt, this.d.camera.position);
      if (e.finished || e.group.position.z > me.z + SLIP_PAST_CHARACTER) {
        this.slip(e);
        disposeTree(e.group);
        this.enemies.splice(this.enemies.indexOf(e), 1);
      }
    }
  }

  /** Autoplay's aim on screen (normalised device coords), for its reticle. */
  autoAimScreen(): THREE.Vector2 | null {
    if (!this.d.autoplay() || !this.d.walking() || !this.gunner.aim) {
      return null;
    }

    const p = this.gunner.aim.clone().project(this.d.camera);

    return p.z < 1 ? new THREE.Vector2(p.x, p.y) : null;
  }

  /** For tests: screen-space centre of the first enemy, if any. */
  enemyScreen(): THREE.Vector2 | null {
    const e = this.enemies[0];

    if (!e) {
      return null;
    }

    const p = e.center().project(this.d.camera);

    return new THREE.Vector2(p.x, p.y);
  }

  /** Tidy the street when a stop begins: remaining enemies poof away. */
  clearStreet() {
    for (const e of this.enemies) {
      this.d.fx.burst(e.center(), {
        n: STREET_CLEAR_BURST_COUNT,
        colors: EVENT.clearStreetBurst,
        speed: STREET_CLEAR_BURST_SPEED,
      });
      disposeTree(e.group);
    }

    this.enemies = [];
  }

  /** Drop every enemy, for a new tier. */
  clear() {
    for (const e of this.enemies) {
      disposeTree(e.group);
    }

    this.enemies = [];
  }
}
