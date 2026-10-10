import { useEffect, useState } from "react";

/*
 * Where in the Library you are. The list itself is #/library (with its filters
 * in the query); an artist's page is #/library/artist/<name> and an album's is
 * #/library/album/<folder>. Plain links, so Back, new tabs and bookmarks work.
 */

export type LibraryRoute = { kind: "list" } | { kind: "artist"; name: string } | { kind: "album"; key: string };

export function routeFromHash(hash: string): LibraryRoute {
  const match = hash.match(/^#\/?library\/(artist|album)\/([^?]*)/);
  if (!match) return { kind: "list" };
  let value = "";
  try { value = decodeURIComponent(match[2]!); } catch { return { kind: "list" }; }
  if (!value) return { kind: "list" };
  return match[1] === "artist" ? { kind: "artist", name: value } : { kind: "album", key: value };
}

export const artistHref = (name: string) => `#/library/artist/${encodeURIComponent(name)}`;
export const albumHref = (key: string) => `#/library/album/${encodeURIComponent(key)}`;

export function useLibraryRoute(): LibraryRoute {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const follow = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", follow);
    window.addEventListener("popstate", follow);
    return () => { window.removeEventListener("hashchange", follow); window.removeEventListener("popstate", follow); };
  }, []);
  return route;
}

/** Back to the list: the browser's Back when we came from it (keeps its place), else the list itself. */
export function backToList() {
  let fromList = false;
  try { fromList = sessionStorage.getItem("synamp-from-list") === "1"; sessionStorage.removeItem("synamp-from-list"); } catch { /* private mode */ }
  if (fromList && window.history.length > 1) {
    window.history.back();
  } else {
    window.location.hash = "#/library";
  }
}

/** Remember that a page was opened from the list, so "Back" can return to the same spot. */
export function openFromList(href: string) {
  try { sessionStorage.setItem("synamp-from-list", "1"); } catch { /* private mode: Back just opens the list */ }
  window.location.hash = href;
}
