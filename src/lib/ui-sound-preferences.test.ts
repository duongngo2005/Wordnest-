import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_UI_SOUND_PREFERENCES,
  getUISoundPreferences,
  parseUISoundPreferences,
  saveUISoundPreferences,
  subscribeToUISoundPreferences,
  UI_SOUND_STORAGE_KEY,
} from "./ui-sound-preferences";

describe("ui-sound-preferences", () => {
  describe("parseUISoundPreferences", () => {
    it("returns default preferences when input is null or empty", () => {
      expect(parseUISoundPreferences(null)).toEqual(DEFAULT_UI_SOUND_PREFERENCES);
      expect(parseUISoundPreferences("")).toEqual(DEFAULT_UI_SOUND_PREFERENCES);
    });

    it("parses valid JSON preferences", () => {
      expect(parseUISoundPreferences(JSON.stringify({ enabled: false, volume: 0.15 }))).toEqual({
        enabled: false,
        volume: 0.15,
      });
    });

    it("falls back to default values for missing or invalid properties", () => {
      expect(parseUISoundPreferences(JSON.stringify({ enabled: "not-bool", volume: 5 }))).toEqual(
        DEFAULT_UI_SOUND_PREFERENCES
      );
      expect(parseUISoundPreferences("{ corrupted json")).toEqual(DEFAULT_UI_SOUND_PREFERENCES);
    });
  });

  describe("window storage and subscriptions", () => {
    let mockStorage: Record<string, string> = {};
    let listeners: Record<string, ((event: unknown) => void)[]> = {};

    beforeEach(() => {
      mockStorage = {};
      listeners = {};

      const mockWindow = {
        localStorage: {
          getItem: (key: string) => mockStorage[key] ?? null,
          setItem: (key: string, value: string) => {
            mockStorage[key] = value;
          },
          removeItem: (key: string) => {
            delete mockStorage[key];
          },
          clear: () => {
            mockStorage = {};
          },
        },
        addEventListener: (event: string, handler: (e: unknown) => void) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(handler);
        },
        removeEventListener: (event: string, handler: (e: unknown) => void) => {
          if (!listeners[event]) return;
          listeners[event] = listeners[event].filter((h) => h !== handler);
        },
        dispatchEvent: (event: { type: string }) => {
          (listeners[event.type] || []).forEach((handler) => handler(event));
          return true;
        },
      };

      vi.stubGlobal("window", mockWindow);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("persists preferences and notifies subscribers", () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribeToUISoundPreferences(subscriber);

      saveUISoundPreferences({ enabled: false, volume: 0.3 });
      expect(getUISoundPreferences()).toEqual({ enabled: false, volume: 0.3 });
      expect(mockStorage[UI_SOUND_STORAGE_KEY]).toBe(
        JSON.stringify({ enabled: false, volume: 0.3 })
      );
      expect(subscriber).toHaveBeenCalledTimes(1);

      unsubscribe();
      saveUISoundPreferences({ enabled: true, volume: 0.2 });
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });
});
