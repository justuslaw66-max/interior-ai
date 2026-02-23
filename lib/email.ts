import { config } from "@/lib/config";

type SendEmailPayload = {
  to: string;
  subject: string;
  html: string;
};

type ShareEmailPayload = {
  to: string;
  designTitle: string;
  shareUrl: string;
  senderName?: string | null;
};

const getResendKey = () => process.env.RESEND_API_KEY || "";
const getEmailFrom = () => process.env.EMAIL_FROM || "";

async function sendEmail(payload: SendEmailPayload) {
  const apiKey = getResendKey();
  const from = getEmailFrom();

  if (!apiKey || !from) {
    if (config.isProdLike) {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required");
    }
    console.warn("[Email] Missing RESEND_API_KEY or EMAIL_FROM");
    return { ok: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend error: ${res.status} ${text}`);
  }

  return { ok: true };
}

export async function sendShareLinkEmail(payload: ShareEmailPayload) {
  if (!config.features.emailEnabled) {
    return { ok: false };
  }

  const safeTitle = payload.designTitle || "Your Interior AI design";
  const senderLine = payload.senderName ? `From ${payload.senderName}` : "From Interior AI";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 12px 0;">${safeTitle}</h2>
      <p style="margin: 0 0 12px 0;">${senderLine}</p>
      <p style="margin: 0 0 12px 0;">View the design here:</p>
      <p style="margin: 0 0 16px 0;">
        <a href="${payload.shareUrl}" style="color: #2563eb;">${payload.shareUrl}</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #6b7280;">Interior AI</p>
    </div>
  `;

  return sendEmail({
    to: payload.to,
    subject: `Design share link: ${safeTitle}`,
    html,
  });
}
