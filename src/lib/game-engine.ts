export type GameEngine = "canvas2d" | "threejs" | "phaser";

const ENGINE_LABELS: Record<GameEngine, string> = {
  canvas2d: "HTML5 Canvas",
  threejs: "Three.js / WebGL",
  phaser: "Phaser.js",
};

export function getEngineLabel(engine: GameEngine): string {
  return ENGINE_LABELS[engine];
}
