import * as THREE from "three";
import { gateLabel } from "../content/gatelabel";
import { ROAD_HALF } from "./city";
import { disposeTree, kit } from "./toon";
import { context2d } from "../dom";
import { GATE } from "./palette";

const OUTLINE = 0.025;
const SIGN_ANISOTROPY = 8;
/** The sign is painted on a canvas this big: a board with a border, an optional number badge, and the title. */
const SIGN_WIDTH = 1024;
const SIGN_HEIGHT = 200;
const SIGN_CORNER = 26;
const SIGN_BORDER_INSET = 8;
const SIGN_BORDER_WIDTH = SIGN_WIDTH - SIGN_BORDER_INSET * 2;
const SIGN_BORDER_HEIGHT = SIGN_HEIGHT - SIGN_BORDER_INSET * 2;
const SIGN_BORDER_CORNER = 20;
const SIGN_BORDER_LINE = 10;
/** The number badge: its place and size, the word "GATE" above the number, and the number's size for short and long numbers. */
const BADGE_X = 28;
const BADGE_Y = 22;
const BADGE_WIDTH = 190;
const BADGE_HEIGHT = 156;
const BADGE_CORNER = 22;
const BADGE_CENTRE_X = 123;
const BADGE_WORD_Y = 52;
const BADGE_NUMBER_Y = 118;
const BADGE_WORD_SIZE = 26;
const BADGE_NUMBER_SIZE = 104;
const BADGE_LONG_NUMBER_SIZE = 84;
/** The title starts here with a badge (40 without one), keeps this margin on the right, and shrinks by 4 until it fits. */
const TITLE_LEFT_WITH_BADGE = 240;
const TITLE_LEFT = 40;
const TITLE_RIGHT_MARGIN = 36;
const TITLE_FIRST_SIZE = 112;
const TITLE_SIZE_STEP = 4;
const TITLE_MIN_SIZE = 40;
const TITLE_BASELINE_Y = 106;
/** The boom swings up to open (a little short of straight up), drops to broken, and eases towards its angle at this rate. */
const BOOM_OPEN_SHORT = 0.05;
const BOOM_BROKEN_ANGLE = -0.5;
const BOOM_BROKEN_TILT = 0.35;
const BOOM_EASE_RATE = 6;
/** In the alarm state the light blinks at this rate; the check mark turns at this speed. */
const ALARM_BLINK_RATE = 10;
const CHECK_SPIN_SPEED = 2;

export type GateState = "idle" | "alarm" | "open" | "broken";

/** The angle the boom eases towards, and its tilt, in each state. */
const BOOM_TARGET: Record<GateState, number> = {
  idle: 0,
  alarm: 0,
  open: Math.PI / 2 - BOOM_OPEN_SHORT,
  broken: BOOM_BROKEN_ANGLE,
};
const BOOM_TILT: Record<GateState, number> = {
  idle: 0,
  alarm: 0,
  open: 0,
  broken: BOOM_BROKEN_TILT,
};
/** The status light's colour in each state (the alarm's other colour is the blink's off beat). */
const LIGHT_ON: Record<GateState, string> = {
  idle: GATE.lightIdle,
  alarm: GATE.lightAlarmOn,
  open: GATE.lightOpen,
  broken: GATE.lightAlarmOn,
};

/** A checkpoint arch over the road: pillars, a sign with the gate's name, a boom barrier and a status light. */
export class Gate {
  readonly group = new THREE.Group();
  private readonly boom = new THREE.Group();
  /** The near pillar, beam, sign and light: hidden when the camera looks across the street. */
  readonly near = new THREE.Group();
  private readonly light: THREE.Mesh;
  private readonly lightMat = new THREE.MeshBasicMaterial({
    color: GATE.lightStart,
    toneMapped: false,
  });
  private readonly check: THREE.Mesh;
  state: GateState = "idle";
  private boomAngle = 0;
  private t = 0;

