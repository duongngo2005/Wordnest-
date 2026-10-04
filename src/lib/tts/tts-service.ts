import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getCloudTtsVoice,
  normalizeTtsText,
  type CloudTtsVoice,
  type CloudTtsVoiceId,
} from "./voice-catalog";

export type TtsProvider = {
  synthesize(input: { text: string; voice: CloudTtsVoice }): Promise<ArrayBuffer>;
};

type TtsSynthesisRequest = {
  text: string;
  voiceId: CloudTtsVoiceId;
};

export type TtsNarrationRequest = {
  voiceId: CloudTtsVoiceId;
  chunks: readonly string[];
};

type TtsServiceOptions = {
  provider: TtsProvider;
  cacheDirectory: string;
  providerVersion: string;
};

/**
 * A deliberately small local-TTS boundary: provider synthesis plus a durable
 * file cache. The host is a self-hosted WordNest instance, so local storage is
 * the least operationally expensive persistent cache.
 */
export class TtsService {
  private readonly inFlightSynthesis = new Map<string, Promise<ArrayBuffer>>();

  constructor(private readonly options: TtsServiceOptions) {}

  async synthesize(request: TtsSynthesisRequest): Promise<ArrayBuffer> {
    const voice = getCloudTtsVoice(request.voiceId);
    if (!voice) throw new Error("Unsupported Kokoro voice");

    const text = normalizeTtsText(request.text);
    if (!text) throw new Error("Text is required");

    const cachePath = this.getCachePath({ text, voiceId: voice.id });
    const cachedAudio = await this.readCachedAudio(cachePath);
    if (cachedAudio) return cachedAudio;

    const existingSynthesis = this.inFlightSynthesis.get(cachePath);
    if (existingSynthesis) return existingSynthesis;

    const synthesis = this.synthesizeAndCache({ text, voice, cachePath });
    this.inFlightSynthesis.set(cachePath, synthesis);

    try {
      return await synthesis;
    } finally {
      this.inFlightSynthesis.delete(cachePath);
    }
  }

  /**
   * Materializes every chunk before a Story is marked narration-ready. Audio is
   * still stored through the existing text/voice cache, rather than copied into
   * a second Story-specific cache.
   */
  async synthesizeNarration({ voiceId, chunks }: TtsNarrationRequest): Promise<void> {
    for (const text of chunks) {
      await this.synthesize({ text, voiceId });
    }
  }

  /** Deletes only the cache entries derived from this Story's final text. */
  async removeNarration({ voiceId, chunks }: TtsNarrationRequest): Promise<void> {
    for (const rawText of chunks) {
      const text = normalizeTtsText(rawText);
      if (!text) continue;
      const cachePath = this.getCachePath({ text, voiceId });
      try {
        await unlink(cachePath);
      } catch (error) {
        if (!isFileNotFoundError(error)) throw error;
      }
    }
  }

  private async synthesizeAndCache({
    text,
    voice,
    cachePath,
  }: {
    text: string;
    voice: CloudTtsVoice;
    cachePath: string;
  }): Promise<ArrayBuffer> {
    const audio = await this.options.provider.synthesize({ text, voice });
    if (audio.byteLength === 0) throw new Error("Kokoro returned empty audio");

    try {
      await mkdir(this.options.cacheDirectory, { recursive: true });
      await writeFile(cachePath, Buffer.from(audio));
    } catch (error) {
      console.warn("[TTS] Could not persist audio cache:", error);
    }

    return audio;
  }

  private getCachePath({ text, voiceId }: { text: string; voiceId: CloudTtsVoiceId }): string {
    const cacheKey = `${this.options.providerVersion}:${voiceId}:${text}`;
    const filename = createHash("sha256").update(cacheKey).digest("hex");
    return join(this.options.cacheDirectory, `${filename}.mp3`);
  }

  private async readCachedAudio(cachePath: string): Promise<ArrayBuffer | null> {
    try {
      const audio = await readFile(cachePath);
      if (audio.byteLength > 0) {
        return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
      }
      await unlink(cachePath);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        console.warn("[TTS] Could not read audio cache:", error);
      }
    }
    return null;
  }
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
