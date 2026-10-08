import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { getAudioRecorderCapability, useAudioRecorder } from "./useAudioRecorder";

function requireHookResult<T>(result: T | null): T {
  if (result === null) throw new Error("Hook result was not captured during render");
  return result;
}

describe("Speech & Audio Recorder Hooks Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("useSpeechRecognition", () => {
    it("reports isSupported=false and calls onError when SpeechRecognition is not available", () => {
      let hookResult: ReturnType<typeof useSpeechRecognition> | null = null;
      let reportedError: string | null = null;

      function TestComp() {
        hookResult = useSpeechRecognition({
          onError: (err) => {
            reportedError = err;
          },
        });
        return null;
      }

      renderToStaticMarkup(React.createElement(TestComp));

      const result = requireHookResult<ReturnType<typeof useSpeechRecognition>>(hookResult);
      expect(result.isSupported).toBe(false);
      expect(result.isListening).toBe(false);

      // Calling startListening in unsupported environment triggers onError callback
      result.startListening();
      expect(reportedError).toBe("UNSUPPORTED");
    });
  });

  describe("useAudioRecorder", () => {
    it("reports isRecording=false initially", () => {
      let hookResult: ReturnType<typeof useAudioRecorder> | null = null;

      function TestComp() {
        hookResult = useAudioRecorder();
        return null;
      }

      renderToStaticMarkup(React.createElement(TestComp));

      const result = requireHookResult<ReturnType<typeof useAudioRecorder>>(hookResult);
      expect(result.isRecording).toBe(false);
      expect(result.audioUrl).toBeNull();
      expect(result.error).toBeNull();
    });

    it("reports a controlled unsupported state when MediaRecorder is absent", () => {
      vi.stubGlobal("window", { MediaRecorder: undefined });
      vi.stubGlobal("navigator", {
        mediaDevices: { getUserMedia: vi.fn() },
      });

      expect(getAudioRecorderCapability()).toEqual({
        isSupported: false,
        error: "Trình duyệt này không hỗ trợ lưu bản ghi âm.",
      });

      vi.unstubAllGlobals();
    });
  });
});