  constructor(label: string, z: number) {
    const a = kit(OUTLINE);

    this.group.position.z = z;

    const x = ROAD_HALF + 0.5;

    this.group.add(this.near);
    for (const s of [-1, 1]) {
      const g = s > 0 ? this.near : this.group;

      a.soft(g, GATE.post, s * x, 2.4, 0, 0.6, 4.8, 0.6);
      for (const y of [0.8, 1.8, 2.8, 3.8]) {
        a.box(g, GATE.ink, s * x, y, 0, 0.64, 0.18, 0.64, false);
      }

      a.soft(g, GATE.foot, s * x, 0.2, 0, 0.9, 0.4, 0.9);
    }

    a.soft(this.near, GATE.beam, 0, 5.0, 0, x * 2 + 1.0, 0.7, 0.7);

    // The sign, readable from both directions.
    const cv = document.createElement("canvas");

    cv.width = SIGN_WIDTH;
    cv.height = SIGN_HEIGHT;

    const g = context2d(cv);

    g.fillStyle = GATE.signBoard;
    g.beginPath();
    g.roundRect(0, 0, SIGN_WIDTH, SIGN_HEIGHT, SIGN_CORNER);
    g.fill();
    g.strokeStyle = GATE.signBorder;
    g.lineWidth = SIGN_BORDER_LINE;
    g.beginPath();
    g.roundRect(
      SIGN_BORDER_INSET,
      SIGN_BORDER_INSET,
      SIGN_BORDER_WIDTH,
      SIGN_BORDER_HEIGHT,
      SIGN_BORDER_CORNER,
    );
    g.stroke();

    // A number badge, then the title.
    const { num, title } = gateLabel(label);
    let left = TITLE_LEFT;

    if (num) {
      g.fillStyle = GATE.signBadge;
      g.beginPath();
      g.roundRect(BADGE_X, BADGE_Y, BADGE_WIDTH, BADGE_HEIGHT, BADGE_CORNER);
      g.fill();
      g.fillStyle = GATE.signBadgeText;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 ${BADGE_WORD_SIZE}px Space, Arial, sans-serif`;
      g.fillText("GATE", BADGE_CENTRE_X, BADGE_WORD_Y);
      g.font = `italic 800 ${num.length > 2 ? BADGE_LONG_NUMBER_SIZE : BADGE_NUMBER_SIZE}px Barlow, Impact, sans-serif`;
      g.fillText(num, BADGE_CENTRE_X, BADGE_NUMBER_Y);
      left = TITLE_LEFT_WITH_BADGE;
    }

    g.fillStyle = GATE.signTitle;
    g.textAlign = "center";
    g.textBaseline = "middle";

    const room = SIGN_WIDTH - left - TITLE_RIGHT_MARGIN;
    let size = TITLE_FIRST_SIZE;

    do {
      g.font = `italic 800 ${size}px Barlow, Impact, sans-serif`;
      size -= TITLE_SIZE_STEP;
    } while (g.measureText(title).width > room && size > TITLE_MIN_SIZE);

    g.fillText(title, left + room / 2, TITLE_BASELINE_Y);

    const tex = new THREE.CanvasTexture(cv);

    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = SIGN_ANISOTROPY;

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 1.1),
      new THREE.MeshBasicMaterial({
        map: tex,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );

    sign.position.set(0, 6.0, 0.05);
    this.near.add(sign);
    a.box(this.near, GATE.ink, -2, 5.45, 0, 0.08, 0.5, 0.08, false);
    a.box(this.near, GATE.ink, 2, 5.45, 0, 0.08, 0.5, 0.08, false);
    // Status light on top.
    this.light = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      this.lightMat,
    );
    this.light.position.set(0, 7.0, 0);
    this.near.add(this.light);
    this.check = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: GATE.check, toneMapped: false }),
    );
    this.check.position.copy(this.light.position);
    this.check.visible = false;
    this.near.add(this.check);
    // Boom barrier hinged at the left pillar.
    this.boom.position.set(-x + 0.3, 1.25, 0);
    this.group.add(this.boom);
    for (let i = 0; i < 7; i++) {
      a.box(
        this.boom,
        i % 2 ? GATE.boomStripe : GATE.boomStripeGap,
        0.5 + i * 0.95,
        0,
        0,
        0.95,
        0.22,
        0.18,
        i === 0,
      );
    }
  }

  update(dt: number) {
    this.t += dt;
    this.boomAngle +=
      (BOOM_TARGET[this.state] - this.boomAngle) *
      (1 - Math.exp(-dt * BOOM_EASE_RATE));
    this.boom.rotation.z = this.boomAngle;
    this.boom.rotation.x = BOOM_TILT[this.state];

    // Only the alarm blinks; the other states show their own colour all the time.
    const on =
      this.state !== "alarm" || Math.sin(this.t * ALARM_BLINK_RATE) > 0;

    this.lightMat.color.set(on ? LIGHT_ON[this.state] : GATE.lightAlarmOff);
    this.check.visible = this.state === "open";
    this.check.rotation.y += dt * CHECK_SPIN_SPEED;
  }

  dispose() {
    disposeTree(this.group);
  }
}

export { toon as gateToon } from "./toon";
