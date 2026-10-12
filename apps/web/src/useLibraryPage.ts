import { useEffect, useState } from "react";
import type { Request } from "./api";

/** Cancel departed pages, hide stale data immediately, and make failures retryable. */
export default function useLibraryPage<T>(request: Request, path: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ path: string; data: T | null; problem: string }>({ path, data: null, problem: "" });
  useEffect(() => {
    let live = true, timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    setResult({ path, data: null, problem: "" });
    request<T>(path, { signal: controller.signal }).then(data => {
      if (live) setResult({ path, data, problem: "" });
    }, cause => {
      if (live) setResult({ path, data: null, problem: timedOut ? "The library took too long to answer. Try again." : (cause as Error).message });
    }).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [request, path, attempt]);
  return { data: result.path === path ? result.data : null, problem: result.path === path ? result.problem : "", retry: () => setAttempt(value => value + 1) };
}
