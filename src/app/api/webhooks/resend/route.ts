import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { processResendInboundEmail } from "@/lib/resend-inbound";

export const runtime = "nodejs";

/** Browser health check — Resend sends POST with Svix headers only. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "resend-webhook",
    hint: "Resend must POST here with event email.received; opening in a browser only checks that this route is deployed.",
  });
}

/**
 * Resend webhook: `email.received` → fetch full message → create portal inbox rows.
 * Configure in Resend Dashboard → Webhooks, event `email.received`.
 * URL: `https://<your-portal-host>/api/webhooks/resend`
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const rawBody = await request.text();

  if (secret) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 400 });
    }
    try {
      const wh = new Webhook(secret);
      wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (e) {
      console.error("[webhooks/resend] signature verify failed", e);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "RESEND_WEBHOOK_SECRET is required in production" },
      { status: 503 },
    );
  }

  let payload: { type?: string; data?: { email_id?: string } };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const emailId = payload.data?.email_id;
  if (!emailId || typeof emailId !== "string") {
    return NextResponse.json({ error: "Missing email_id" }, { status: 400 });
  }

  const result = await processResendInboundEmail(emailId);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not process inbound email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, skipped: result.skipped });
}
