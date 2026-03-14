export type GameEngine = "canvas2d" | "threejs";

export function getEngineLabel(engine: GameEngine): string {
  return engine === "threejs" ? "Three.js / WebGL" : "HTML5 Canvas";
}
