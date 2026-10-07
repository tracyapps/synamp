/**
 * brain-lab — assertion collector.
 *
 * One ScenarioRun per scenario. Checks are the units of evidence: every check has
 * a stable id, an outcome (pass | fail | pending | skip), and — for failures —
 * the expected value and the actual value so a reviewer can adjudicate without
 * re-running. `pending` is used when a required module has not landed yet
 * (never for "could not be bothered"); a pending check must carry the reason.
 */

export type CheckStatus = "pass" | "fail" | "pending" | "skip";

export type Check = {
  id: string;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  note?: string;
};

export type ScenarioStatus = "pass" | "partial" | "pending" | "fail";

export class ScenarioRun {
  id: string;
  title: string;
  kind: string;
  checks: Check[] = [];
  notes: string[] = [];

  constructor(id: string, title: string, kind: string) {
    this.id = id;
    this.title = title;
    this.kind = kind;
  }

  note(text: string): void {
    this.notes.push(text);
  }

  private add(check: Check): void {
    if (this.checks.some((item) => item.id === check.id)) {
      throw new Error(`duplicate check id "${check.id}" in scenario ${this.id}`);
    }
    this.checks.push(check);
  }

  pass(id: string, actual?: string, note?: string): void {
    this.add({ id, status: "pass", ...(actual !== undefined ? { actual } : {}), ...(note ? { note } : {}) });
  }

  fail(id: string, expected: string, actual: string, note?: string): void {
    this.add({ id, status: "fail", expected, actual, ...(note ? { note } : {}) });
  }

  /** Assert a boolean condition; pass/fail in one call. */
  check(id: string, ok: boolean, expected: string, actual: string, note?: string): void {
    if (ok) this.pass(id, actual, note);
    else this.fail(id, expected, actual, note);
  }

  pending(id: string, reason: string): void {
    this.add({ id, status: "pending", note: reason });
  }

  skip(id: string, reason: string): void {
    this.add({ id, status: "skip", note: reason });
  }

  counts(): { pass: number; fail: number; pending: number; skip: number } {
    const count = (status: CheckStatus) => this.checks.filter((item) => item.status === status).length;
    return { pass: count("pass"), fail: count("fail"), pending: count("pending"), skip: count("skip") };
  }

  status(): ScenarioStatus {
    const c = this.counts();
    if (c.fail > 0) return "fail";
    if (c.pending > 0 && c.pass === 0) return "pending";
    if (c.pending > 0) return "partial";
    return "pass";
  }

  toJSON(): Record<string, unknown> {
    return { id: this.id, title: this.title, kind: this.kind, status: this.status(), checks: this.checks, notes: this.notes };
  }
}

export function summarize(runs: ScenarioRun[]): {
  scenarios: Record<ScenarioStatus, number>;
  checks: { pass: number; fail: number; pending: number; skip: number };
} {
  const scenarios: Record<ScenarioStatus, number> = { pass: 0, partial: 0, pending: 0, fail: 0 };
  const checks = { pass: 0, fail: 0, pending: 0, skip: 0 };
  for (const run of runs) {
    scenarios[run.status()] += 1;
    const c = run.counts();
    checks.pass += c.pass;
    checks.fail += c.fail;
    checks.pending += c.pending;
    checks.skip += c.skip;
  }
  return { scenarios, checks };
}
