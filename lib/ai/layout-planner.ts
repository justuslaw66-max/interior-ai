export type AiLayoutRoomType = "living" | "bedroom" | "dining" | "kitchen" | "toilet" | "custom";

export type AiLayoutCatalogEntry = {
  id?: string;
  category?: string;
  price?: number;
  styleTags?: string[];
  dimensions?: {
    w?: number;
    d?: number;
    h?: number;
  };
};

export type AiLayoutRole =
  | "sofa"
  | "rug"
  | "coffee_table"
  | "tv_console"
  | "accent_chair"
  | "floor_lamp";

export type AiLayoutPlan = {
  picks: Partial<Record<AiLayoutRole, string | null>>;
  intent: Partial<Record<AiLayoutRole, string>>;
  quality: {
    completeness: number;
    fitRisk: "low" | "medium" | "high";
    requiredMissing: AiLayoutRole[];
    warnings: string[];
  };
  meta: {
    style: string;
    budget: string;
    seed: number;
    roomType: AiLayoutRoomType;
    supportedRoomType: true;
  };
};

export type AiLayoutUnsupportedPlan = {
  error: string;
  code: "unsupported_room_type";
  supportedRoomTypes: AiLayoutRoomType[];
  meta: {
    roomType: AiLayoutRoomType;
    style: string;
    budget: string;
    seed: number;
  };
};

const LIVING_ROOM_REQUIRED_ROLES: AiLayoutRole[] = ["sofa", "rug", "coffee_table"];

const CATEGORY_ALIASES: Record<AiLayoutRole, string[]> = {
  sofa: ["sofa", "sectional_sofa", "recliner_sofa"],
  rug: ["rug"],
  coffee_table: ["coffee_table"],
  tv_console: ["tv_console", "sideboard"],
  accent_chair: ["accent_chair", "armchair", "arm_chair"],
  floor_lamp: ["floor_lamp"],
};

export function normalizeAiLayoutRoomType(value: unknown): AiLayoutRoomType {
  const normalized = String(value ?? "living").toLowerCase().trim();
  if (
    normalized === "living" ||
    normalized === "bedroom" ||
    normalized === "dining" ||
    normalized === "kitchen" ||
    normalized === "toilet" ||
    normalized === "custom"
  ) {
    return normalized;
  }
  return "custom";
}

function seededRand(seedNum: number) {
  const x = Math.sin(seedNum) * 10000;
  return x - Math.floor(x);
}

function pickSeeded<T>(arr: T[], seedNum: number, offset: number) {
  if (!arr.length) return null;
  const r = seededRand(seedNum + offset);
  const idx = Math.floor(r * arr.length);
  return arr[idx];
}

export function catalogMatchesAiLayoutRole(role: AiLayoutRole, category: string | undefined) {
  if (!category) return false;
  return CATEGORY_ALIASES[role].includes(category);
}

function resolveFitRisk(roomWidth: number, roomDepth: number): AiLayoutPlan["quality"]["fitRisk"] {
  const area = roomWidth * roomDepth;
  if (roomWidth < 3.2 || roomDepth < 3 || area < 11) return "high";
  if (roomWidth < 4.2 || roomDepth < 3.6 || area < 16) return "medium";
  return "low";
}

function maxFitRisk(
  a: AiLayoutPlan["quality"]["fitRisk"],
  b: AiLayoutPlan["quality"]["fitRisk"]
): AiLayoutPlan["quality"]["fitRisk"] {
  if (a === "high" || b === "high") return "high";
  if (a === "medium" || b === "medium") return "medium";
  return "low";
}

