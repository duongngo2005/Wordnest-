import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useAudioRecorder } from "./useAudioRecorder";

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

      expect(hookResult).toBeDefined();
      expect(hookResult?.isSupported).toBe(false);
      expect(hookResult?.isListening).toBe(false);

      // Calling startListening in unsupported environment triggers onError callback
      hookResult?.startListening();
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

      expect(hookResult).toBeDefined();
      expect(hookResult?.isRecording).toBe(false);
      expect(hookResult?.audioUrl).toBeNull();
      expect(hookResult?.error).toBeNull();
    });
  });
});
