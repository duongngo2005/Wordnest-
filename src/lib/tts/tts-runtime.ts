import { join } from "node:path";
import { env } from "@/lib/env";
import { AzureSpeechProvider } from "./azure-speech-provider";
import { TtsService } from "./tts-service";

const azureSpeechProvider = new AzureSpeechProvider({
  key: env.AZURE_SPEECH_KEY,
  region: env.AZURE_SPEECH_REGION,
});

const cacheDirectory = env.TTS_CACHE_DIR || join(process.cwd(), ".wordnest-cache", "tts");
const ttsService = new TtsService({
  provider: azureSpeechProvider,
  cacheDirectory,
  providerVersion: "azure-speech-hd-v1",
});

export type CloudTtsService = Pick<TtsService, "synthesize">;

export function isCloudTtsAvailable(): boolean {
  return azureSpeechProvider.isAvailable();
}

export function getTtsService(): CloudTtsService {
  return ttsService;
}
