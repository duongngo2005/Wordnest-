import { join } from "node:path";
import { env } from "@/lib/env";
import { AzureSpeechProvider } from "./azure-speech-provider";
import { KokoroSpeechProvider } from "./kokoro-speech-provider";
import { TtsService, type TtsProvider } from "./tts-service";

const azureSpeechProvider = new AzureSpeechProvider({
  key: env.AZURE_SPEECH_KEY,
  region: env.AZURE_SPEECH_REGION,
});
const kokoroSpeechProvider = new KokoroSpeechProvider({ baseUrl: env.KOKORO_TTS_BASE_URL });

type AvailableTtsProvider = TtsProvider & { isAvailable(): boolean };

const selectedProvider = getSelectedTtsProvider({
  selectedName: env.TTS_PROVIDER,
  azure: azureSpeechProvider,
  kokoro: kokoroSpeechProvider,
});

const cacheDirectory = env.TTS_CACHE_DIR || join(process.cwd(), ".wordnest-cache", "tts");
const ttsService = new TtsService({
  provider: selectedProvider,
  cacheDirectory,
  providerVersion: selectedProvider === kokoroSpeechProvider ? "kokoro-v1" : "azure-speech-hd-v1",
});

export type CloudTtsService = Pick<TtsService, "synthesize">;

export function isCloudTtsAvailable(): boolean {
  return selectedProvider.isAvailable();
}

export function getTtsService(): CloudTtsService {
  return ttsService;
}

function getSelectedTtsProvider({
  selectedName,
  azure,
  kokoro,
}: {
  selectedName: "auto" | "azure" | "kokoro";
  azure: AvailableTtsProvider;
  kokoro: AvailableTtsProvider;
}): AvailableTtsProvider {
  if (selectedName === "kokoro") return kokoro;
  if (selectedName === "azure") return azure;
  return kokoro.isAvailable() ? kokoro : azure;
}
