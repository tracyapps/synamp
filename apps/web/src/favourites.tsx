import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Request } from "./api";
import Icon from "./ui/Icon";

/*
 * Favourites (hearts) for artists, albums and songs, shared by every part of the
 * Library. Kept on the brain (apps/brain/src/library/favourites.ts), which also
 * keeps them in step with Navidrome stars, so they show in your phone apps.
 */

export type FavouriteKind = "song" | "album" | "artist";
type View = { keys: string[]; counts: { songs: number; albums: number; artists: number }; phone: boolean; last_sync?: { at: number; error?: string } };
type Value = {
  has: (kind: FavouriteKind, ref: string) => boolean;
  toggle: (kind: FavouriteKind, ref: string, name: string) => Promise<boolean>;
  view: View | null;
};

/** The same key the brain uses: artists match ignoring case and accents. */
export const artistKey = (name: string) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const favouriteKey = (kind: FavouriteKind, ref: string) => `${kind}:${kind === "artist" ? artistKey(ref) : ref}`;

const Context = createContext<Value>({ has: () => false, toggle: async () => false, view: null });
export const useFavourites = () => useContext(Context);

export function FavouritesProvider({ request, children }: { request: Request; children: ReactNode }) {
  const [view, setView] = useState<View | null>(null);
  const keys = useMemo(() => new Set(view?.keys ?? []), [view]);
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    const load = () => request<View>("/favourites").then(setView).catch(() => undefined);
    load();
    // Stars added in a phone app arrive with the brain's sync; look again now and then.
    const every = window.setInterval(load, 60_000);
    return () => window.clearInterval(every);
  }, [request]);
  const has = useCallback((kind: FavouriteKind, ref: string) => keys.has(favouriteKey(kind, ref)), [keys]);
  const toggle = useCallback(async (kind: FavouriteKind, ref: string, name: string) => {
    const key = favouriteKey(kind, ref);
    const on = !latest.current.has(key);
    // Change on screen at once; put it back if the brain says no.
    setView((current) => current && { ...current, keys: on ? [...current.keys, key] : current.keys.filter((item) => item !== key) });
    try {
      setView(await request<View>("/favourites", { method: "POST", body: JSON.stringify({ kind, ref, name, on }) }));
    } catch (cause) {
      setView((current) => current && { ...current, keys: on ? current.keys.filter((item) => item !== key) : [...current.keys, key] });
      throw cause;
    }
    return on;
  }, [request]);
  const value = useMemo(() => ({ has, toggle, view }), [has, toggle, view]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

const KIND_WORD: Record<FavouriteKind, string> = { song: "song", album: "album", artist: "artist" };

/** A heart that toggles a favourite. Pressed = it's a favourite. */
export function Heart({ kind, refId, name, say, size = "sm" }: { kind: FavouriteKind; refId: string; name: string; say?: (text: string) => void; size?: "sm" | "md" }) {
  const { has, toggle } = useFavourites();
  const on = has(kind, refId);
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={`heart ${size === "md" ? "heart--md" : ""} ${on ? "is-on" : ""}`} aria-pressed={on} disabled={busy}
      aria-label={`Favourite ${KIND_WORD[kind]}: ${name}`} title={on ? "Remove from favourites" : "Add to favourites"}
      onClick={() => {
        setBusy(true);
        toggle(kind, refId, name)
          .then((now) => say?.(now ? `${name} is a favourite.` : `${name} is no longer a favourite.`))
          .catch((cause) => say?.((cause as Error).message))
          .finally(() => setBusy(false));
      }}>
      <Icon name="heart" size={size === "md" ? 20 : 18} />
    </button>
  );
}
