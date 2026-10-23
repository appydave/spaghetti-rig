// A spy on what a world's timeline keeps and disposes (G04 H1i). Every temporary thing the world tracks is wrapped so its dispose() calls
// are counted; the report says how many are kept now, how many dispose() calls there have been, and how many things were disposed twice
// (a leak shows as a kept thing never disposed, a wrong untrack as a double dispose). It works on a world that tracks its own temps and on
// one that has a timeline that does.
const TWICE = 2;

export function spyOnTemps(w: any): () => string {
  const host = w.timeline ?? w;
  const disposals: number[] = [];
  const track = host.track.bind(host);

  host.track = (t: { dispose(): void }) => {
    const i = disposals.push(0) - 1;
    const dispose = t.dispose.bind(t);

    t.dispose = () => {
      disposals[i] = (disposals[i] ?? 0) + 1;
      dispose();
    };

    return track(t);
  };

  return () => {
    const total = disposals.reduce((a, b) => a + b, 0);
    const twice = disposals.filter((n) => n >= TWICE).length;

    return `temps:${host.temps.length} disposed:${total} twice:${twice}`;
  };
}
