import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import { config } from "@/lib/config";

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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
  try {
    if (!config.features.aiEnabled) {
      return NextResponse.json({ error: "AI is disabled" }, { status: 503 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { design, mode, anonymousId } = await req.json();

    if (!design) {
      return NextResponse.json({ error: "Missing design data" }, { status: 400 });
    }

    // Rate limit: 12 requests per minute per user
    const key = session.user.id ? `user:${session.user.id}` : `anon:${anonymousId ?? "unknown"}`;
    const rl = rateLimit(key, 12, 60_000);
    if (!rl.ok) {
      console.warn("Rate limit exceeded for key:", key);
      return NextResponse.json(
        { error: "Too many AI requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    // Check cache first (huge win if design hasn't changed)
    const designHash = hashDesign(design);
    
    try {
      const db = await getPrisma();
      const cached = await db.aiDesignNotes.findUnique({
        where: {
          designId_designHash_mode: {
            designId: design.id,
            designHash,
            mode: mode ?? "homeowner",
          },
        },
      });

      if (cached) {
        const ms = Date.now() - startTime;
        if (config.logLevel === "debug") {
          console.log("AI cache hit:", { designId: design.id, ms });
        }
        // Return with cached flag for client metrics
        return NextResponse.json({
          ...(isRecord(cached.resultJson) ? cached.resultJson : {}),
          cached: true,
          ms,
        });
      }
    } catch (cacheReadErr) {
      // Log but don't fail if cache read fails - user gets fresh generation
      if (config.logLevel !== "warn") {
        console.warn("Cache read failed:", getErrorMessage(cacheReadErr));
      }
    }

    // Check if OpenAI key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY not configured, returning fallback response");
      // Fallback stub response while waiting for API key
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
            id: "rug_size_demo",
            label: "Resize rug to better proportion with the sofa.",
            action: { type: "RUG_RESIZE_TO_SOFA" },
          },
          {
            id: "budget_demo",
            label: "Optimize budget by swapping to cost-effective alternatives.",
            action: { type: "MAKE_CHEAPER", percent: 10 },
          },
          {
            id: "lamp_demo",
            label: "Add task lighting near the reading corner.",
            action: { type: "ADD_LAMP_NEAR_READING" },
          },
        ],
      });
    }

    // Build a compact prompt that includes only the data we have
    const systemPrompt =
      "You are an interior design assistant. Provide practical, client-safe notes and suggestions. " +
      "Never claim you can see images. Use only the provided design data. " +
      "Return 3–5 concise, actionable summary points, a brief rationale paragraph, and 1–6 suggestions " +
      "that map to one of these action types: RUG_RESIZE_TO_SOFA, MAKE_CHEAPER, or ADD_LAMP_NEAR_READING.";

    const userContent = JSON.stringify({
      mode: mode ?? "homeowner",
      design: {
        items: design.items ?? [],
        categories: design.categories ?? [],
        budget: design.budget ?? null,
      },
    });

    if (config.logLevel === "debug") {
      console.log("Calling OpenAI with design data...", {
        itemCount: design.items?.length,
        categories: design.categories,
      });
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

    const response = await client.chat.completions.create(
      requestPayload as unknown as Parameters<typeof client.chat.completions.create>[0]
    );

    clearTimeout(timeout);

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

    const result = JSON.parse(textContent) as unknown;
    console.log("Successfully parsed AI response");

    // Store in cache for future requests with same design hash
    try {
      const db = await getPrisma();
      await db.aiDesignNotes.create({
        data: {
          designId: design.id,
          designHash,
          mode: mode ?? "homeowner",
          resultJson: toInputJson(result),
        },
      });
      console.log("Cached AI result for design:", design.id);
    } catch (cacheErr) {
      // Log but don't fail if cache write fails
      console.warn("Failed to cache AI result:", getErrorMessage(cacheErr));
    }

    const ms = Date.now() - startTime;
    return NextResponse.json({
      ...(isRecord(result) ? result : {}),
      cached: false,
      ms,
    });
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    const errCode = isRecord(err) ? err.code : undefined;
    const errStatus = isRecord(err) ? err.status : undefined;

    console.error("AI design-notes error:", {
      message,
      code: errCode,
      status: errStatus,
    });

    // Provide helpful error messages
    if (errCode === "ERR_ABORTED") {
      return NextResponse.json(
        { error: "AI request timed out. Please try again." },
        { status: 504 }
      );
    }

    if (message.includes("401") || message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "OpenAI API key invalid or expired" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: message || "AI request failed" },
      { status: 500 }
    );
  }
}
