/**
 * Stub transactional email sender. Every "send an email" call in this app
 * goes through here, so wiring up a real provider later (Resend, Postmark,
 * SES, etc.) means changing this one function — nothing else needs to know
 * how mail actually gets sent.
 *
 * For now it just logs to the server console, which is enough to develop
 * and test the password-reset / email-verification / invite-email flows
 * without an email provider or API key.
 */
export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  console.log(
    `\n[mailer stub] Would send email:\n  To: ${opts.to}\n  Subject: ${opts.subject}\n  ---\n  ${opts.text}\n`
  );

  // To wire up a real provider, replace the console.log above with e.g.:
  //
  //   import { Resend } from "resend";
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({ from: process.env.EMAIL_FROM!, to: opts.to, subject: opts.subject, text: opts.text });
}
