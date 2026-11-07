import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";

/** The design's earlier versions, newest first, for its owner (`lib/design-checkpoints.ts`). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const operation = "design.checkpoints.list";
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
      select: { id: true },
    });
    if (!design) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");

    const checkpoints = await prisma.designCheckpoint.findMany({
      where: { designId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, reason: true, title: true, sourceUpdatedAt: true },
    });
    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
    });
    return NextResponse.json({ checkpoints }, { headers: apiSuccessHeaders(operationId) });
  } catch (err) {
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}