function getDimension(entry: AiLayoutCatalogEntry | null, key: "w" | "d" | "h") {
  const value = entry?.dimensions?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function buildLivingRoomFitWarnings(params: {
  roomWidth: number;
  roomDepth: number;
  picksByRole: Partial<Record<AiLayoutRole, AiLayoutCatalogEntry | null>>;
}): { fitRisk: AiLayoutPlan["quality"]["fitRisk"]; warnings: string[] } {
  const warnings: string[] = [];
  let fitRisk = resolveFitRisk(params.roomWidth, params.roomDepth);
  const sideClearance = 0.45;
  const frontClearance = 0.6;

  const sofaWidth = getDimension(params.picksByRole.sofa ?? null, "w");
  const sofaDepth = getDimension(params.picksByRole.sofa ?? null, "d");
  const coffeeDepth = getDimension(params.picksByRole.coffee_table ?? null, "d");
  const rugWidth = getDimension(params.picksByRole.rug ?? null, "w");
  const tvDepth = getDimension(params.picksByRole.tv_console ?? null, "d");

  const usableWidth = Math.max(0, params.roomWidth - sideClearance * 2);
  if (sofaWidth !== null && sofaWidth > usableWidth) {
    fitRisk = "high";
    warnings.push(
      `Selected sofa is ${sofaWidth.toFixed(1)}m wide; room needs at least ${(sofaWidth + sideClearance * 2).toFixed(1)}m for comfortable side clearance.`
    );
  }

  if (rugWidth !== null && rugWidth > params.roomWidth) {
    fitRisk = maxFitRisk(fitRisk, "medium");
    warnings.push(`Selected rug is wider than the room and may need a smaller variant.`);
  }

  if (sofaDepth !== null && coffeeDepth !== null) {
    const tvZoneDepth = tvDepth ?? 0.4;
    const requiredDepth = sofaDepth + coffeeDepth + tvZoneDepth + frontClearance * 3;
    if (requiredDepth > params.roomDepth) {
      fitRisk = "high";
      warnings.push(
        `Sofa, coffee table, and media wall need about ${requiredDepth.toFixed(1)}m depth; this room is ${params.roomDepth.toFixed(1)}m deep.`
      );
    } else if (requiredDepth > params.roomDepth * 0.82) {
      fitRisk = maxFitRisk(fitRisk, "medium");
      warnings.push("Living-room set fits tightly; prioritize walking clearance before adding accent seating.");
    }
  }

  return { fitRisk, warnings };
}

export function buildDeterministicLivingRoomLayoutPlan(params: {
  roomWidth: number;
  roomDepth: number;
  style?: unknown;
  budget?: unknown;
  seed: number;
  catalog: AiLayoutCatalogEntry[];
}): AiLayoutPlan {
  const styleNorm = String(params.style ?? "Modern").toLowerCase();
  const budgetNorm = String(params.budget ?? "$$");
  const seedNum = params.seed;

  const matchesStyle = params.catalog.filter(
    (p) =>
      Array.isArray(p.styleTags) &&
      p.styleTags.some((tag) => String(tag).toLowerCase() === styleNorm)
  );
  const pool = matchesStyle.length ? matchesStyle : params.catalog;

  const pickByRole = (role: AiLayoutRole, offset: number) => {
    const styleItems = pool
      .filter((p) => catalogMatchesAiLayoutRole(role, p.category))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

    const allItems = params.catalog
      .filter((p) => catalogMatchesAiLayoutRole(role, p.category))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

    const items = styleItems.length >= 2 ? styleItems : allItems;
    if (!items.length) return null;
    if (budgetNorm === "$") return items[0];
    if (budgetNorm === "$$$") return items[items.length - 1];
    return pickSeeded(items, seedNum, offset);
  };

  const picksByRole: Partial<Record<AiLayoutRole, AiLayoutCatalogEntry | null>> = {
    sofa: pickByRole("sofa", 11),
    rug: pickByRole("rug", 22),
    coffee_table: pickByRole("coffee_table", 33),
    tv_console: pickByRole("tv_console", 44),
    accent_chair: pickByRole("accent_chair", 55),
    floor_lamp: pickByRole("floor_lamp", 66),
  };

  const picks: AiLayoutPlan["picks"] = {
    sofa: picksByRole.sofa?.id ?? null,
    rug: picksByRole.rug?.id ?? null,
    coffee_table: picksByRole.coffee_table?.id ?? null,
    tv_console: picksByRole.tv_console?.id ?? null,
    accent_chair: picksByRole.accent_chair?.id ?? null,
    floor_lamp: picksByRole.floor_lamp?.id ?? null,
  };

  const requiredMissing = LIVING_ROOM_REQUIRED_ROLES.filter((role) => !picks[role]);
  const pickedCount = Object.values(picks).filter(Boolean).length;
  const totalRoles = Object.keys(picks).length;
  const fitResult = buildLivingRoomFitWarnings({
    roomWidth: params.roomWidth,
    roomDepth: params.roomDepth,
    picksByRole,
  });
  const fitRisk = fitResult.fitRisk;
  const warnings: string[] = [];

  if (requiredMissing.length > 0) {
    warnings.push(`Missing required roles: ${requiredMissing.join(", ")}`);
  }
  if (fitRisk !== "low") {
    warnings.push(
      fitRisk === "high"
        ? "Room may be too compact for a complete living-room starter set."
        : "Room is compact; placement should prioritize circulation."
    );
  }
  warnings.push(...fitResult.warnings);

  return {
    picks,
    intent: {
      sofa: "back_wall_center",
      rug: "under_sofa",
      coffee_table: "in_front_of_sofa",
      tv_console: "front_wall_center",
      accent_chair: "conversation_corner",
      floor_lamp: "near_accent_chair",
    },
    quality: {
      completeness: Number((pickedCount / totalRoles).toFixed(2)),
      fitRisk,
      requiredMissing,
      warnings,
    },
    meta: {
      style: styleNorm,
      budget: budgetNorm,
      seed: seedNum,
      roomType: "living",
      supportedRoomType: true,
    },
  };
}

export function buildDeterministicLayoutPlan(params: {
  roomWidth: number;
  roomDepth: number;
  roomType?: unknown;
  style?: unknown;
  budget?: unknown;
  seed: number;
  catalog: AiLayoutCatalogEntry[];
}): AiLayoutPlan | AiLayoutUnsupportedPlan {
  const roomType = normalizeAiLayoutRoomType(params.roomType);
  const styleNorm = String(params.style ?? "Modern").toLowerCase();
  const budgetNorm = String(params.budget ?? "$$");

  if (roomType !== "living") {
    return {
      error: "AI layout currently supports living rooms first. Add room-specific rules before placing furniture in this room type.",
      code: "unsupported_room_type",
      supportedRoomTypes: ["living"],
      meta: {
        roomType,
        style: styleNorm,
        budget: budgetNorm,
        seed: params.seed,
      },
    };
  }

  return buildDeterministicLivingRoomLayoutPlan({
    roomWidth: params.roomWidth,
    roomDepth: params.roomDepth,
    style: params.style,
    budget: params.budget,
    seed: params.seed,
    catalog: params.catalog,
  });
}
