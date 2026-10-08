"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface UseAudioRecorderReturn {
  isSupported: boolean;
  hasCheckedSupport: boolean;
  isRecording: boolean;
  audioUrl: string | null;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  resetRecording: () => void;
}

export type AudioRecorderCapability = {
  isSupported: boolean;
  error: string | null;
};

type BrowserMediaRecorderConstructor = typeof MediaRecorder;

function getMediaRecorderConstructor(): BrowserMediaRecorderConstructor | null {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return null;
  }

  return window.MediaRecorder;
}

export function getAudioRecorderCapability(): AudioRecorderCapability {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      isSupported: false,
      error: "Trình duyệt này không hỗ trợ ghi âm microphone.",
    };
  }

  if (!getMediaRecorderConstructor()) {
    return {
      isSupported: false,
      error: "Trình duyệt này không hỗ trợ lưu bản ghi âm.",
    };
  }

  return { isSupported: true, error: null };
}

function getAudioRecorderCapabilityStatus(): "supported" | "unknown" | string {
  const capability = getAudioRecorderCapability();
  return capability.isSupported ? "supported" : capability.error || "unknown";
}

function subscribeToAudioRecorderCapability() {
  return () => {};
}

function getRecorderErrorMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
    return "WordNest chưa được phép dùng microphone. Hãy bật quyền microphone trong trình duyệt để luyện nói.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Không tìm thấy thiết bị microphone nào trên máy tính.";
  }
  if (error instanceof DOMException && error.name === "NotReadableError") {
    return "Microphone đang được ứng dụng khác sử dụng. Hãy thử lại sau.";
  }
  return error instanceof Error ? error.message : "Không thể truy cập microphone.";
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const capabilityStatus = useSyncExternalStore(
    subscribeToAudioRecorderCapability,
    getAudioRecorderCapabilityStatus,
    () => "unknown"
  );
  const isSupported = capabilityStatus === "supported";
  const hasCheckedSupport = capabilityStatus !== "unknown";
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

  const startRecording = useCallback(async (): Promise<boolean> => {
    resetRecording();

    const supported = getAudioRecorderCapability();
    if (!supported.isSupported) {
      setError(supported.error);
      return false;
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

      const MediaRecorderCtor = getMediaRecorderConstructor();
      if (!MediaRecorderCtor) {
        stopStreamTracks();
        setError("Trình duyệt này không hỗ trợ lưu bản ghi âm.");
        return false;
      }

      // Determine supported mimeType
      const isTypeSupported = MediaRecorderCtor.isTypeSupported?.bind(MediaRecorderCtor);
      const mimeType = isTypeSupported?.("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : isTypeSupported?.("audio/webm")
        ? "audio/webm"
        : isTypeSupported?.("audio/mp4")
        ? "audio/mp4"
        : "";

      const recorder = mimeType
        ? new MediaRecorderCtor(stream, { mimeType })
        : new MediaRecorderCtor(stream);
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
      return true;
    } catch (err: unknown) {
      stopStreamTracks();
      setIsRecording(false);
      setError(getRecorderErrorMessage(err));
      return false;
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
    isSupported,
    hasCheckedSupport,
    isRecording,
    audioUrl,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
