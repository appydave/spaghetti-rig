import * as THREE from "three";
import type { Mode, Player } from "#root/src/content/script.ts";
import { STAGE_CLEAR } from "#root/src/world/palette.ts";

/** Dense screens render at most this many pixels per CSS pixel, to keep the frame rate. */
const MAX_PIXEL_RATIO = 1.75;

/** The part of a player's world the stage draws: its scene and camera, and the aspect to cut the picture to. */
export interface StagedWorld {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  setAspect(aspect: number): void;
}

/** A full-screen 3D scene the stage draws and advances each frame: the title screen, the face-off. */
export interface Showcase extends StagedWorld {
  update(dt: number): void;
}
/** The face-off: reset for each showing, and which player alone it shows (null for both). */
export interface VsView extends Showcase {
  reset(): void;
  solo: Player | null;
}
export type View = "title" | "vs" | "game" | "none";
export interface Lane {
  player: Player;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One renderer for everything; side by side is two viewports cut with the scissor. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  view: View = "none";
  mode: Mode = "both";
  private worlds: Record<Player, StagedWorld> | null = null;
  private readonly size = new THREE.Vector2();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly title: Showcase,
    readonly vs: VsView,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(STAGE_CLEAR, 0);
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  attach(worlds: Record<Player, StagedWorld>) {
    this.worlds = worlds;
    this.layout();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.getSize(this.size);
    this.layout();
  }

  /** Lane rectangles in CSS pixels, left to right. */
  lanes(): Lane[] {
    const w = this.size.x;
    const h = this.size.y;

    if (this.mode === "p1") {
      return [{ player: "p1", x: 0, y: 0, w, h }];
    }

    if (this.mode === "p2") {
      return [{ player: "p2", x: 0, y: 0, w, h }];
    }

    const half = Math.floor(w / 2);

    return [
      { player: "p1", x: 0, y: 0, w: half, h },
      { player: "p2", x: half, y: 0, w: w - half, h },
    ];
  }

  layout() {
    const aspect = this.size.x / Math.max(1, this.size.y);

    this.title.setAspect(aspect);
    this.vs.setAspect(aspect);
    if (!this.worlds) {
      return;
    }

    for (const l of this.lanes()) {
      this.worlds[l.player].setAspect(l.w / l.h);
    }
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.layout();
  }

  laneAt(clientX: number): Lane | undefined {
    return this.lanes().find((l) => clientX >= l.x && clientX < l.x + l.w);
  }

  render(dt: number) {
    const r = this.renderer;

    r.setScissorTest(false);
    r.clear();
    if (this.view === "title") {
      this.title.update(dt);
      r.render(this.title.scene, this.title.camera);

      return;
    }

    if (this.view === "vs") {
      this.vs.update(dt);
      r.render(this.vs.scene, this.vs.camera);

      return;
    }

    if (this.view !== "game" || !this.worlds) {
      return;
    }

    const h = this.size.y;

    r.setScissorTest(true);
    for (const l of this.lanes()) {
      r.setViewport(l.x, h - l.y - l.h, l.w, l.h);
      r.setScissor(l.x, h - l.y - l.h, l.w, l.h);
      r.render(this.worlds[l.player].scene, this.worlds[l.player].camera);
    }

    r.setScissorTest(false);
    r.setViewport(0, 0, this.size.x, h);
  }
}
