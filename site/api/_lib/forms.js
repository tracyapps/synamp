/*
 * Shared by the two form endpoints (api/subscribe.js, api/contact.js).
 *
 * Each submission is emailed to you through Resend (resend.com). Nothing is
 * stored on the website itself. Settings come from the Vercel project's
 * Environment Variables:
 *
 *   RESEND_API_KEY      required — from resend.com → API Keys
 *   NOTIFY_EMAIL        required — where submissions are sent (your inbox)
 *   MAIL_FROM           optional — defaults to "SynAmp <onboarding@resend.dev>",
 *                       which works without setting up your domain, but can
 *                       only send to the email your Resend account uses.
 *   RESEND_AUDIENCE_ID  optional — also add early-access emails to a Resend
 *                       audience, so you can send the "it's ready" email later.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function readForm(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" ? req.body : "";
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 50_000) break;
    }
  }
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) { try { return JSON.parse(raw); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

export const clean = (value, max = 500) => String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
export const isEmail = (value) => EMAIL.test(value) && value.length <= 254;

/** Bots fill in the hidden "website" field, or submit faster than a person can type. */
export function looksLikeABot(form) {
  if (clean(form.website)) return true;
  const elapsed = Number(form.elapsed_ms);
  return Number.isFinite(elapsed) && elapsed > 0 && elapsed < 1500;
}

/** Answer in the way the browser asked: JSON for the page's script, a page for a plain form post. */
export function reply(req, res, status, message, reason) {
  const wantsJson = String(req.headers.accept || "").includes("application/json");
  if (wantsJson) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(status < 400 ? { ok: true, message } : { ok: false, error: message, ...(reason ? { reason } : {}) }));
    return;
  }
  res.statusCode = 303;
  res.setHeader("location", status < 400 ? "/thanks" : "/oops");
  res.end();
}

export async function sendEmail({ subject, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) {
    throw Object.assign(new Error("RESEND_API_KEY or NOTIFY_EMAIL is missing in this deployment (add them in Vercel, then redeploy)."), { reason: "not_configured" });
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "SynAmp <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    let name = "";
    try { name = JSON.parse(body).name || ""; } catch { /* not JSON */ }
    // The full answer goes to the function log (Vercel → Logs); the browser only gets a short code.
    throw Object.assign(new Error(`Resend answered ${response.status}: ${body.slice(0, 400)}`), { reason: `resend_${response.status}${name ? `_${name}` : ""}` });
  }
}

export async function addToAudience(email) {
  const key = process.env.RESEND_API_KEY;
  const audience = process.env.RESEND_AUDIENCE_ID;
  if (!key || !audience) return false;
  const response = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audience)}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  return response.ok;
}
