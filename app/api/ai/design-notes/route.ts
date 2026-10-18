import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import { config } from "@/lib/config";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { DESIGN_NOTES_MAX_BODY_BYTES, parseDesignNotesInput } from "@/lib/ai/design-notes-contract";
import {
  buildDesignNotesUserContent,
  buildFallbackDesignNotes,
  DESIGN_NOTES_RESPONSE_SCHEMA,
  DESIGN_NOTES_SYSTEM_PROMPT,
  parseCheckedDesignNotes,
} from "@/lib/ai/design-notes-prompt";
import { logOperationalEvent } from "@/lib/observability";

export const runtime = "nodejs";

type HashableItem = {
  id?: unknown;
  productId?: unknown;
  name?: unknown;
  quantity?: unknown;
  category?: unknown;
  variantId?: unknown;
  locked?: unknown;
  price?: unknown;
  size?: unknown;
  tags?: unknown;
};

type HashableDesign = {
  room?: unknown;
  items?: HashableItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toInputJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

// Lazy load prisma to avoid initialization issues
type PrismaModule = typeof import("@/lib/prisma");
let prismaClient: PrismaModule["prisma"] | null = null;
async function getPrisma() {
  if (!prismaClient) {
    const { prisma: p } = await import("@/lib/prisma");
    prismaClient = p;
  }
  return prismaClient;
}

/**
 * Stable hash of design snapshot. Only includes what matters for AI suggestions.
 */
function hashDesign(design: unknown): string {
  const data: HashableDesign = isRecord(design)
    ? {
        room: design.room,
        items: Array.isArray(design.items)
          ? design.items
              .map((item) => (isRecord(item) ? (item as HashableItem) : null))
              .filter((item): item is HashableItem => item !== null)
          : [],
      }
    : { items: [] };

  const minimal = {
    room: data.room ?? null,
    items: (data.items ?? []).map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      category: i.category,
      variantId: i.variantId,
      locked: !!i.locked,
      price: i.price ?? null,
      size: i.size ?? null,
      tags: i.tags ?? null,
    })),
  };

  const str = JSON.stringify(minimal);
  return crypto.createHash("sha256").update(str).digest("hex");
}

export async function POST(req: Request) {
  const startTime = Date.now();
  const operation = "ai.design_notes";
  const operationId = createOperationId();
  try {
    if (!config.features.aiEnabled) {
      throw new ApiBoundaryError(503, "INTERNAL_ERROR", "AI suggestions are unavailable.");
    }

    const session = await auth();
    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }

    const requestBody = await readJsonRequest(req, DESIGN_NOTES_MAX_BODY_BYTES);
    const parsedInput = parseDesignNotesInput(requestBody);
    if (!parsedInput) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid design-notes request.");
    }
    const { design, mode } = parsedInput;

    // Rate limit: 12 requests per minute per user
    const key = `ai-design-notes:${session.user.id}`;
    const rl = rateLimit(key, 12, 60_000);
    if (!rl.ok) {
      throw new ApiBoundaryError(
        429,
        "RATE_LIMITED",
        "Too many AI requests. Please try again in a minute."
      );
    }

    // Check cache first (huge win if design hasn't changed)
    const designHash = hashDesign(design);
    let cacheDesignId: string | null = null;
    if (design.id) {
      try {
      const db = await getPrisma();
      const owned = await db.design.findFirst({
        where: { id: design.id, userId: session.user.id },
        select: { id: true },
      });
      cacheDesignId = owned?.id ?? null;
      if (cacheDesignId) {
        const cached = await db.aiDesignNotes.findUnique({
          where: {
            designId_designHash_mode: {
              designId: cacheDesignId,
              designHash,
              mode,
            },
          },
        });

        const parsedCached = cached ? parseCheckedDesignNotes(cached.resultJson, design.room) : null;
        if (parsedCached) {
          const ms = Date.now() - startTime;
          logOperationalEvent({
            operation,
            operationId,
            outcome: "succeeded",
            durationMs: ms,
            status: 200,
            meta: { cache: "hit", itemCount: design.items.length },
          });
          return NextResponse.json(
            { ...parsedCached, cached: true, ms },
            { headers: apiSuccessHeaders(operationId) }
          );
        }
      }
      } catch (cacheReadErr) {
      // Log but don't fail if cache read fails - user gets fresh generation
        console.warn("AI cache read failed", {
          errorType: cacheReadErr instanceof Error ? cacheReadErr.name : "unknown",
        });
      }
    }

    // Check if OpenAI key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY not configured, returning local fallback response");
      // Deterministic fallback while AI is unavailable.
      return NextResponse.json(buildFallbackDesignNotes(design), { headers: apiSuccessHeaders(operationId) });
    }

    if (config.logLevel === "debug") {
      console.log("Calling AI design-notes provider", { itemCount: design.items.length });
    }

    // Call OpenAI with Structured Outputs (JSON schema) + timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const requestPayload = {
      model: "gpt-4o",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: DESIGN_NOTES_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildDesignNotesUserContent(parsedInput),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: DESIGN_NOTES_RESPONSE_SCHEMA,
      },
    };

    let response;
    try {
      response = await client.chat.completions.create(
        requestPayload as unknown as Parameters<typeof client.chat.completions.create>[0],
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (config.logLevel === "debug") {
      console.log("OpenAI response received");
    }

    // Extract the parsed JSON from the response
    if (!("choices" in response)) {
      throw new Error("Unexpected streaming response from OpenAI");
    }

    const textContent = response.choices[0]?.message?.content || "";
    if (!textContent) {
      throw new Error("Empty AI response text");
    }

    const result = parseCheckedDesignNotes(JSON.parse(textContent) as unknown, design.room);
    if (!result) {
      throw new Error("AI provider returned a response outside the required contract");
    }

    // Store in cache for future requests with same design hash
    if (cacheDesignId) try {
      const db = await getPrisma();
      await db.aiDesignNotes.create({
        data: {
          designId: cacheDesignId,
          designHash,
          mode,
          resultJson: toInputJson(result),
        },
      });
      if (config.logLevel === "debug") {
        console.log("Cached AI design-notes result", { itemCount: design.items.length });
      }
    } catch (cacheErr) {
      // Log but don't fail if cache write fails
      console.warn("AI cache write failed", {
        errorType: cacheErr instanceof Error ? cacheErr.name : "unknown",
      });
    }

    const ms = Date.now() - startTime;
    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: ms,
      status: 200,
      meta: { cache: "miss", itemCount: design.items.length },
    });
    return NextResponse.json(
      { ...result, cached: false, ms },
      { headers: apiSuccessHeaders(operationId) }
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "APIUserAbortError")
    ) {
      return apiErrorResponse(
        new ApiBoundaryError(504, "UPSTREAM_TIMEOUT", "AI request timed out. Please try again."),
        { operation, operationId, startedAt: startTime }
      );
    }
    return apiErrorResponse(err, { operation, operationId, startedAt: startTime });
  }
}
