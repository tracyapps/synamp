/*
 * The Mac app opens SynAmp at http://127.0.0.1:<port>/#/library?access=<token>,
 * handing the access token over in the address's fragment (the part after #,
 * which the browser never sends over the network). The web app keeps it for
 * this tab, like a typed-in token, and takes it out of the address straight
 * away so it isn't left in the address bar or history.
 */

/** The token in a hash like "#/library?access=abc&x=1", and the hash without it. */
export function takeAccessToken(hash: string): { token: string | null; hash: string } {
  const match = /^(#[^?]*)\?(.*)$/.exec(hash);
  if (!match) return { token: null, hash };
  const params = new URLSearchParams(match[2]);
  const token = params.get("access");
  if (token === null) return { token: null, hash };
  params.delete("access");
  const rest = params.toString();
  return { token: /^[A-Za-z0-9._~-]{16,256}$/.test(token) ? token : null, hash: rest ? `${match[1]}?${rest}` : match[1]! };
}

/** Run once at start-up: keep a handed-over token and tidy the address. */
export function adoptHandedOverToken(key: string): void {
  try {
    const { token, hash } = takeAccessToken(window.location.hash);
    if (hash === window.location.hash) return;
    if (token) sessionStorage.setItem(key, token);
    history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
  } catch { /* private window: the token form still works */ }
}
