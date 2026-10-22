import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseContent } from '../content/load';
import { buildScript, healthAt, nextIndex, notesFor, tierStart, toolsEarned } from './script';

const raw = JSON.parse(readFileSync(new URL('../../public/content/cards.json', import.meta.url), 'utf8'));
const game = parseContent(raw);
const script = buildScript(game);

describe('content', () => {
  it('locks tiers with no stops and keeps their boss name', () => {
    const locked = game.tiers.filter((t) => !t.playable);
    expect(locked.length).toBeGreaterThan(0);
    for (const t of locked) expect(t.boss.name).toBeTruthy();
  });

  it('every stop has a problem card and a tool card with code', () => {
    for (const t of game.tiers) for (const s of t.stops) {
      expect(s.p1.blocks.length).toBeGreaterThan(0);
      expect(s.p2.blocks.length).toBeGreaterThan(0);
    }
  });

  it('a new stop or tier in the file shows up with no code change', () => {
    const extra = structuredClone(raw);
    extra.stops.push({ ...structuredClone(raw.stops[0]), tier: 'architecture', gate: 'G13 · New gate' });
    const g = parseContent(extra);
    const arch = g.tiers.find((t) => t.key === 'architecture')!;
    expect(arch.playable).toBe(true);
    expect(buildScript(g).some((s) => s.tier === arch.index && s.phase === 'problem')).toBe(true);

    extra.tiers.push({ n: 7, key: 'seventh', name: 'Seventh', boss: { name: 'The new boss', parts: [] } });
    extra.stops.push({ ...structuredClone(raw.stops[1]), tier: 'seventh', gate: 'G99 · Later' });
    const g2 = parseContent(extra);
    expect(g2.tiers.at(-1)!.playable).toBe(true);
    expect(buildScript(g2).filter((s) => s.tier === 6 && s.phase === 'walk')).toHaveLength(1);
  });

  it('survives junk', () => {
    const g = parseContent({ tiers: [{ key: 'x' }], stops: [{ tier: 'x', p1: { blocks: [{ rows: [['c', 'a']] }], annotations: [{ block: 3, row: 9 }] } }] });
    expect(g.tiers[0]!.playable).toBe(true);
    expect(g.tiers[0]!.stops[0]!.p1.annotations).toHaveLength(0);
    expect(buildScript(g).length).toBeGreaterThan(3);
    expect(() => buildScript(parseContent(null))).not.toThrow();
  });
});

describe('script', () => {
  it('opens on a VS screen and ends on the endings', () => {
    expect(script[0]!.phase).toBe('vs');
    expect(script.at(-1)!.phase).toBe('ending');
  });

  it('every playable tier has a VS screen to jump to', () => {
    for (const t of game.tiers.filter((x) => x.playable)) expect(tierStart(script, t.index)).toBeGreaterThanOrEqual(0);
  });

  it('player 1 mode skips the tool card steps', () => {
    const at = script.findIndex((s) => s.phase === 'problem');
    const next = script[nextIndex(script, at, 1, 'p1')]!;
    expect(next.phase).toBe('walk');
    expect(script[nextIndex(script, at, 1, 'both')]!.phase).toBe('tool');
  });

  it('stays put at the ends', () => {
    expect(nextIndex(script, 0, -1, 'both')).toBe(0);
    expect(nextIndex(script, script.length - 1, 1, 'both')).toBe(script.length - 1);
  });
});

describe('health', () => {
  const tier = game.tiers.find((t) => t.stops.length === 4)!;
  const steps = script.filter((s) => s.tier === tier.index);
  const at = (phase: string, stop = -1, part = -1) => steps.find((s) => s.phase === phase && (stop < 0 || s.stop === stop) && (part < 0 || s.part === part))!;

  it('player 1 drops 90/n per stop and reaches the boss on 10%', () => {
    expect(healthAt(game, at('vs'), 'p1')).toBe(100);
    expect(healthAt(game, at('problem', 0), 'p1')).toBe(77.5);
    expect(healthAt(game, at('problem', 3), 'p1')).toBe(10);
    expect(healthAt(game, at('boss'), 'p1')).toBe(10);
    expect(healthAt(game, at('bossPart', -1, 0), 'p1')).toBe(0);
  });

  it('player 2 is hit then fully healed by every tool card', () => {
    for (let k = 0; k < 4; k++) {
      expect(healthAt(game, at('problem', k), 'p2')).toBe(77.5);
      expect(healthAt(game, at('fixed', k), 'p2')).toBe(100);
    }
    expect(healthAt(game, at('bossDown'), 'p2')).toBe(100);
  });

  it('three-stop tier: 100 → 70 → 40 → 10', () => {
    const three = game.tiers.find((t) => t.stops.length === 3)!;
    const p = script.filter((s) => s.tier === three.index && s.phase === 'problem').map((s) => healthAt(game, s, 'p1'));
    expect(p).toEqual([70, 40, 10]);
  });

  it('player 2 earns one tool per fixed stop', () => {
    expect(toolsEarned(game, at('walk', 0))).toEqual([]);
    expect(toolsEarned(game, at('fixed', 0))).toEqual([tier.stops[0]!.p2.tool]);
    expect(toolsEarned(game, at('boss'))).toHaveLength(4);
  });
});

describe('notes', () => {
  it('every step has notes, and card steps carry the line to say', () => {
    for (const s of script) {
      const n = notesFor(game, s, 'both');
      expect(n.heading).toBeTruthy();
      if (s.phase === 'problem' || s.phase === 'tool') expect(n.say).toBeTruthy();
    }
  });
});
