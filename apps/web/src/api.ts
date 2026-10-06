/*
 * Talking to the brain. Every call carries the access token when there is one,
 * and turns the brain's error answers into plain sentences.
 */

export type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

export class AccessError extends Error {}

export function makeApi(token: string) {
  const auth = (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

  const call: Request = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`/api/v1${path}`, {
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...auth() },
    });
    // An empty or non-JSON answer means the brain didn't answer (restarting, or the edge
    // couldn't reach it): say that, rather than a cryptic JSON parse error.
    const text = await response.text();
    let data: { error?: string } | undefined;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    if (!response.ok) {
      if (response.status === 401) throw new AccessError("Enter the playlist access token.");
      throw new Error(data?.error ?? (response.status >= 500
        ? `The SynAmp server didn't answer (HTTP ${response.status}). It may be restarting — try again in a minute.`
        : `HTTP ${response.status}`));
    }
    if (data === undefined) throw new Error("The SynAmp server sent an empty answer. It may be restarting — try again in a minute.");
    return data as T;
  };

  /** Fetch with the access token, then hand the browser a file (an <a href> can't send the token). */
  async function download(path: string, filename: string) {
    const response = await fetch(`/api/v1${path}`, { headers: auth() });
    if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
    const url = URL.createObjectURL(await response.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /** A raw file upload (PUT), with the access token. */
  async function upload(path: string, body: Blob, headers: Record<string, string> = {}) {
    const response = await fetch(`/api/v1${path}`, {
      method: "PUT", body,
      headers: { "content-type": "application/octet-stream", ...headers, ...auth() },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
  }

  return { call, download, upload };
}
