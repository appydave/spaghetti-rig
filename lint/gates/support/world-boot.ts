/** The real content, script and world a world harness plays. They are loaded here, after the caller has stubbed `document` (building a world paints canvases), and the physics engine is started. */
export async function loadWorld() {
  const { parseContent } = await import("../../../src/content/load");
  const { buildScript } = await import("../../../src/show/script");
  const { PlayerWorld, walkSeconds } = await import("../../../src/world/world");
  const { initPhysics } = await import("../../../src/world/combat/physics");

  await initPhysics();

  return { parseContent, buildScript, PlayerWorld, walkSeconds };
}
