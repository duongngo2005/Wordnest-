import { getKokoroVoiceId } from "./kokoro-voice-catalog";
import type { TtsProvider } from "./tts-service";

type KokoroSpeechProviderOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
};

export class KokoroTtsUnavailableError extends Error {
  constructor() {
    super("Kokoro TTS is not configured");
    this.name = "KokoroTtsUnavailableError";
  }
}

export class KokoroTtsSynthesisError extends Error {
  constructor(public readonly status: number, cause?: unknown) {
    super("Kokoro TTS synthesis failed", cause === undefined ? undefined : { cause });
    this.name = "KokoroTtsSynthesisError";
  }
}

/** Local Kokoro client for its OpenAI-compatible `/v1/audio/speech` API. */
export class KokoroSpeechProvider implements TtsProvider {
  private readonly endpoint: string | null;
  private readonly fetcher: typeof fetch;

  constructor({ baseUrl, fetcher = fetch }: KokoroSpeechProviderOptions) {
    this.endpoint = getKokoroSpeechEndpoint(baseUrl);
    this.fetcher = fetcher;
  }

  isAvailable(): boolean {
    return this.endpoint !== null;
  }

  async synthesize({ text, voice }: Parameters<TtsProvider["synthesize"]>[0]): Promise<ArrayBuffer> {
    if (!this.endpoint) throw new KokoroTtsUnavailableError();

    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          input: text,
          voice: getKokoroVoiceId(voice.id),
          response_format: "mp3",
        }),
        cache: "no-store",
      });
    } catch (error) {
      throw new KokoroTtsSynthesisError(503, error);
    }

    if (!response.ok) {
      throw new KokoroTtsSynthesisError(response.status);
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) throw new KokoroTtsSynthesisError(response.status);
    return audio;
  }
}

function getKokoroSpeechEndpoint(baseUrl: string): string | null {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) return null;

  try {
    return new URL("/v1/audio/speech", `${normalizedBaseUrl}/`).toString();
  } catch {
    return null;
  }
}
