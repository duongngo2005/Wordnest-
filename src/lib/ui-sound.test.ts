import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { playUISound, type UISoundType } from "./ui-sound";
import { saveUISoundPreferences } from "./ui-sound-preferences";

describe("ui-sound engine", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not play or attempt AudioContext creation when sound is disabled", () => {
    const createOscillatorMock = vi.fn();
    const MockAudioContext = vi.fn().mockImplementation(() => ({
      state: "running",
      currentTime: 0,
      destination: {},
      createGain: vi.fn(),
      createOscillator: createOscillatorMock,
    }));

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => {
          mockStorage[key] = value;
        },
      },
      dispatchEvent: vi.fn(),
      AudioContext: MockAudioContext,
    });

    saveUISoundPreferences({ enabled: false, volume: 0.2 });

    playUISound("softTap");
    expect(MockAudioContext).not.toHaveBeenCalled();
    expect(createOscillatorMock).not.toHaveBeenCalled();
  });

  it("safely handles missing AudioContext without throwing", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => {
          mockStorage[key] = value;
        },
      },
      dispatchEvent: vi.fn(),
      AudioContext: undefined,
      webkitAudioContext: undefined,
    });

    saveUISoundPreferences({ enabled: true, volume: 0.2 });

    expect(() => {
      playUISound("softTap");
      playUISound("paperFlip");
      playUISound("success");
      playUISound("completion");
      playUISound("error");
    }).not.toThrow();
  });

  it("plays all sound types without throwing when AudioContext is supported", () => {
    const stopMock = vi.fn();
    const startMock = vi.fn();
    const connectMock = vi.fn();
    const disconnectMock = vi.fn();

    const mockGainNode = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: connectMock,
      disconnect: disconnectMock,
    };

    const mockOscillatorNode = {
      type: "sine",
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: connectMock,
      disconnect: disconnectMock,
      start: startMock,
      stop: stopMock,
    };

    const mockBufferSource = {
      buffer: null,
      connect: connectMock,
      disconnect: disconnectMock,
      start: startMock,
      stop: stopMock,
    };

    const mockFilter = {
      type: "bandpass",
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      Q: { setValueAtTime: vi.fn() },
      connect: connectMock,
      disconnect: disconnectMock,
    };

    const MockAudioContext = vi.fn().mockImplementation(() => ({
      state: "running",
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createGain: vi.fn().mockReturnValue(mockGainNode),
      createOscillator: vi.fn().mockReturnValue(mockOscillatorNode),
      createBufferSource: vi.fn().mockReturnValue(mockBufferSource),
      createBiquadFilter: vi.fn().mockReturnValue(mockFilter),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(100)),
      }),
    }));

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => {
          mockStorage[key] = value;
        },
      },
      dispatchEvent: vi.fn(),
      AudioContext: MockAudioContext,
    });

    saveUISoundPreferences({ enabled: true, volume: 0.2 });

    const sounds: UISoundType[] = ["softTap", "paperFlip", "success", "completion", "error"];
    sounds.forEach((sound) => {
      expect(() => playUISound(sound)).not.toThrow();
    });
  });
});
