import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const operation = "design.merge_guest";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
  }

  const body = await readJsonRequest(req, 2 * 1024);
  const anonymousId = body && typeof body === "object"
    ? (body as Record<string, unknown>).anonymousId
    : null;
  if (
    typeof anonymousId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(anonymousId)
  ) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid anonymous design reference.");
  }

  const result = await prisma.design.updateMany({
    where: {
      anonymousId,
      userId: null,
    },
    data: {
      userId,
      anonymousId: null,
    },
  });

  return NextResponse.json(
    { merged: result.count },
    { headers: apiSuccessHeaders(operationId) }
  );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
