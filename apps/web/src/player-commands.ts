/** All controls target the one player that owns the audio, including display windows. */
export type PlayerCommand = "toggle" | "next" | "previous" | "love" | "not-for-this" | "remove" | "more-like-this" | "visuals" | "undo-remove" | "wrong-energy" | "wrong-vibe";
export type PlayerView = {
  title: string; artist?: string; available: boolean; canUndo: boolean; loved: boolean; paused: boolean;
  busy: boolean; transitioning: boolean; action: string; status: string; playlist?: string;
};
export const PLAYER_COMMAND = "synamp:player-command";
export function command(action: PlayerCommand) {
  window.dispatchEvent(new CustomEvent(PLAYER_COMMAND, { detail: action }));
}
export function shortcut(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "code" | "repeat">, editing: boolean): PlayerCommand | undefined {
  if (editing || event.repeat || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
  const commands: Partial<Record<string, PlayerCommand>> = { ArrowRight: "next", ArrowLeft: "previous", Space: "toggle", KeyL: "love", KeyN: "not-for-this", KeyM: "more-like-this", KeyR: "remove", KeyV: "visuals" };
  return commands[event.code];
}
