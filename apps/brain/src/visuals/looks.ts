/**
 * Your MilkDrop looks: the ones you love and the ones you never want to see,
 * and whether "Change by itself" picks from all of them or just your favourites.
 *
 * Kept by the brain (not the browser), so the TV, the laptop and the phone all
 * know the same favourites. Looks are named by their MilkDrop preset name.
 * A look is a favourite or hidden, never both: loving a hidden look brings it
 * back, hiding a favourite takes it out of your favourites.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class LooksError extends Error {
  status = 400;
}

export type Pool = "all" | "favourites";
type State = { format: "synamp.visual-looks/1"; favourites: string[]; hidden: string[]; pool: Pool };

const MAX_NAME = 300;
const MAX_EACH = 5000;
const cleanList = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= MAX_NAME))].slice(0, MAX_EACH)
  : [];

export class LooksStore {
  private path: string;
  state: State;
  constructor(path: string) {
    this.path = path;
    let loaded: Partial<State> = {};
    try { loaded = JSON.parse(readFileSync(path, "utf8")) as Partial<State>; } catch { /* first run */ }
    const favourites = cleanList(loaded.favourites);
    const loved = new Set(favourites);
    this.state = {
      format: "synamp.visual-looks/1", favourites,
      hidden: cleanList(loaded.hidden).filter((name) => !loved.has(name)),
      pool: loaded.pool === "favourites" ? "favourites" : "all",
    };
  }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state) + "\n", { mode: 0o600 });
    renameSync(temp, this.path);
  }

  /**
   * One change at a time: `{ name, favourite: true|false }`, `{ name, hidden: true|false }`
   * or `{ pool: "all"|"favourites" }`.
   */
  update(input: Record<string, unknown>): State {
    if (input.pool !== undefined) {
      if (input.pool !== "all" && input.pool !== "favourites") throw new LooksError("pool must be \"all\" or \"favourites\"");
      this.state.pool = input.pool;
    }
    if (input.favourite !== undefined || input.hidden !== undefined) {
      const name = input.name;
      if (typeof name !== "string" || !name || name.length > MAX_NAME) throw new LooksError("name must be the look's name");
      const without = (list: string[]) => list.filter((item) => item !== name);
      if (input.favourite !== undefined) {
        if (typeof input.favourite !== "boolean") throw new LooksError("favourite must be true or false");
        this.state.favourites = without(this.state.favourites);
        if (input.favourite) {
          if (this.state.favourites.length >= MAX_EACH) throw new LooksError(`You can keep up to ${MAX_EACH} favourites`);
          this.state.favourites.push(name);
          this.state.hidden = without(this.state.hidden);
        }
      }
      if (input.hidden !== undefined) {
        if (typeof input.hidden !== "boolean") throw new LooksError("hidden must be true or false");
        this.state.hidden = without(this.state.hidden);
        if (input.hidden) {
          if (this.state.hidden.length >= MAX_EACH) throw new LooksError(`You can hide up to ${MAX_EACH} looks`);
          this.state.hidden.push(name);
          this.state.favourites = without(this.state.favourites);
        }
      }
    }
    this.save();
    return this.state;
  }

  view() {
    const { favourites, hidden, pool } = this.state;
    return { favourites, hidden, pool };
  }
}
