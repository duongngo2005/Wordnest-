import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TtsService, type TtsProvider } from "./tts-service";

const AUDIO = new Uint8Array([73, 68, 51, 4]).buffer;

describe("TtsService", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("caches normalized text and never synthesizes the same voice twice", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wordnest-tts-"));
    directories.push(directory);
    const provider: TtsProvider = { synthesize: async () => AUDIO };
    const synthesize = vi.fn(provider.synthesize);
    const service = new TtsService({
      provider: { synthesize },
      cacheDirectory: directory,
      providerVersion: "azure-speech-hd-v1",
    });

    await expect(service.synthesize({ text: " Small steps ", voiceId: "wordnest:ava" })).resolves.toEqual(AUDIO);
    await expect(service.synthesize({ text: "Small   steps", voiceId: "wordnest:ava" })).resolves.toEqual(AUDIO);

    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith({
      text: "Small steps",
      voice: expect.objectContaining({ id: "wordnest:ava" }),
    });
  });

  it("deduplicates concurrent synthesis for the same text and selected voice", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wordnest-tts-"));
    directories.push(directory);
    let resolveSynthesis: ((audio: ArrayBuffer) => void) | undefined;
    const synthesis = new Promise<ArrayBuffer>((resolve) => {
      resolveSynthesis = resolve;
    });
    const synthesize = vi.fn(async () => synthesis);
    const service = new TtsService({
      provider: { synthesize },
      cacheDirectory: directory,
      providerVersion: "azure-speech-hd-v1",
    });

    const first = service.synthesize({ text: "cache me", voiceId: "wordnest:emma" });
    const second = service.synthesize({ text: "cache me", voiceId: "wordnest:emma" });
    resolveSynthesis?.(AUDIO);

    await expect(Promise.all([first, second])).resolves.toEqual([AUDIO, AUDIO]);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });
});
