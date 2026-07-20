import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import crypto from "crypto";
import { getPostHogClient } from "@/lib/posthog-server";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";
import { sendShareLinkEmail } from "@/lib/email";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";

function makeToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function normalizeRecipientEmail(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Recipient email is invalid.");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Recipient email is invalid.");
  }
  return email;
}

function normalizeRecipientName(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 100) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Recipient name is invalid.");
  }
  return value.trim();
}

function getShareOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Environment validation reports malformed values during startup.
    }
  }
  return new URL(request.url).origin;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const operation = "design.share.create";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
  const { id } = await params;
  const url = new URL(_req.url);
  const regenerate = url.searchParams.get("regenerate") === "1";
  const rawBody = await readJsonRequest(_req, 8 * 1024).catch((error) => {
    if (error instanceof ApiBoundaryError && error.message === "Request body is required.") {
      return {};
    }
    throw error;
  });
  const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {};
  const recipientEmail = normalizeRecipientEmail(body.email);
  const recipientName = normalizeRecipientName(body.recipientName);
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
  }

  const rl = rateLimit(`share:${session.user.id}`, 10, 60_000);
  if (!rl.ok) {
    throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many share requests.");
  }

  const design = await prisma.design.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, title: true, userId: true, shareToken: true, shareEnabled: true },
  });

  if (!design) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");

  if (!regenerate && design.shareEnabled && design.shareToken) {
    return NextResponse.json(
      { shareToken: design.shareToken },
      { headers: apiSuccessHeaders(operationId) }
    );
  }

  let token = regenerate ? makeToken() : design.shareToken ?? makeToken();
  let updatedToken: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const changed = await prisma.design.updateMany({
        where: { id, userId: session.user.id },
        data: { shareEnabled: true, shareToken: token },
      });
      if (changed.count !== 1) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");
      updatedToken = token;
      break;
    } catch {
      token = makeToken();
    }
  }

  if (!updatedToken) {
    throw new ApiBoundaryError(500, "INTERNAL_ERROR", "Could not create a share link.");
  }

  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: session.user.id,
      event: "share_link_enabled",
      properties: { design_id: id, is_regenerate: regenerate },
    });
  } catch {
    // Analytics must not prevent a successfully-created share link.
  }

  await logAppEvent({
    eventType: "share_link_created",
    userId: session.user.id,
    designId: id,
    shareToken: updatedToken,
    meta: { regenerate },
  });

  if (recipientEmail) {
    const shareUrl = `${getShareOrigin(_req)}/share/${updatedToken}`;
    try {
      await sendShareLinkEmail({
        to: recipientEmail,
        designTitle: design.title || "Interior AI Design",
        shareUrl,
        senderName: recipientName ?? session.user.name ?? null,
      });
    } catch (err) {
      console.warn("Share email delivery failed", {
        errorType: err instanceof Error ? err.name : "unknown",
      });
    }
  }

  logOperationalEvent({
    operation,
    operationId,
    outcome: "succeeded",
    durationMs: Date.now() - startedAt,
    status: 200,
    meta: { regenerate, emailRequested: Boolean(recipientEmail) },
  });
  return NextResponse.json(
    { shareToken: updatedToken },
    { headers: apiSuccessHeaders(operationId) }
  );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const operation = "design.share.disable";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
  }

  const design = await prisma.design.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, userId: true },
  });

  if (!design) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");

  const updated = await prisma.design.updateMany({
    where: { id, userId: session.user.id },
    data: { shareEnabled: false },
  });
  if (updated.count !== 1) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");

  return NextResponse.json(
    { shareEnabled: false },
    { headers: apiSuccessHeaders(operationId) }
  );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
