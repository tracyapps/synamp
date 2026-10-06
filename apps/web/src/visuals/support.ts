/** WebGL 2 and Web Audio: what the MilkDrop visuals need. Kept apart so the check doesn't load them. */
export function visualsSupported(): boolean {
  try { return !!document.createElement("canvas").getContext("webgl2") && typeof AudioContext !== "undefined"; } catch { return false; }
}
