// Synthesized voices for every track. Pure Tone.js, no samples, no React.
// Tone is passed in (not imported) so the library is only loaded on demand.

import type * as ToneLib from "tone";
import { type Note, type TrackId } from "./pattern";

type Tone = typeof ToneLib;

export type Voice = {
  /** Node to connect into the mixer channel. */
  output: ToneLib.ToneAudioNode;
  /** Play one step at an exact AudioContext time. */
  trigger: (time: number, note: Note | null) => void;
  dispose: () => void;
};

// Two octaves of C minor pentatonic, indexed by scale degree.
const PENTATONIC = ["C", "Eb", "F", "G", "Bb"];
export function noteName(degree: Note, baseOctave: number): string {
  const octave = baseOctave + Math.floor(degree / PENTATONIC.length);
  return `${PENTATONIC[degree % PENTATONIC.length]}${octave}`;
}

export function createVoices(Tone: Tone): Record<TrackId, Voice> {
  const openHat = metal(Tone, { decay: 0.35, frequency: 320, resonance: 4000 });
  const closedHat = metal(Tone, {
    decay: 0.05,
    frequency: 320,
    resonance: 4000,
  });

  return {
    kick: membrane(Tone, {
      note: "C1",
      pitchDecay: 0.05,
      octaves: 6,
      decay: 0.45,
    }),
    snare: snare(Tone),
    clap: clap(Tone),
    closedHat: {
      ...closedHat,
      trigger: (time, note) => {
        // Closed hat chokes the open hat, like on a real kit.
        openHat.choke(time);
        closedHat.trigger(time, note);
      },
    },
    openHat,
    ride: metal(Tone, {
      decay: 1.2,
      frequency: 500,
      resonance: 7000,
      harmonicity: 12,
      volume: -8,
    }),
    tom: membrane(Tone, {
      note: "G2",
      pitchDecay: 0.08,
      octaves: 2,
      decay: 0.3,
    }),
    perc: perc(Tone),
    fx1: crash(Tone),
    fx2: zap(Tone),
    bass: bass(Tone),
    synth: lead(Tone),
  };
}

function membrane(
  Tone: Tone,
  opts: { note: string; pitchDecay: number; octaves: number; decay: number },
): Voice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: opts.pitchDecay,
    octaves: opts.octaves,
    envelope: { attack: 0.001, decay: opts.decay, sustain: 0, release: 0.05 },
  });
  return {
    output: synth,
    trigger: (time) => synth.triggerAttackRelease(opts.note, "8n", time),
    dispose: () => synth.dispose(),
  };
}

function metal(
  Tone: Tone,
  opts: {
    decay: number;
    frequency: number;
    resonance: number;
    harmonicity?: number;
    volume?: number;
  },
): Voice & { choke: (time: number) => void } {
  const synth = new Tone.MetalSynth({
    harmonicity: opts.harmonicity ?? 5.1,
    modulationIndex: 32,
    resonance: opts.resonance,
    octaves: 1.5,
    volume: opts.volume ?? -12,
    envelope: { attack: 0.001, decay: opts.decay, release: 0.01 },
  });
  return {
    output: synth,
    trigger: (time) =>
      synth.triggerAttackRelease(opts.frequency, opts.decay, time),
    choke: (time) => synth.triggerRelease(time),
    dispose: () => synth.dispose(),
  };
}

function snare(Tone: Tone): Voice {
  const out = new Tone.Gain(1);
  const noise = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  });
  const highpass = new Tone.Filter(1200, "highpass");
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 2,
    volume: -6,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
  });
  noise.chain(highpass, out);
  body.connect(out);
  return {
    output: out,
    trigger: (time) => {
      noise.triggerAttackRelease(0.18, time);
      body.triggerAttackRelease("E3", 0.1, time);
    },
    dispose: () => [noise, highpass, body, out].forEach((n) => n.dispose()),
  };
}

function clap(Tone: Tone): Voice {
  const noise = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
  });
  const bandpass = new Tone.Filter({ frequency: 1500, type: "bandpass", Q: 1 });
  noise.connect(bandpass);
  return {
    output: bandpass,
    trigger: (time) => {
      // A clap is several hands slightly out of sync: three short bursts,
      // then the last one rings out.
      for (const offset of [0, 0.011, 0.022]) {
        noise.triggerAttackRelease(0.01, time + offset);
      }
      noise.triggerAttackRelease(0.2, time + 0.033);
    },
    dispose: () => [noise, bandpass].forEach((n) => n.dispose()),
  };
}

function perc(Tone: Tone): Voice {
  const synth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    volume: -14,
  });
  const highpass = new Tone.Filter(800, "highpass");
  synth.connect(highpass);
  return {
    output: highpass,
    trigger: (time) => synth.triggerAttackRelease("E5", 0.04, time),
    dispose: () => [synth, highpass].forEach((n) => n.dispose()),
  };
}

function crash(Tone: Tone): Voice {
  const noise = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.002, decay: 1.6, sustain: 0 },
    volume: -10,
  });
  const highpass = new Tone.Filter(3500, "highpass");
  noise.connect(highpass);
  return {
    output: highpass,
    trigger: (time) => noise.triggerAttackRelease(1.6, time),
    dispose: () => [noise, highpass].forEach((n) => n.dispose()),
  };
}

function zap(Tone: Tone): Voice {
  const synth = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.02 },
    volume: -14,
  });
  return {
    output: synth,
    trigger: (time) => {
      synth.triggerAttackRelease(2400, 0.18, time);
      // Fast downward pitch sweep — the classic "laser".
      synth.frequency.exponentialRampToValueAtTime(90, time + 0.16);
    },
    dispose: () => synth.dispose(),
  };
}

function bass(Tone: Tone): Voice {
  // Reese-style: detuned saws through a low-pass filter.
  const synth = new Tone.MonoSynth({
    oscillator: { type: "fatsawtooth", count: 2, spread: 25 },
    filter: { type: "lowpass", Q: 2 },
    filterEnvelope: {
      attack: 0.005,
      decay: 0.2,
      sustain: 0.4,
      release: 0.1,
      baseFrequency: 120,
      octaves: 2.5,
    },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.08 },
    volume: -8,
  });
  return {
    output: synth,
    trigger: (time, note) => {
      if (note === null) return;
      synth.triggerAttackRelease(noteName(note, 1), "16n", time);
    },
    dispose: () => synth.dispose(),
  };
}

function lead(Tone: Tone): Voice {
  const synth = new Tone.MonoSynth({
    oscillator: { type: "square" },
    filter: { type: "lowpass", Q: 1 },
    filterEnvelope: {
      attack: 0.001,
      decay: 0.15,
      sustain: 0.2,
      release: 0.1,
      baseFrequency: 600,
      octaves: 3,
    },
    envelope: { attack: 0.002, decay: 0.15, sustain: 0.3, release: 0.1 },
    volume: -14,
  });
  return {
    output: synth,
    trigger: (time, note) => {
      if (note === null) return;
      synth.triggerAttackRelease(noteName(note, 4), "16n", time);
    },
    dispose: () => synth.dispose(),
  };
}
