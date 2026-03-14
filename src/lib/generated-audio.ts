export type GeneratedAudioKind = "sfx" | "music";

export function getGeneratedAudioId(kind: GeneratedAudioKind, name: string): string {
  return `${kind}:${name}`;
}
