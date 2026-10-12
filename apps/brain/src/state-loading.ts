import { lstatSync, readFileSync } from "node:fs";

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Only ENOENT is a first run. Never replace unreadable user state with defaults.
 * Checks envelope/container compatibility, not every record's semantic schema.
 * Older unversioned objects and missing optional containers remain supported.
 */
export function loadUserState<T>(path: string, format: string, maps: string[], arrays: string[] = []): Partial<T> {
  const recovery = () => new Error(`Cannot load ${format} user state. Leave the original file intact and follow tools/install/RECOVERY.md before restarting.`);
  let text: string;
  try { text = readFileSync(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // A dangling link is existing state, not an empty first-run store.
      try { lstatSync(path); } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") return {};
      }
    }
    throw recovery();
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw recovery(); }
  if (!object(value) || (value.format !== undefined && value.format !== format)) throw recovery();
  for (const key of maps) if (key in value && !object(value[key])) throw recovery();
  for (const key of arrays) if (key in value && !Array.isArray(value[key])) throw recovery();
  return value as Partial<T>;
}
