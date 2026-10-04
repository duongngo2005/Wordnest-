"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioUrl: string | null;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const currentAudioUrlRef = useRef<string | null>(null);

  // Revoke previous object URL safely
  const revokeCurrentUrl = useCallback(() => {
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
  }, []);

  // Stop and release media stream tracks
  const stopStreamTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
  }, []);

  const resetRecording = useCallback(() => {
    revokeCurrentUrl();
    stopStreamTracks();
    setAudioUrl(null);
    setAudioBlob(null);
    setError(null);
    setIsRecording(false);
    chunksRef.current = [];
  }, [revokeCurrentUrl, stopStreamTracks]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    stopStreamTracks();
    setIsRecording(false);
  }, [stopStreamTracks]);

  const startRecording = useCallback(async () => {
    resetRecording();

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt này không hỗ trợ ghi âm microphone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      chunksRef.current = [];

      // Determine supported mimeType
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];

        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          currentAudioUrlRef.current = url;
          setAudioBlob(blob);
          setAudioUrl(url);
        }

        stopStreamTracks();
        setIsRecording(false);
      };

      recorder.onerror = () => {
        setError("Đã xảy ra lỗi trong quá trình ghi âm.");
        stopStreamTracks();
        setIsRecording(false);
      };

      recorder.start(250); // Slice into 250ms chunks
      setIsRecording(true);
      setError(null);
    } catch (err: unknown) {
      stopStreamTracks();
      setIsRecording(false);

      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setError("WordNest chưa được phép dùng microphone. Hãy bật quyền microphone trong trình duyệt để luyện nói.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("Không tìm thấy thiết bị microphone nào trên máy tính.");
      } else {
        setError(err instanceof Error ? err.message : "Không thể truy cập microphone.");
      }
    }
  }, [resetRecording, stopStreamTracks]);

  // Cleanup all media resources and object URLs on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      stopStreamTracks();
      revokeCurrentUrl();
    };
  }, [stopStreamTracks, revokeCurrentUrl]);

  return {
    isRecording,
    audioUrl,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
