// Audio engine: owns Tone.js, the mixer and the step scheduler.
// Framework-agnostic — UI talks to it through the store or this small API.

import type * as ToneLib from "tone";
import { createVoices, type Voice } from "./instruments";
import { type Pattern, type Track, type TrackId } from "./pattern";

type Tone = typeof ToneLib;

export type EngineStatus = "idle" | "loading" | "ready" | "error";

type StepListener = (step: number) => void;
type PlayingListener = (isPlaying: boolean) => void;
type DebugListener = (line: string) => void;

/** Live engine state for the hidden diagnostics panel (?debug=audio). */
export type EngineDiagnostics = {
  contextState: string;
  contextTime: number;
  transportState: string;
  playing: boolean;
  contextsCreated: number;
};

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
  // Set when the page goes to the background; see onVisibilityChange.
  private contextStale = false;
  private stepListeners = new Set<StepListener>();
  private playingListeners = new Set<PlayingListener>();
  private debugListeners = new Set<DebugListener>();
  private contextsCreated = 0;

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
    this.debug("load: importing tone");
    const Tone = await import("tone");
    this.watchContext(Tone);
    this.debug(`load: resume… (context ${Tone.getContext().state})`);
    await Tone.start();
    this.tone = Tone;
    this.debug("load: resumed");
    this.buildGraph(Tone);
    this.applyPattern(this.pattern);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      window.addEventListener("pagehide", this.onPageLifecycle);
      window.addEventListener("pageshow", this.onPageLifecycle);
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
    // Both steps run synchronously inside the user gesture: browsers only
    // create or resume an audible AudioContext from a gesture.
    this.debug(`play: called${this.contextStale ? " (stale context)" : ""}`);
    if (this.contextStale) this.replaceContext();
    const resumed = this.tone?.start();
    await this.init();
    if (resumed) {
      this.debug("play: resume…");
      await resumed;
      this.debug("play: resumed");
    }
    const Tone = this.tone;
    if (!Tone) return;
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    this.stepCounter = 0;
    const startAt = atTime ?? Tone.now() + START_DELAY;
    transport.start(startAt);
    this.debug(`play: transport.start(${startAt.toFixed(3)})`);
    this.setPlaying(true);
  }

  stop(): void {
    if (!this.tone) return;
    this.tone.getTransport().stop();
    // Steps are queued for drawing slightly ahead; drop the pending ones so
    // the playhead does not reappear after Stop.
    this.tone.getDraw().cancel();
    this.setPlaying(false);
    this.debug("stop");
  }

  onStep(listener: StepListener): () => void {
    this.stepListeners.add(listener);
    return () => this.stepListeners.delete(listener);
  }

  onPlayingChange(listener: PlayingListener): () => void {
    this.playingListeners.add(listener);
    return () => this.playingListeners.delete(listener);
  }

  /** Timestamped log of audio lifecycle events, for on-device debugging. */
  onDebug(listener: DebugListener): () => void {
    this.debugListeners.add(listener);
    return () => this.debugListeners.delete(listener);
  }

  diagnostics(): EngineDiagnostics {
    const context = this.tone?.getContext();
    return {
      contextState: context?.rawContext.state ?? "none",
      contextTime: context?.currentTime ?? 0,
      transportState: this.tone?.getTransport().state ?? "none",
      playing: this.playing,
      contextsCreated: this.contextsCreated,
    };
  }

  /**
   * Releases all audio nodes and the scheduler. The engine can be used again
   * afterwards: the next play() rebuilds the graph.
   */
  dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.removeEventListener("pagehide", this.onPageLifecycle);
      window.removeEventListener("pageshow", this.onPageLifecycle);
    }
    this.stop();
    this.teardownGraph();
    this.tone = null;
    this.loading = null;
    this.contextStale = false;
  }

  // Swaps in a brand-new AudioContext and rebuilds the graph on it.
  private replaceContext(): void {
    this.contextStale = false;
    const Tone = this.tone;
    if (!Tone) return;
    this.teardownGraph();
    Tone.setContext(new Tone.Context(), true);
    this.watchContext(Tone);
    this.debug("replaceContext: new AudioContext");
    this.buildGraph(Tone);
    this.applyPattern(this.pattern);
  }

  private watchContext(Tone: Tone): void {
    this.contextsCreated += 1;
    const id = this.contextsCreated;
    Tone.getContext().on("statechange", (state) =>
      this.debug(`context #${id}: ${state}`),
    );
  }

  private debug(message: string): void {
    if (this.debugListeners.size === 0) return;
    const { contextState, contextTime } = this.diagnostics();
    const line = `${(performance.now() / 1000).toFixed(2)}s [${contextState} ${contextTime.toFixed(2)}] ${message}`;
    for (const listener of this.debugListeners) listener(line);
  }

  private teardownGraph(): void {
    if (this.tone && this.repeatId !== null) {
      this.tone.getTransport().clear(this.repeatId);
    }
    for (const { voice } of this.strips.values()) voice.dispose();
    for (const node of this.disposables) node.dispose();
    this.strips.clear();
    this.disposables = [];
    this.repeatId = null;
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
    if (!this.playing) return;
    for (const listener of this.stepListeners) listener(step);
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    for (const listener of this.playingListeners) listener(playing);
  }

  // Safari interrupts audio in background tabs and may never resume that
  // AudioContext (or resume it silent). Stop cleanly instead of continuing
  // mid-bar with stuck notes, and start the next Play on a fresh context.
  private onVisibilityChange = () => {
    this.debug(`visibility: ${document.visibilityState}`);
    if (document.visibilityState !== "hidden" || !this.tone) return;
    this.stop();
    this.contextStale = true;
  };

  private onPageLifecycle = (event: PageTransitionEvent) => {
    this.debug(`${event.type}${event.persisted ? " (bfcache)" : ""}`);
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
