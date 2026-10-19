// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  connectEngine,
  createSequencerStore,
  type SequencerEngine,
} from "./sequencer";

function fakeEngine() {
  const stepListeners = new Set<(step: number) => void>();
  const playingListeners = new Set<(playing: boolean) => void>();
  const engine = {
    init: vi.fn(async () => {}),
    play: vi.fn(async () => {
      playingListeners.forEach((l) => l(true));
    }),
    stop: vi.fn(() => {
      playingListeners.forEach((l) => l(false));
    }),
    setPattern: vi.fn(),
    onStep: (l: (step: number) => void) => {
      stepListeners.add(l);
      return () => stepListeners.delete(l);
    },
    onPlayingChange: (l: (playing: boolean) => void) => {
      playingListeners.add(l);
      return () => playingListeners.delete(l);
    },
  } satisfies SequencerEngine;
  const emitStep = (step: number) => stepListeners.forEach((l) => l(step));
  return { engine, emitStep };
}

describe("sequencer store", () => {
  test("dispatch updates the pattern and forwards it to the engine", () => {
    const { engine } = fakeEngine();
    const store = createSequencerStore({ engine });
    connectEngine(store, engine);
    store.getState().dispatch({ type: "toggleStep", track: "kick", step: 0 });
    const pattern = store.getState().pattern;
    expect(pattern.tracks[0].steps[0]).toBe(true);
    expect(engine.setPattern).toHaveBeenLastCalledWith(pattern);
  });

  test("mirrors engine playback state and current step", async () => {
    const { engine, emitStep } = fakeEngine();
    const store = createSequencerStore({ engine });
    connectEngine(store, engine);

    await store.getState().togglePlay();
    expect(engine.play).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({
      isPlaying: true,
      engineStatus: "ready",
    });

    emitStep(5);
    expect(store.getState().currentStep).toBe(5);

    await store.getState().togglePlay();
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({
      isPlaying: false,
      currentStep: -1,
    });
  });

  test("reports an error status when audio fails to start", async () => {
    const { engine } = fakeEngine();
    engine.play.mockRejectedValueOnce(new Error("blocked"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createSequencerStore({ engine });
    connectEngine(store, engine);
    await store.getState().play();
    expect(store.getState().engineStatus).toBe("error");
  });

  test("disconnect stops listening to the engine", () => {
    const { engine, emitStep } = fakeEngine();
    const store = createSequencerStore({ engine });
    const disconnect = connectEngine(store, engine);
    disconnect();
    emitStep(3);
    expect(store.getState().currentStep).toBe(-1);
  });
});
