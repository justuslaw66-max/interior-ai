import {
  parseDesignNotesOutput,
  type DesignNotesInput,
  type DesignNotesOutput,
} from "@/lib/ai/design-notes-contract";
import {
  describeDesignNotesRoom,
  fallbackFloorSwapSuggestions,
  keepCheckedFloorSwaps,
} from "@/lib/ai/design-notes-room";

/**
 * What `/api/ai/design-notes` tells the model and the shape it must answer in. Moved out of the route on 18 Oct 2026,
 * when the active room's surfaces joined the request (step 2 of the AI tile plan).
 */
export const DESIGN_NOTES_SYSTEM_PROMPT = [
  "You are an interior design assistant. Provide practical, client-safe notes and suggestions.",
  "Never claim you can see images. Use only the provided design data.",
  "Return 3–5 concise, actionable summary points, a brief rationale paragraph, and 1–6 suggestions that map to one of",
  "these action types: RUG_RESIZE_TO_SOFA, MAKE_CHEAPER, ADD_LAMP_NEAR_READING or SWAP_SURFACE.",
  "The room lists its floor and walls with facts from the tile maker's technical sheets (slip class DIN 51130, barefoot",
  "class DIN 51097, whether a floor is in the outdoor range, whether a tile is a white-body wall tile) and plan review's",
  "surface findings. Mention the findings plainly. Private homes are not regulated: the R10, R11 and barefoot B levels",
  "are workplace rules that tile makers use as the reference, so never say a floor is illegal or forbidden.",
  "SWAP_SURFACE replaces the room's floor: set roomId to the room's id, surface to \"floor\" and materialId to one of",
  "floorSwapCandidates. Never name a tile that isn't listed. If there are no candidates, don't suggest SWAP_SURFACE.",
].join(" ");

export const DESIGN_NOTES_RESPONSE_SCHEMA = {
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
                  enum: ["RUG_RESIZE_TO_SOFA", "MAKE_CHEAPER", "ADD_LAMP_NEAR_READING", "SWAP_SURFACE"],
                },
                percent: { type: "number" },
                sofaItemId: { type: "string" },
                roomId: { type: "string" },
                surface: { type: "string", enum: ["floor"] },
                materialId: { type: "string" },
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

export function buildDesignNotesUserContent({ design, mode }: DesignNotesInput): string {
  return JSON.stringify({
    mode,
    design: {
      items: design.items,
      categories: design.categories,
      budget: design.budget ?? null,
      room: design.room ? { id: design.room.id, ...describeDesignNotesRoom(design.room) } : null,
    },
  });
}

const FURNITURE_FALLBACK_SUGGESTIONS: DesignNotesOutput["suggestions"] = [
  {
    id: "fallback_rug_resize_to_sofa",
    label: "Resize rug to better proportion with the sofa.",
    action: { type: "RUG_RESIZE_TO_SOFA" },
  },
  {
    id: "fallback_budget_optimize",
    label: "Lower the total by swapping items for cheaper alternatives.",
    action: { type: "MAKE_CHEAPER", percent: 10 },
  },
  {
    id: "fallback_add_task_lighting",
    label: "Add task lighting near the reading corner.",
    action: { type: "ADD_LAMP_NEAR_READING" },
  },
];

/** The deterministic notes while no AI provider is configured: a flagged floor's swap, then the furniture suggestions. */
export function buildFallbackDesignNotes(design: DesignNotesInput["design"]): DesignNotesOutput {
  return {
    summary: [
      "Good furniture layout with clear zones for different activities.",
      "Rug placement anchors conversation area effectively.",
      "Consider adding accent lighting near seating areas.",
    ],
    rationale:
      "The current layout provides functional flow and visual balance. Adding texture and varied lighting would enhance the space.",
    suggestions: [
      ...fallbackFloorSwapSuggestions(design.room),
      ...(design.items.length > 0 ? FURNITURE_FALLBACK_SUGGESTIONS : []),
    ],
  };
}

/** The model's or the cache's answer in the contract, with floor swaps kept only for the room's candidates. */
export function parseCheckedDesignNotes(value: unknown, room: DesignNotesInput["design"]["room"]): DesignNotesOutput | null {
  const output = parseDesignNotesOutput(value);
  return output ? keepCheckedFloorSwaps(output, room) : null;
}
