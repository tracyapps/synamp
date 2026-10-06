// POST /api/subscribe — the early-access list. Emails you each new signup.
import { addToAudience, clean, isEmail, looksLikeABot, readForm, reply, sendEmail } from "./_lib/forms.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("allow", "POST"); return res.end(); }
  const form = await readForm(req);
  if (looksLikeABot(form)) return reply(req, res, 200, "Thank you — you're on the list."); // say nothing useful to bots
  const email = clean(form.email, 254).toLowerCase();
  if (!isEmail(email)) return reply(req, res, 400, "That email address doesn't look quite right.");
  const hasServer = form.has_server === "yes";
  const source = clean(form.source, 60) || "website";
  try {
    const listed = await addToAudience(email).catch(() => false);
    await sendEmail({
      subject: `SynAmp early access: ${email}`,
      text: [
        `${email} joined the early-access list.`,
        `Has a NAS or home server: ${hasServer ? "yes" : "not ticked"}`,
        `Signed up from: ${source}`,
        listed ? "Added to your Resend audience." : "",
        "",
        "Reply to this email to write to them directly.",
      ].filter((line) => line !== null).join("\n"),
      replyTo: email,
    });
    return reply(req, res, 200, "Thank you — you're on the list. One email when SynAmp is ready, nothing else.");
  } catch (error) {
    console.error("subscribe:", error.message);
    return reply(req, res, 502, "That didn't send.", error.reason || "error");
  }
}
