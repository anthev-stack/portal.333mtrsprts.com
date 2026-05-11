import { sendTransactionalHtml } from "@/lib/transactional-mail";

/**
 * Password-reset links always go to the user's **external** email (never internal @domain only).
 * Requires SMTP + MAIL_FROM (see .env.example). In development, logs the link if SMTP is off.
 */
export async function sendPasswordResetEmail(
  toExternalEmail: string,
  resetUrl: string,
) {
  const safeHref = resetUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `
<p>You requested a password reset for the 333 Motorsports staff portal.</p>
<p><a href="${safeHref}">Set a new password</a></p>
<p>If you did not request this, you can ignore this message.</p>
<p style="color:#666;font-size:12px">This link expires after a period set by your administrator.</p>
`.trim();

  const result = await sendTransactionalHtml({
    to: toExternalEmail,
    subject: "Reset your portal password",
    html,
    text: `Reset your password: ${resetUrl}`,
  });

  if (result === null) {
    console.info(
      `[email] Password reset for ${toExternalEmail} (SMTP not configured — link): ${resetUrl}`,
    );
    return;
  }

  if (!result.ok) {
    console.error(
      `[email] Password reset SMTP failed for ${toExternalEmail}:`,
      result.error,
    );
    console.info(`[email] Fallback link for ${toExternalEmail}: ${resetUrl}`);
  }
}
