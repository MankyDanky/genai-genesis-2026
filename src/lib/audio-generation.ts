import { generateMusicTrackDataUrl, generateSoundEffectDataUrl } from "@/lib/elevenlabs";
import { soundStore, soundGenerationInflight, soundPromptCache, promptCacheKey, type StoredSound } from "@/lib/sound-store";

export function startAudioGeneration(id: string, sound: StoredSound) {
  if (soundGenerationInflight.has(id)) return;

  // If an identical prompt was already generated successfully, reuse it
  const cacheKey = promptCacheKey(sound.kind, sound.prompt, sound.duration);
  const cachedId = soundPromptCache.get(cacheKey);
  if (cachedId && cachedId !== id) {
    const cached = soundStore.get(cachedId);
    if (cached?.status === "ready" && cached.dataUrl) {
      console.log(`[Audio] reusing cached result for ${id} from ${cachedId}`);
      soundStore.set(id, { ...sound, dataUrl: cached.dataUrl, status: "ready" });
      return;
    }
  }

  const generationCreatedAt = sound.createdAt;

  const startedAt = Date.now();
  console.log(`[Audio] starting ${sound.kind} generation: ${id}`);

  const generation = (async () => {
    try {
      const dataUrl =
        sound.kind === "music"
          ? await generateMusicTrackDataUrl(sound.prompt, sound.duration)
          : await generateSoundEffectDataUrl(sound.prompt, sound.duration);

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const latestSound = soundStore.get(id);
      if (!latestSound || latestSound.createdAt !== generationCreatedAt) {
        console.warn(`[Audio] stale result discarded for ${id} after ${elapsed}s`);
        return;
      }

      soundStore.set(id, { ...latestSound, dataUrl, status: "ready", error: undefined });
      soundPromptCache.set(cacheKey, id);
      console.log(`[Audio] completed ${id} in ${elapsed}s`);
    } catch (error) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const latestSound = soundStore.get(id);
      if (!latestSound || latestSound.createdAt !== generationCreatedAt) return;

      const message = error instanceof Error ? error.message : "Audio generation failed";
      console.error(`[Audio] failed ${id} after ${elapsed}s:`, message);
      soundStore.set(id, { ...latestSound, status: "error", error: message });
    } finally {
      soundGenerationInflight.delete(id);
    }
  })();

  soundGenerationInflight.set(id, generation);
}
