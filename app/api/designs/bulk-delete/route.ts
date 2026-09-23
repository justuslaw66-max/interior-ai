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
  const operation = "design.bulk_delete";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();

    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }

    const body = await readJsonRequest(req, 16 * 1024);
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const ids = Array.isArray(payload.ids)
      ? Array.from(new Set(payload.ids.filter(
          (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 64
        )))
      : [];

    if (ids.length === 0 || ids.length > 100) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Provide between 1 and 100 design IDs.");
    }

    const result = await prisma.design.deleteMany({
      where: { id: { in: ids }, userId: session.user.id },
    });

    return NextResponse.json(
      { deleted: result.count },
      { status: 200, headers: apiSuccessHeaders(operationId) }
    );
  } catch (err) {
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}
