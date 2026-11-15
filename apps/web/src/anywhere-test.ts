/* "Does Listen anywhere work from this device?" The page asks SynAmp's own
   "are you there" address at the away-from-home name. A saved name that doesn't
   answer used to go unnoticed until someone was out of the house. */

export type Reach = "reached" | "not_synamp" | "no_answer";

/** Ask once, from this device. Never throws. */
export async function reach(base: string, fetchImpl: typeof fetch = fetch, timeoutMs = 6000): Promise<Reach> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${base.replace(/\/+$/, "")}/health`, { cache: "no-store", signal: stop.signal });
    const answer = response.ok ? await response.json().catch(() => null) as { service?: unknown } | null : null;
    return answer?.service === "synamp-brain" ? "reached" : "not_synamp";
  } catch {
    return "no_answer";
  } finally {
    clearTimeout(timer);
  }
}

/** The result in words. `here`: this page was itself opened at that name. */
export function reachWords(result: Reach, name: string, here = false): { ok: boolean; text: string } {
  if (result === "reached") {
    return { ok: true, text: here
      ? `You’re using SynAmp at ${name} right now, so Listen anywhere works from this device.`
      : `This device reached SynAmp at ${name}. Listen anywhere works from here.` };
  }
  if (result === "not_synamp") {
    return { ok: false, text: `Something answered at ${name}, but it isn’t SynAmp. Check the name against the one the Tailscale app shows for your NAS.` };
  }
  return { ok: false, text: `This device couldn’t reach SynAmp at ${name}. Check the name against the one the Tailscale app shows for your NAS, and that Tailscale is switched on on this device.` };
}
