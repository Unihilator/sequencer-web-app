// Audio engine: owns Tone.js, the mixer and the step scheduler.
// Framework-agnostic — UI talks to it through the store or this small API.

import type * as ToneLib from "tone";
import { createVoices, type Voice } from "./instruments";
import { type Pattern, type Track, type TrackId } from "./pattern";

type Tone = typeof ToneLib;

export type EngineStatus = "idle" | "loading" | "ready" | "error";

type StepListener = (step: number) => void;
type PlayingListener = (isPlaying: boolean) => void;

type Strip = {
  voice: Voice;
  channel: ToneLib.Channel;
  reverbSend: ToneLib.Gain;
  delaySend: ToneLib.Gain;
};

// Lets a pattern start a fraction later than "now" so the first notes are
// scheduled ahead of time instead of clipped.
const START_DELAY = 0.05;

export class AudioEngine {
  private tone: Tone | null = null;
  private loading: Promise<void> | null = null;
  private strips = new Map<TrackId, Strip>();
  private disposables: { dispose: () => void }[] = [];
  private pattern: Pattern;
  private repeatId: number | null = null;
  private stepCounter = 0;
  private playing = false;
  private stepListeners = new Set<StepListener>();
  private playingListeners = new Set<PlayingListener>();

  constructor(pattern: Pattern) {
    this.pattern = pattern;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Loads Tone.js and unlocks audio. Must be called from a user gesture
   * (click / key press), otherwise browsers keep the AudioContext suspended.
   */
  init(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    preferPlaybackAudioSession();
    const Tone = await import("tone");
    await Tone.start();
    this.tone = Tone;
    this.buildGraph(Tone);
    this.applyPattern(this.pattern);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  /** Current AudioContext time; use it to agree on a shared start moment. */
  now(): number {
    return this.tone?.now() ?? 0;
  }

  setPattern(pattern: Pattern): void {
    this.pattern = pattern;
    if (this.tone) this.applyPattern(pattern);
  }

  /** Starts from step 0 at `atTime` (AudioContext seconds) or right away. */
  async play(atTime?: number): Promise<void> {
    // Resume on every Play, synchronously inside the gesture: iOS suspends
    // ("interrupts") the AudioContext when the tab goes to the background,
    // and only a new user gesture brings it back.
    const resumed = this.tone?.start();
    await this.init();
    await resumed;
    const Tone = this.tone;
    if (!Tone) return;
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    this.stepCounter = 0;
    transport.start(atTime ?? Tone.now() + START_DELAY);
    this.setPlaying(true);
  }

  stop(): void {
    if (!this.tone) return;
    this.tone.getTransport().stop();
    this.setPlaying(false);
  }

  onStep(listener: StepListener): () => void {
    this.stepListeners.add(listener);
    return () => this.stepListeners.delete(listener);
  }

  onPlayingChange(listener: PlayingListener): () => void {
    this.playingListeners.add(listener);
    return () => this.playingListeners.delete(listener);
  }

  /**
   * Releases all audio nodes and the scheduler. The engine can be used again
   * afterwards: the next play() rebuilds the graph.
   */
  dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.stop();
    if (this.tone && this.repeatId !== null) {
      this.tone.getTransport().clear(this.repeatId);
    }
    for (const { voice } of this.strips.values()) voice.dispose();
    for (const node of this.disposables) node.dispose();
    this.strips.clear();
    this.disposables = [];
    this.repeatId = null;
    this.tone = null;
    this.loading = null;
  }

  private buildGraph(Tone: Tone): void {
    // Master: tracks + effect returns → limiter → speakers.
    const limiter = new Tone.Limiter(-1).toDestination();
    const master = new Tone.Gain(0.8).connect(limiter);
    const reverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01, wet: 1 });
    const delay = new Tone.FeedbackDelay({
      delayTime: "8n.",
      feedback: 0.35,
      wet: 1,
    });
    reverb.connect(master);
    delay.connect(master);
    this.disposables.push(limiter, master, reverb, delay);

    const voices = createVoices(Tone);
    for (const [id, voice] of Object.entries(voices) as [TrackId, Voice][]) {
      const channel = new Tone.Channel().connect(master);
      const reverbSend = new Tone.Gain(0).connect(reverb);
      const delaySend = new Tone.Gain(0).connect(delay);
      voice.output.connect(channel);
      channel.connect(reverbSend);
      channel.connect(delaySend);
      this.strips.set(id, { voice, channel, reverbSend, delaySend });
      this.disposables.push(channel, reverbSend, delaySend);
    }

    const transport = Tone.getTransport();
    transport.swingSubdivision = "16n";
    // Audio thread time `time` is exact; the callback itself runs early
    // (look-ahead), so UI updates are deferred to Tone.Draw.
    this.repeatId = transport.scheduleRepeat((time) => {
      const pattern = this.pattern;
      const step = this.stepCounter % pattern.length;
      this.stepCounter += 1;
      for (const track of pattern.tracks) this.triggerTrack(track, step, time);
      Tone.getDraw().schedule(() => this.emitStep(step), time);
    }, "16n");
  }

  private triggerTrack(track: Track, step: number, time: number): void {
    if (track.muted) return;
    const strip = this.strips.get(track.id);
    if (!strip) return;
    if (track.kind === "drum") {
      if (track.steps[step]) strip.voice.trigger(time, null);
    } else {
      const note = track.steps[step];
      if (note !== null && note !== undefined) strip.voice.trigger(time, note);
    }
  }

  private applyPattern(pattern: Pattern): void {
    const Tone = this.tone;
    if (!Tone) return;
    const transport = Tone.getTransport();
    transport.bpm.value = pattern.bpm;
    transport.swing = pattern.swing;
    for (const track of pattern.tracks) {
      const strip = this.strips.get(track.id);
      if (!strip) continue;
      strip.channel.mute = track.muted;
      // Short ramps avoid clicks when a knob moves during playback.
      strip.reverbSend.gain.rampTo(track.sends.reverb, 0.02);
      strip.delaySend.gain.rampTo(track.sends.delay, 0.02);
    }
  }

  private emitStep(step: number): void {
    for (const listener of this.stepListeners) listener(step);
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    for (const listener of this.playingListeners) listener(playing);
  }

  // iOS suspends audio in background tabs; stop cleanly instead of resuming
  // mid-bar with stuck notes.
  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden" && this.playing) this.stop();
  };
}

// Newer Safari: play through the iPhone silent switch like a music app.
// Feature-detected: the Audio Session API is not available everywhere yet.
function preferPlaybackAudioSession(): void {
  if (typeof navigator === "undefined") return;
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  if (session) session.type = "playback";
}
