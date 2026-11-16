/* The link that fills in the Mac app's connection form:
   synamp://connect?home=…&token=…&away=…  (apps/mac ConnectLink.swift reads it).
   Kept apart from the component so it can be tested. */

/** Null when this page can't say what SynAmp's home address is. */
export function connectLink({ origin, hostname, token, tailscaleName }: { origin: string; hostname: string; token: string; tailscaleName?: string }): string | null {
  if (!token) return null;
  const away = (tailscaleName ?? "").trim().toLowerCase();
  // Opened through the away-from-home name: this address isn't the one at home.
  if (away && (hostname.toLowerCase() === away || hostname.toLowerCase().endsWith(".ts.net"))) return null;
  // A page opened on the computer SynAmp runs on says "localhost": no use to another Mac,
  // but right for the Mac app on this same computer.
  const parts = new URLSearchParams({ home: origin, token });
  if (away) parts.set("away", away);
  // Spaces as %20, not "+": the Mac reads "+" as a plus sign (a real plus is already %2B).
  return `synamp://connect?${parts.toString().replace(/\+/g, "%20")}`;
}
