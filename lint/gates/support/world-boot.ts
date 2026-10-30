import { readFileSync } from "node:fs";

/** The real content, script and world a world harness plays. They are loaded here, after the caller has stubbed `document` (building a world paints canvases), and the physics engine is started. */
export async function loadWorld() {
  const { parseContent } = await import("../../../src/content/load");
  const { buildScript } = await import("../../../src/content/script");
  const { PlayerWorld } = await import("../../../src/world/world");
  const { walkSeconds } = await import("../../../src/world/layout/road");
  const { initPhysics } = await import("../../../src/world/combat/physics");

  await initPhysics();

  return { parseContent, buildScript, PlayerWorld, walkSeconds };
}

/** loadWorld plus the real game (public/content/cards.json) and its script. */
export async function loadGame() {
  const world = await loadWorld();
  const cards = JSON.parse(
    readFileSync(
      new URL("../../../public/content/cards.json", import.meta.url),
      "utf8",
    ),
  );
  const game = world.parseContent(cards);

  return { ...world, game, script: world.buildScript(game) };
}
