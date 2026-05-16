/**
 * Admin API - Model Detail
 * GET/PATCH /api/admin/models/[id]
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { evaluateCatalogFinishCoverage } from "@/lib/finish-gate";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";

const prismaCompat = prisma as unknown as {
  catalogItem: {
    findMany: (args: {
      where: { assetId: string };
      select: {
        id: true;
        variantsJson: true;
        brandFinishes: { select: { id: true } };
        finishMappings: {
          select: {
            id: true;
            variantId: true;
            component: true;
            brandFinishId: true;
            needsReview: true;
          };
        };
      };
    }) => Promise<
      Array<{
        id: string;
        variantsJson: unknown;
        brandFinishes: Array<{ id: string }>;
        finishMappings: Array<{
          id: string;
          variantId: string;
          component: string;
          brandFinishId: string;
          needsReview: boolean;
        }>;
      }>
    >;
  };
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const model = await prisma.modelAsset.findUnique({
      where: { id },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json(model);
  } catch (error) {
    console.error("Error fetching model:", error);
    return NextResponse.json(
      { error: "Failed to fetch model" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      approved?: boolean;
      notes?: string | null;
      dimsWmm?: number;
      dimsDmm?: number;
      dimsHmm?: number;
      aabbSizeX?: number;
      aabbSizeY?: number;
      aabbSizeZ?: number;
      aabbCenterX?: number;
      aabbCenterY?: number;
      aabbCenterZ?: number;
      pivotOffsetX?: number;
      pivotOffsetZ?: number;
      groundAligned?: boolean;
    };

    const finishGateEnabled =
      process.env.LIVE_GATE_REQUIRE_FINISH_MAPPING === "true";
    const linkedCatalogYaml = getFreshCatalogYamlMap().get(id);
    const presetValidation = linkedCatalogYaml?.preset_validation;

    if (body?.approved === true && presetValidation && !presetValidation.publishable) {
      return NextResponse.json(
        {
          error: "Cannot approve asset until linked catalog preset validation passes.",
          presetValidation,
          catalogFilePath: linkedCatalogYaml?.file_path ?? null,
        },
        { status: 400 }
      );
    }

    if (finishGateEnabled && body?.approved === true) {
      const linkedCatalogItems = await prismaCompat.catalogItem.findMany({
        where: { assetId: id },
        select: {
          id: true,
          variantsJson: true,
          brandFinishes: { select: { id: true } },
          finishMappings: {
            select: {
              id: true,
              variantId: true,
              component: true,
              brandFinishId: true,
              needsReview: true,
            },
          },
        },
      });

      const issues = linkedCatalogItems
        .map((item) => evaluateCatalogFinishCoverage(item))
        .filter((coverage) => !coverage.complete)
        .map((coverage) => ({
          catalogItemId: coverage.catalogItemId,
          issues: coverage.issues.map((issue) => issue.message),
        }));

      if (issues.length > 0) {
        return NextResponse.json(
          {
            error: "Cannot approve asset until finish mapping is complete.",
            finishMappingIssues: issues,
          },
          { status: 400 }
        );
      }
    }

    const updateData: {
      approved?: boolean;
      notes?: string | null;
      dimsWmm?: number;
      dimsDmm?: number;
      dimsHmm?: number;
      aabbSizeX?: number;
      aabbSizeY?: number;
      aabbSizeZ?: number;
      aabbCenterX?: number;
      aabbCenterY?: number;
      aabbCenterZ?: number;
      pivotOffsetX?: number;
      pivotOffsetZ?: number;
      groundAligned?: boolean;
    } = {};

    if (typeof body.approved === "boolean") updateData.approved = body.approved;
    if (typeof body.notes === "string" || body.notes === null) updateData.notes = body.notes;
    if (typeof body.dimsWmm === "number") updateData.dimsWmm = Math.round(body.dimsWmm);
    if (typeof body.dimsDmm === "number") updateData.dimsDmm = Math.round(body.dimsDmm);
    if (typeof body.dimsHmm === "number") updateData.dimsHmm = Math.round(body.dimsHmm);
    if (typeof body.aabbSizeX === "number") updateData.aabbSizeX = body.aabbSizeX;
    if (typeof body.aabbSizeY === "number") updateData.aabbSizeY = body.aabbSizeY;
    if (typeof body.aabbSizeZ === "number") updateData.aabbSizeZ = body.aabbSizeZ;
    if (typeof body.aabbCenterX === "number") updateData.aabbCenterX = body.aabbCenterX;
    if (typeof body.aabbCenterY === "number") updateData.aabbCenterY = body.aabbCenterY;
    if (typeof body.aabbCenterZ === "number") updateData.aabbCenterZ = body.aabbCenterZ;
    if (typeof body.pivotOffsetX === "number") updateData.pivotOffsetX = body.pivotOffsetX;
    if (typeof body.pivotOffsetZ === "number") updateData.pivotOffsetZ = body.pivotOffsetZ;
    if (typeof body.groundAligned === "boolean") updateData.groundAligned = body.groundAligned;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid model fields provided for update." },
        { status: 400 }
      );
    }

    const model = await prisma.modelAsset.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(model);
  } catch (error) {
    console.error("Error updating model:", error);
    return NextResponse.json(
      { error: "Failed to update model" },
      { status: 500 }
    );
  }
}
