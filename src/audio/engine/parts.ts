// The audio engines, made once at boot and handed to the AudioEngine facade (G15): the facade drives them but does not construct them.
import { Music } from "#root/src/audio/engine/music.ts";
import { SfxPlayer } from "#root/src/audio/engine/sfx-player.ts";
import type { AudioParts } from "#root/src/audio/types.ts";

export const audioParts = (): AudioParts => ({
  music: new Music(),
  makeSfx: (ctx, bus, noise) => new SfxPlayer(ctx, bus, noise),
});
