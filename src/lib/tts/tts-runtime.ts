import { join } from "node:path";
import { env } from "@/lib/env";
import { KokoroSpeechProvider } from "./kokoro-speech-provider";
import { TtsService } from "./tts-service";

const kokoroSpeechProvider = new KokoroSpeechProvider({ baseUrl: env.KOKORO_TTS_BASE_URL });

const cacheDirectory = env.TTS_CACHE_DIR || join(process.cwd(), ".wordnest-cache", "tts");
const ttsService = new TtsService({
  provider: kokoroSpeechProvider,
  cacheDirectory,
  providerVersion: "kokoro-v1",
});

export type CloudTtsService = Pick<TtsService, "synthesize">;
export type CloudNarrationTtsService = Pick<TtsService, "synthesizeNarration" | "removeNarration">;

export function isCloudTtsAvailable(): boolean {
  return kokoroSpeechProvider.isAvailable();
}

export function getTtsService(): CloudTtsService {
  return ttsService;
}

export function getNarrationTtsService(): CloudNarrationTtsService {
  return ttsService;
}
