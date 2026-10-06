/*
 * What the party pages share: the guest's made-up ID (so votes count once),
 * plain fetches with no access token (the party code is the key), and the QR.
 */

export type PartyView = {
  code: string; auto_add: boolean;
  now: { title: string; artist?: string; requested_by?: string; playing: boolean } | null;
  next: Array<{ title: string; artist?: string; requested_by?: string }>;
  requests: Array<{ id: string; title: string; artist?: string; name?: string; votes: number; mine?: boolean; voted?: boolean }>;
};

export function guestId(): string {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    let id = localStorage.getItem("synamp-party-guest");
    if (!id) { id = make(); localStorage.setItem("synamp-party-guest", id); }
    return id;
  } catch { return (window as unknown as { __synampGuest?: string }).__synampGuest ??= make(); }
}

export async function partyCall<T>(code: string, path = "", options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/party/${encodeURIComponent(code)}${path}`, {
    ...options,
    headers: { "x-party-guest": guestId(), ...(options.body ? { "content-type": "application/json" } : {}) },
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Something went wrong (HTTP ${response.status})`);
  return data as T;
}

/** The QR code as SVG markup (the qrcode library loads only when a QR is shown). */
export async function qrSvg(text: string): Promise<string> {
  const QR = await import("qrcode");
  return QR.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0e0e10", light: "#f1f1f1" } });
}

export const joinUrl = (base: string, code: string) => `${(base || window.location.origin).replace(/\/+$/, "")}/party/${code}`;
/** "ABC 234" reads easier aloud and on a TV. */
export const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
