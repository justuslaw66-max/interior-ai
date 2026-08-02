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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject.replace(/[\r\n]/g, " ").slice(0, 200),
        html: payload.html,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Email provider request failed with status ${res.status}`);
  }

  return { ok: true };
}

export async function sendShareLinkEmail(payload: ShareEmailPayload) {
  if (!config.features.emailEnabled) {
    return { ok: false };
  }

  const safeTitle = escapeHtml((payload.designTitle || "Your Interior AI design").slice(0, 120));
  const senderLine = payload.senderName
    ? `From ${escapeHtml(payload.senderName.slice(0, 100))}`
    : "From Interior AI";
  const shareUrl = new URL(payload.shareUrl);
  if (shareUrl.protocol !== "https:" && shareUrl.protocol !== "http:") {
    throw new Error("Share URL is invalid");
  }
  const safeShareUrl = escapeHtml(shareUrl.toString());

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 12px 0;">${safeTitle}</h2>
      <p style="margin: 0 0 12px 0;">${senderLine}</p>
      <p style="margin: 0 0 12px 0;">View the design here:</p>
      <p style="margin: 0 0 16px 0;">
        <a href="${safeShareUrl}" style="color: #2563eb;">${safeShareUrl}</a>
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
