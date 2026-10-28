/**
 * The music sequencer: it walks a deck's score forward on the audio clock and asks the voices to play what each step holds.
 * It knows the score and the clock, not the Web Audio graph: the engine hands it the voices and the one decision that is the engine's
 * (rolling a finished deck over to the theme's next track).
 */
import type { Deck, Note } from "#root/src/audio/music/deck.ts";
import {
  SEMITONES_PER_OCTAVE,
  STEPS_PER_BEAT,
  type CompiledTrack,
  type LeadVoice,
} from "#root/src/audio/tracks.ts";
import type { TrackMix } from "#root/src/audio/types.ts";

/** If the scheduler falls this far behind (a hidden tab), it jumps forward instead of bursting. */
const STALL_SECONDS = 0.25;
/** The scheduler plays at most this many steps in one tick. */
const SCHEDULE_GUARD = 256;
/** A step this far in the past is still played. */
const LATE_STEP_SECONDS = 0.02;
/** Off the beat the bass and the lead play this much softer. */
const OFFBEAT_BASS = 0.85;
const OFFBEAT_LEAD = 0.86;
/** The second time round a quiet bell doubles the hook an octave up, dead centre. */
const HOOK_BELL_LEVEL = 0.1;
const HOOK_BELL_DECAY = 0.9;
const HOOK_BELL_PAN = 0;
/** The arpeggio swings between the speakers, and plays as a bell or a pluck. */
const ARP_PAN = 0.45;
const ARP_BELL_LEVEL = 0.06;
const ARP_BELL_DECAY = 0.7;
const ARP_PLUCK_LEVEL = 0.075;

/** The voices a step can ask for. */
export interface MusicVoices {
  padChord(note: Note, notes: number[], len: number): void;
  bassNote(note: Note, midi: number, len: number): void;
  leadNote(note: Note, midi: number, len: number, voice: LeadVoice): void;
  pluck(note: Note, midi: number, pan: number): void;
  bell(note: Note, midi: number, pan: number, decay: number): void;
  compStab(note: Note, notes: number[], dark: boolean): void;
  perc(note: Note, kind: "t" | "T" | "s"): void;
}

/** What the sequencer needs from the engine. */
export interface SequencerHost {
  voices: MusicVoices;
  /** The deck has played its loops. True when the engine has moved on to the theme's next track, so this deck stops scheduling. */
  rollOver(deck: Deck, at: number): boolean;
}

/** One step of a deck's score, and the time to sound it. */
export interface StepAt {
  deck: Deck;
  idx: number;
  loop: number;
  t: number;
}

type ScoreStep = NonNullable<CompiledTrack["steps"][number]>;

const mixOf = (deck: Deck): TrackMix => deck.track.def.mix ?? {};
const noteAt = (at: StepAt, level: number): Note => ({
  deck: at.deck,
  t: at.t,
  level,
});
const lengthOf = (at: StepAt, steps: number): number =>
  steps * at.deck.track.stepSec;
/** Full level on the beat, `offbeat` times that off it. */
const accent = (at: StepAt, offbeat: number): number =>
  at.idx % STEPS_PER_BEAT === 0 ? 1 : offbeat;

function playPad(at: StepAt, ev: ScoreStep, voices: MusicVoices): void {
  if (ev.chord) {
    voices.padChord(
      noteAt(at, mixOf(at.deck).pad ?? 1),
      ev.chord.pad,
      lengthOf(at, ev.chord.len),
    );
  }
}

function playBass(at: StepAt, ev: ScoreStep, voices: MusicVoices): void {
  if (ev.bass) {
    const level = (mixOf(at.deck).bass ?? 1) * accent(at, OFFBEAT_BASS);

    voices.bassNote(noteAt(at, level), ev.bass.midi, lengthOf(at, ev.bass.len));
  }
}

