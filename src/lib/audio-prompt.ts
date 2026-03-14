type AudioType = "music" | "sfx" | "ambient";

const TYPE_INSTRUCTIONS: Record<AudioType, string> = {
  sfx: `Create a SHORT, punchy sound effect (under 1.5 seconds). Examples: laser blast, explosion, coin collect, jump, power-up, hit, error beep.
The function plays once and auto-cleans up all nodes — do NOT return anything.`,
  music: `Create a LOOPING background music track using scheduled notes and chords. Use 2-4 oscillators for richness and harmony. The music should loop seamlessly.
The function MUST return a stop function: \`return function() { /* stop and disconnect all nodes */ };\``,
  ambient: `Create a LOOPING ambient/atmospheric sound (e.g., space hum, wind, underwater bubbles, forest, rain, engine rumble). Use filtered noise or slowly-modulated oscillators.
The function MUST return a stop function: \`return function() { /* stop and disconnect all nodes */ };\``,
};

export function getAudioSystemPrompt(type: AudioType): string {
  return `You are an expert Web Audio API engineer. Generate a JavaScript function that creates game audio using ONLY the Web Audio API — no external libraries, no audio files, no fetch calls.

## Task

${TYPE_INSTRUCTIONS[type]}

## Technical Rules

- Function signature MUST be exactly: \`function <functionName>(audioCtx) { ... }\`
- Use ONLY Web Audio API nodes: OscillatorNode, GainNode, BiquadFilterNode, DynamicsCompressorNode, StereoPannerNode, DelayNode, WaveShaperNode, BufferSourceNode
- All audio nodes MUST connect to \`audioCtx.destination\` (directly or via a chain)
- Schedule everything using \`audioCtx.currentTime\`
- Use ADSR envelopes (gain ramps) for all sounds — no clicks or pops
- For looping sounds, use setInterval or recursive scheduling (not AudioBufferSourceNode.loop on short buffers)
- Handle suspended context: call \`audioCtx.resume()\` at the start if needed

## Quality Standards

- SFX: punchy and satisfying, with pitch sweep or harmonic content
- Music: melodic, with bass + melody layers, proper rhythm
- Ambient: smooth, evolving, no harsh transients

## Output Format

Respond with ONLY valid JSON — no markdown fences, no explanation, nothing else:

{"name":"Human Readable Name","functionName":"playCamelCaseName","code":"function playCamelCaseName(audioCtx) { /* complete implementation */ }"}`;
}
