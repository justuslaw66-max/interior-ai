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
import {
  DESIGN_NOTES_MAX_BODY_BYTES,
  parseDesignNotesInput,
  parseDesignNotesOutput,
} from "@/lib/ai/design-notes-contract";
import { logOperationalEvent } from "@/lib/observability";

export const runtime = "nodejs";

type HashableItem = {
  id?: unknown;
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

/**
 * Output schema the UI expects.
 * Structured output ensures consistent response shape.
 */
const responseSchema = {
  name: "design_notes",
  schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      summary: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
      rationale: { type: "string" },
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            action: {
              type: "object",
              additionalProperties: true,
              properties: {
                type: {
                  type: "string",
                  enum: ["RUG_RESIZE_TO_SOFA", "MAKE_CHEAPER", "ADD_LAMP_NEAR_READING"],
                },
                percent: { type: "number" },
                sofaItemId: { type: "string" },
              },
              required: ["type"],
            },
          },
          required: ["id", "label", "action"],
        },
      },
    },
    required: ["summary", "rationale", "suggestions"],
  },
};

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

        const parsedCached = cached ? parseDesignNotesOutput(cached.resultJson) : null;
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
      return NextResponse.json({
        summary: [
          "Good furniture layout with clear zones for different activities.",
          "Rug placement anchors conversation area effectively.",
          "Consider adding accent lighting near seating areas.",
        ],
        rationale:
          "The current layout provides functional flow and visual balance. Adding texture and varied lighting would enhance the space.",
        suggestions: [
          {
            id: "fallback_rug_resize_to_sofa",
            label: "Resize rug to better proportion with the sofa.",
            action: { type: "RUG_RESIZE_TO_SOFA" },
          },
          {
            id: "fallback_budget_optimize",
            label: "Optimize budget by swapping to cost-effective alternatives.",
            action: { type: "MAKE_CHEAPER", percent: 10 },
          },
          {
            id: "fallback_add_task_lighting",
            label: "Add task lighting near the reading corner.",
            action: { type: "ADD_LAMP_NEAR_READING" },
          },
        ],
      }, { headers: apiSuccessHeaders(operationId) });
    }

    // Build a compact prompt that includes only the data we have
    const systemPrompt =
      "You are an interior design assistant. Provide practical, client-safe notes and suggestions. " +
      "Never claim you can see images. Use only the provided design data. " +
      "Return 3–5 concise, actionable summary points, a brief rationale paragraph, and 1–6 suggestions " +
      "that map to one of these action types: RUG_RESIZE_TO_SOFA, MAKE_CHEAPER, or ADD_LAMP_NEAR_READING.";

    const userContent = JSON.stringify({
      mode,
      design: {
        items: design.items ?? [],
        categories: design.categories,
        budget: design.budget ?? null,
      },
    });

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
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: responseSchema,
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

    const result = parseDesignNotesOutput(JSON.parse(textContent) as unknown);
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
