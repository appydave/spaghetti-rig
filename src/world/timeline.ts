// A player's world clock and what runs on it (G04 W5b): cues that fire at a time, tweens that run for a while, and the temporary things a
// step makes and the next step must dispose. Moved out of world.ts as it was.

interface Tween {
  age: number;
  dur: number;
  fn: (k: number) => void;
  done?: () => void;
}
interface Cue {
  at: number;
  fn: () => void;
}

export class Timeline {
  clock = 0;
  tweens: Tween[] = [];
  cues: Cue[] = [];
  private temps: { dispose(): void }[] = [];

  /** Run fn this many seconds from now. */
  after(seconds: number, fn: () => void) {
    this.cues.push({ at: this.clock + seconds, fn });
  }

  tween(dur: number, fn: (k: number) => void, done?: () => void) {
    this.tweens.push({ age: 0, dur, fn, done });
  }

  /** Keep a temporary thing to dispose when the timeline is cleared. */
  track<T extends { dispose(): void }>(t: T) {
    this.temps.push(t);

    return t;
  }

  /** The thing is disposed of already: stop keeping it. */
  untrack(t: { dispose(): void }) {
    this.temps.splice(this.temps.indexOf(t), 1);
  }

  /** Drop everything that is running or kept. */
  clear() {
    this.tweens = [];
    this.cues = [];
    for (const t of this.temps) {
      t.dispose();
    }

    this.temps = [];
  }

  step(dt: number) {
    this.clock += dt;
    for (const cue of this.cues.filter((c) => c.at <= this.clock)) {
      this.cues.splice(this.cues.indexOf(cue), 1);
      cue.fn();
    }

    // Iterate a snapshot: finished tweens are spliced out of the live list inside the loop.
    const tweenSnapshot = this.tweens.slice();

    for (const t of tweenSnapshot) {
      t.age += dt;

      const k = Math.min(1, t.age / t.dur);

      t.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(t), 1);
        t.done?.();
      }
    }
  }
}
