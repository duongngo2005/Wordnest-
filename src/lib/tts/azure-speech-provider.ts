import { getAzureSpeechVoiceId } from "./azure-voice-catalog";
import type { TtsProvider } from "./tts-service";
import type { CloudTtsVoiceId } from "./voice-catalog";

type AzureSpeechProviderOptions = {
  key: string;
  region: string;
  fetcher?: typeof fetch;
};

export class CloudTtsUnavailableError extends Error {
  constructor() {
    super("Cloud speech is not configured");
    this.name = "CloudTtsUnavailableError";
  }
}

export class CloudTtsSynthesisError extends Error {
  constructor(status: number) {
    super("Cloud speech synthesis failed");
    this.name = "CloudTtsSynthesisError";
    this.status = status;
  }

  readonly status: number;
}

/** Azure Speech REST implementation of the small server-only provider contract. */
export class AzureSpeechProvider implements TtsProvider {
  private readonly key: string;
  private readonly region: string;
  private readonly fetcher: typeof fetch;

  constructor({ key, region, fetcher = fetch }: AzureSpeechProviderOptions) {
    this.key = key.trim();
    this.region = region.trim().toLowerCase();
    this.fetcher = fetcher;
  }

  isAvailable(): boolean {
    return Boolean(this.key && /^[a-z0-9-]+$/.test(this.region));
  }

  async synthesize({
    text,
    voice,
  }: Parameters<TtsProvider["synthesize"]>[0]): Promise<ArrayBuffer> {
    if (!this.isAvailable()) throw new CloudTtsUnavailableError();

    const response = await this.fetcher(this.getSynthesisUrl(), {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3",
        "User-Agent": "WordNest/1.0",
      },
      body: buildAzureSpeechSsml(text, voice.id),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[TTS] Azure Speech synthesis failed with status", response.status);
      throw new CloudTtsSynthesisError(response.status);
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) throw new CloudTtsSynthesisError(response.status);
    return audio;
  }

  private getSynthesisUrl(): string {
    return `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }
}

export function buildAzureSpeechSsml(text: string, voiceId: CloudTtsVoiceId): string {
  const providerVoiceId = getAzureSpeechVoiceId(voiceId);
  const locale = providerVoiceId.startsWith("en-GB") ? "en-GB" : "en-US";

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${providerVoiceId}">${escapeXml(text)}</voice></speak>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
