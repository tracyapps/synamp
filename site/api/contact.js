// POST /api/contact — the contact form. Emails you the message; "reply" goes straight to the sender.
import { addToAudience, clean, isEmail, looksLikeABot, readForm, reply, sendEmail } from "./_lib/forms.js";

const TOPICS = ["Question", "Bug report", "Feature idea", "Something else"];

export default async function handler(req, res) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("allow", "POST"); return res.end(); }
  const form = await readForm(req);
  if (looksLikeABot(form)) return reply(req, res, 200, "Thanks — your message is on its way.");
  const name = clean(form.name, 120);
  const email = clean(form.email, 254).toLowerCase();
  const topic = TOPICS.includes(form.topic) ? form.topic : "Something else";
  const subject = clean(form.subject, 160);
  const message = clean(form.message, 10_000);
  const version = clean(form.version, 80);
  const urgency = clean(form.urgency, 20);
  const wantsNews = form.updates === "yes";
  if (!name || !subject || !message) return reply(req, res, 400, "Please fill in your name, a subject and a message.");
  if (!isEmail(email)) return reply(req, res, 400, "That email address doesn't look quite right.");
  try {
    // Only people who ticked the box join the news list.
    const listed = wantsNews ? await addToAudience(email).catch(() => false) : false;
    await sendEmail({
      subject: `[SynAmp · ${topic}] ${subject}`,
      text: [
        `From: ${name} <${email}>`,
        `Topic: ${topic}${urgency ? ` · urgency: ${urgency}` : ""}`,
        version ? `SynAmp version: ${version}` : "",
        `Product news: ${wantsNews ? `yes, please${listed ? " (added to your Resend audience)" : ""}` : "no — only reply to this message"}`,
        "",
        message,
        "",
        "— sent from the contact form on synamp.app. Reply to answer them directly.",
      ].join("\n"),
      replyTo: email,
    });
    return reply(req, res, 200, "Thanks — your message is on its way. You'll usually hear back within a few days.");
  } catch (error) {
    console.error("contact:", error.message);
    return reply(req, res, 502, "That didn't send.", error.reason || "error");
  }
}
