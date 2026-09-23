import { NextRequest, NextResponse } from "next/server";

// In-memory cache for common short phrases to avoid redundant external network calls
const audioCache = new Map<string, { buffer: ArrayBuffer; contentType: string }>();
const MAX_CACHE_ENTRIES = 500;
const SUPPORTED_TTS_VOICES = new Set(["en-US", "en-GB", "en-AU", "en-IN"]);

export async function GET(req: NextRequest) {
  try {
    const text = req.nextUrl.searchParams.get("text")?.trim();
    if (!text) {
      return NextResponse.json({ error: "Missing 'text' parameter" }, { status: 400 });
    }

    if (text.length > 300) {
      return NextResponse.json({ error: "Text too long (max 300 chars)" }, { status: 400 });
    }

    const requestedVoice = req.nextUrl.searchParams.get("voice") ?? "en-US";
    if (!SUPPORTED_TTS_VOICES.has(requestedVoice)) {
      return NextResponse.json({ error: "Unsupported voice" }, { status: 400 });
    }

    const cacheKey = `${requestedVoice}:${text.toLowerCase()}`;
    const cached = audioCache.get(cacheKey);
    if (cached) {
      return new NextResponse(cached.buffer, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        },
      });
    }

    // 1. First attempt: Google Translate TTS via server-side fetch (no browser Referer)
    try {
      const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${requestedVoice}&client=tw-ob&q=${encodeURIComponent(
        text
      )}`;

      const ttsResponse = await fetch(googleTtsUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "audio/mpeg, audio/*;q=0.9",
        },
      });

      if (ttsResponse.ok) {
        const buffer = await ttsResponse.arrayBuffer();
        if (buffer.byteLength > 200) {
          const contentType = ttsResponse.headers.get("content-type") || "audio/mpeg";

          if (audioCache.size < MAX_CACHE_ENTRIES) {
            audioCache.set(cacheKey, { buffer, contentType });
          }

          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
            },
          });
        }
      }
    } catch (googleError) {
      console.warn("[TTS API] Google TTS fetch failed, attempting dictionary audio fallback:", googleError);
    }

    // 2. Second attempt: For single words / short phrases, try Free Dictionary API audio
    const singleWord = text.split(/\s+/)[0];
    if (singleWord) {
      try {
        const dictRes = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(singleWord)}`,
          { headers: { Accept: "application/json" } }
        );

        if (dictRes.ok) {
          const entries = (await dictRes.json()) as Array<{
            phonetics?: Array<{ audio?: string }>;
          }>;

          let audioUrl: string | undefined;
          for (const entry of entries) {
            const phon = entry.phonetics?.find((p) => p.audio && p.audio.startsWith("http"));
            if (phon?.audio) {
              audioUrl = phon.audio;
              break;
            }
          }

          if (audioUrl) {
            const dictAudioRes = await fetch(audioUrl);
            if (dictAudioRes.ok) {
              const buffer = await dictAudioRes.arrayBuffer();
              const contentType = dictAudioRes.headers.get("content-type") || "audio/mpeg";

              if (audioCache.size < MAX_CACHE_ENTRIES) {
                audioCache.set(cacheKey, { buffer, contentType });
              }

              return new NextResponse(buffer, {
                status: 200,
                headers: {
                  "Content-Type": contentType,
                  "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
                },
              });
            }
          }
        }
      } catch (dictError) {
        console.warn("[TTS API] Dictionary audio fallback failed:", dictError);
      }
    }

    return NextResponse.json({ error: "Failed to generate speech audio" }, { status: 502 });
  } catch (error) {
    console.error("[TTS API] Internal error:", error);
    return NextResponse.json({ error: "Internal audio processing error" }, { status: 500 });
  }
}
