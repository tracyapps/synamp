/**
 * WebGL 2 and Web Audio: what the MilkDrop visuals need. Checked without
 * making a WebGL context (that costs memory on every page load); if one can't
 * be made later, the visuals say so when you start them.
 */
export function visualsSupported(): boolean {
  return typeof window !== "undefined" && "WebGL2RenderingContext" in window && typeof AudioContext !== "undefined";
}
