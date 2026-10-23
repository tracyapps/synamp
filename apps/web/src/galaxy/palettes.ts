/*
 * Galaxy colour themes. The palette owns everything the canvas paints except
 * node positions: space, starlight, group hues, and the ramps for era/mood/
 * energy colouring. Node colours are always computed from these so a theme
 * switch is a redraw, never a re-layout.
 */
import type { ThemeId } from "./types";

export type Palette = {
  id: ThemeId; label: string;
  space: string;       // canvas background
  star: string;        // starfield dots
  nebula: string[];    // soft background blobs (drawn once, offscreen)
  ink: string;         // labels
  groups: string[];    // categorical group colours
  ramp: [string, string];   // era ramp (old → new)
  mood: [string, string];   // valence ramp (blue → gold)
  energy: [string, string]; // arousal ramp (calm → bright)
  accent: string;      // selection
};

export const PALETTES: Record<ThemeId, Palette> = {
  nebula: {
    id: "nebula", label: "Nebula", space: "#11162a", star: "#aeb9e6",
    nebula: ["#3b4a8f", "#7a5fb0", "#2f6f8f", "#8f6b3b"],
    ink: "#e8ebf8", groups: ["#ffd76a", "#7fb4ff", "#ff8f6b", "#8ee6c8", "#c9a6ff", "#ff9ecb", "#a8e57c", "#6bd5e8", "#f2b26b", "#9aa8ff", "#7ce0a5", "#ff7b7b", "#e8d28b", "#88c7ee"],
    ramp: ["#5a6fd4", "#ffd76a"], mood: ["#6b9bff", "#ffd76a"], energy: ["#7a5fb0", "#ff8f6b"], accent: "#ffcd00",
  },
  aurora: {
    id: "aurora", label: "Aurora", space: "#0c1a1c", star: "#9fd8cf",
    nebula: ["#177a6d", "#2c5f7c", "#3e8f7a", "#54483b"],
    ink: "#e2f2ee", groups: ["#5eead4", "#93c5fd", "#fca5a5", "#a7f3d0", "#c4b5fd", "#f9a8d4", "#bef264", "#67e8f9", "#fcd34d", "#a5b4fc", "#6ee7b7", "#fda4af", "#99f6e4", "#bfdbfe"],
    ramp: ["#155e75", "#fcd34d"], mood: ["#38bdf8", "#fcd34d"], energy: ["#312e81", "#fda4af"], accent: "#fcd34d",
  },
  spectrum: {
    id: "spectrum", label: "Spectrum", space: "#14121f", star: "#c9c2e6",
    nebula: ["#aa006c", "#5216b3", "#e86b14", "#00807a"],
    ink: "#f1eefb", groups: ["#f6004f", "#ff4a47", "#e86b14", "#ffcd00", "#defc1a", "#00e676", "#00e6e8", "#3b6bff", "#ab51ff", "#ff6e9e", "#8bff3d", "#ffd60e", "#ff9a3d", "#6cf0d0"],
    ramp: ["#5216b3", "#ffcd00"], mood: ["#3b6bff", "#ffcd00"], energy: ["#5216b3", "#f6004f"], accent: "#ffcd00",
  },
  embers: {
    id: "embers", label: "Embers", space: "#1a100c", star: "#e0b89a",
    nebula: ["#8f4a2f", "#6d5a3b", "#4f6d8f", "#8f6b3b"],
    ink: "#f7ecdf", groups: ["#ffb457", "#ff8f6b", "#e8c46b", "#d96c4a", "#f2d49b", "#c98850", "#ffe3a3", "#b5643f", "#ffd7a0", "#a8927c", "#f2a65a", "#e8b4b8", "#d4a02f", "#c97b5f"],
    ramp: ["#7c4a2d", "#ffd7a0"], mood: ["#8f9bb3", "#ffb457"], energy: ["#5f4a66", "#ff8f6b"], accent: "#ffb457",
  },
  ink: {
    id: "ink", label: "Ink", space: "#15151c", star: "#8f93a8",
    nebula: ["#3a3f55", "#2b2f44", "#4a4460", "#33394e"],
    ink: "#eceef6", groups: ["#ffcd00", "#d4d7e4", "#aeb2c6", "#8a8fa8", "#c4c8da", "#767b94", "#e4e7f2", "#626782", "#f2e39a", "#98a0bd", "#b8bccc", "#52576f", "#dfe2ee", "#888df7"],
    ramp: ["#5f6480", "#e8ebf8"], mood: ["#8a8fa8", "#ffcd00"], energy: ["#4a4f68", "#d4d7e4"], accent: "#ffcd00",
  },
};

const channel = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map(part => part + part).join("") : value;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
};
const hex = (rgb: [number, number, number]) => `#${rgb.map(part => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0")).join("")}`;

/** Position on a ramp of any number of stops; two stops is a plain lerp. */
export function rampColor(stops: string[], t: number): string {
  if (!stops.length) return "#888888";
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5));
  const span = (stops.length - 1) * clamped;
  const index = Math.min(stops.length - 2, Math.floor(span));
  const from = channel(stops[index]!); const to = channel(stops[index + 1]!);
  const mix = span - index;
  return hex([from[0]! + (to[0]! - from[0]!) * mix, from[1]! + (to[1]! - from[1]!) * mix, from[2]! + (to[2]! - from[2]!) * mix]);
}

export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = channel(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function shade(color: string, amount: number): string {
  const [r, g, b] = channel(color);
  return amount >= 0
    ? hex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount])
    : hex([r * (1 + amount), g * (1 + amount), b * (1 + amount)]);
}

/** The midpoint of two colours — how collaboration links are tinted. */
export function blend(a: string, b: string): string {
  const from = channel(a); const to = channel(b);
  return hex([(from[0]! + to[0]!) / 2, (from[1]! + to[1]!) / 2, (from[2]! + to[2]!) / 2]);
}

export const groupColor = (palette: Palette, index: number) => palette.groups[index % palette.groups.length]!;