function playLead(at: StepAt, ev: ScoreStep, voices: MusicVoices): void {
  if (!ev.lead) {
    return;
  }

  const { def } = at.deck.track;
  const vel = (mixOf(at.deck).lead ?? 1) * accent(at, OFFBEAT_LEAD);

  voices.leadNote(
    noteAt(at, vel),
    ev.lead.midi,
    lengthOf(at, ev.lead.len),
    def.lead,
  );
  // Second time round, a quiet bell doubles the hook an octave up.
  if (at.loop % 2 === 1 && def.theme !== "stop") {
    voices.bell(
      noteAt(at, HOOK_BELL_LEVEL * vel),
      ev.lead.midi + SEMITONES_PER_OCTAVE,
      HOOK_BELL_PAN,
      HOOK_BELL_DECAY,
    );
  }
}

function playArp(at: StepAt, ev: ScoreStep, voices: MusicVoices): void {
  if (ev.arp === undefined) {
    return;
  }

  const pan = at.idx % 2 === 0 ? -ARP_PAN : ARP_PAN;
  const arp = mixOf(at.deck).arp ?? 1;

  if (at.deck.track.def.arpVoice === "bell") {
    voices.bell(noteAt(at, ARP_BELL_LEVEL * arp), ev.arp, pan, ARP_BELL_DECAY);
  } else {
    voices.pluck(noteAt(at, ARP_PLUCK_LEVEL * arp), ev.arp, pan);
  }
}

function playComp(at: StepAt, ev: ScoreStep, voices: MusicVoices): void {
  if (ev.comp) {
    voices.compStab(
      noteAt(at, mixOf(at.deck).comp ?? 1),
      ev.comp,
      at.deck.track.def.theme === "boss",
    );
  }
}

function playPerc(at: StepAt, ev: ScoreStep, voices: MusicVoices): void {
  if (ev.perc) {
    voices.perc(noteAt(at, mixOf(at.deck).perc ?? 1), ev.perc);
  }
}

/** Ask the voices for everything step `at.idx` of the deck's score holds, sounding at `at.t`. */
export function scheduleStep(at: StepAt, voices: MusicVoices): void {
  const ev = at.deck.track.steps[at.idx];

  if (!ev) {
    return;
  }

  playPad(at, ev, voices);
  playBass(at, ev, voices);
  playLead(at, ev, voices);
  playArp(at, ev, voices);
  playComp(at, ev, voices);
  playPerc(at, ev, voices);
}

/** After a long stall (hidden tab), jump forward instead of bursting. */
function skipStall(deck: Deck, now: number): void {
  const { stepSec } = deck.track;

  if (deck.start + deck.abs * stepSec < now - STALL_SECONDS) {
    deck.abs = Math.ceil((now - deck.start) / stepSec);
  }
}

/** Whether the step starting at `base` is still inside the look-ahead and before the deck's stop. */
const isDue = (deck: Deck, base: number, horizon: number): boolean =>
  base < horizon && (deck.stopAt === null || base < deck.stopAt);

/** Sound the deck's current step, unless the clock has already passed it; odd steps are delayed by the track's swing. */
function sound(
  deck: Deck,
  base: number,
  now: number,
  host: SequencerHost,
): void {
  const { track } = deck;
  const swing = deck.abs % 2 === 1 ? (track.def.swing ?? 0) * track.stepSec : 0;

  if (base >= now - LATE_STEP_SECONDS) {
    scheduleStep(
      {
        deck,
        idx: deck.abs % track.totalSteps,
        loop: Math.floor(deck.abs / track.totalSteps),
        t: Math.max(now, base + swing),
      },
      host.voices,
    );
  }
}

/** Whether the deck is at the first step of a loop it was meant to play no more than this: time to hand over to the next track. */
const finishedLoops = (deck: Deck): boolean => {
  const { track } = deck;
  const loop = Math.floor(deck.abs / track.totalSteps);

  return (
    deck.abs % track.totalSteps === 0 && loop > 0 && loop >= track.def.loops
  );
};

/** Schedule every step of the deck that falls before `horizon`. */
export function scheduleDeck(
  deck: Deck,
  now: number,
  horizon: number,
  host: SequencerHost,
): void {
  const { track } = deck;

  skipStall(deck, now);
  for (let guard = 0; guard < SCHEDULE_GUARD; guard++) {
    const base = deck.start + deck.abs * track.stepSec;

    if (!isDue(deck, base, horizon)) {
      return;
    }

    if (finishedLoops(deck) && host.rollOver(deck, base)) {
      return;
    }

    sound(deck, base, now, host);
    deck.abs++;
  }
}
