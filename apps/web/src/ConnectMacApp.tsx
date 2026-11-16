import { useEffect, useId, useState } from "react";
import { connectLink } from "./connect-link";

/*
 * "Connect the Mac app": one button that fills in SynAmp for Mac's connection
 * form (address at home, access token, away-from-home name), so nobody copies
 * a token by hand. The link opens the Mac app on this computer; the person
 * still reads the address there and presses Connect.
 */

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

export default function ConnectMacApp({ request, token }: { request: Request; token: string }) {
  const id = useId();
  const [tailscaleName, setTailscaleName] = useState<string | undefined>();
  useEffect(() => {
    let stopped = false;
    request<{ tailscale_name?: string }>("/setup").then((setup) => { if (!stopped) setTailscaleName(setup.tailscale_name); }).catch(() => undefined);
    return () => { stopped = true; };
  }, [request]);

  const link = connectLink({ origin: window.location.origin, hostname: window.location.hostname, token, tailscaleName });
  return (
    <section className="panel settings connect-mac" aria-labelledby={`${id}-title`}>
      <div className="connect-mac__body">
        <h2 id={`${id}-title`}>SynAmp for Mac</h2>
        <p>Have the Mac app on this computer? This fills in its connection for you: no address or access token to type.</p>
        {link
          ? <p><a className="btn btn--primary" href={link}>Connect the Mac app</a></p>
          : <p className="settings__hint">You’re looking at SynAmp through its away-from-home address. Open it at its home address (on your home network) to connect the Mac app.</p>}
        <p className="settings__hint">Nothing happens when you press it? The Mac app isn’t installed on this computer yet. The link holds your access token, so use it yourself rather than sending it to anyone.</p>
      </div>
    </section>
  );
}
