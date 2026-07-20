import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDesignClaimPayload } from "@/lib/design-route-payload";
import { rateLimit } from "@/lib/rateLimit";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const operation = "design.claim_guest";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
  const body = await readJsonRequest(req, 5 * 1024 * 1024);
  const parsed = parseDesignClaimPayload(body);

  if (!parsed.ok) {
    throw new ApiBoundaryError(parsed.status, "BAD_REQUEST", parsed.error);
  }
  const { anonymousId, roomType, itemsCount, design: payload } = parsed.value;
  const rl = rateLimit(`guest-claim:${anonymousId}`, 3, 60 * 60_000);
  if (!rl.ok) {
    throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many guest save attempts.");
  }
  const existingCount = await prisma.design.count({
    where: { anonymousId, userId: null },
  });
  if (existingCount >= 3) {
    throw new ApiBoundaryError(429, "RATE_LIMITED", "Guest design limit reached.");
  }

  const design = await prisma.design.create({
    data: {
      anonymousId,
      title: payload.title,
      roomWidth: payload.roomWidth,
      roomDepth: payload.roomDepth,
      items: payload.items as Prisma.InputJsonValue,
      ...(payload.snapshot
        ? { snapshot: payload.snapshot as unknown as Prisma.InputJsonValue }
        : {}),
      zones: payload.zones as Prisma.InputJsonValue,
      savedViews: payload.savedViews as Prisma.InputJsonValue,
      style: payload.style,
      budget: payload.budget,
      mode: payload.mode,
      notes: payload.notes,
      shareEnabled: false,
      shareToken: null,
    },
    select: { id: true },
  });

  return NextResponse.json(
    { designId: design.id, roomType, itemsCount },
    { headers: apiSuccessHeaders(operationId) }
  );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
