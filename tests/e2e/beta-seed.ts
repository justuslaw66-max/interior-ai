import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { DesignItem, DesignSnapshot } from "../../lib/room-types";
import { resolveE2EDatabaseUrl } from "./release-environment";

type PrismaJson = Parameters<PrismaClient["design"]["create"]>[0]["data"]["items"];

let prismaClient: PrismaClient | null = null;
let pgPool: Pool | null = null;

export function getBetaPrismaClient() {
  if (prismaClient) return prismaClient;
  const databaseUrl = resolveE2EDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for beta smoke tests");
  }
  pgPool = new Pool({ connectionString: databaseUrl });
  prismaClient = new PrismaClient({ adapter: new PrismaPg(pgPool) });
  return prismaClient;
}

export async function disconnectBetaPrismaClient() {
  await prismaClient?.$disconnect();
  await pgPool?.end();
  prismaClient = null;
  pgPool = null;
}

function betaId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function formatPrismaError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; meta?: unknown };
  return JSON.stringify({
    code: candidate.code ?? null,
    message: typeof candidate.message === "string" ? candidate.message : String(error),
    meta: candidate.meta ?? null,
  });
}

export function buildBetaDesignSnapshot(): DesignSnapshot {
  const livingItems: DesignItem[] = [
    {
      instanceId: "beta-dawson-chair-1",
      productId: "armchair-real-castlery-avery-performance-armchair",
      variantId: "white_quartz",
      position: [-0.9, 0, -0.3],
      rotationY: 0.15,
      includeInCheckout: true,
    },
    {
      instanceId: "beta-hugg-table-1",
      productId: "coffee-real-castlery-hugg-nesting-square-performance-dune-closed",
      variantId: "natural",
      position: [0.8, 0, 0.45],
      rotationY: 0,
      includeInCheckout: true,
    },
    {
      instanceId: "beta-avery-chair-2",
      productId: "armchair-real-castlery-avery-performance-swivel-armchair",
      variantId: "white_quartz",
      position: [-1.9, 0, 1.15],
      rotationY: 0.55,
      includeInCheckout: true,
    },
    {
      instanceId: "beta-hugg-side-table-1",
      productId: "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed",
      variantId: "chestnut",
      position: [1.9, 0, -1.05],
      rotationY: 0,
      includeInCheckout: true,
    },
  ];
  const diningItems: DesignItem[] = [
    {
      instanceId: "beta-sloane-table-1",
      productId: "tv-real-castlery-sloane-tv-console-150",
      variantId: "150cm_grey_oak",
      position: [6.1, 0, 0.1],
      rotationY: 1.57,
      includeInCheckout: false,
    },
    {
      instanceId: "beta-dining-armchair-1",
      productId: "armchair-real-castlery-avery-performance-armchair-with-ottoman",
      variantId: "white_quartz",
      position: [5.1, 0, -0.95],
      rotationY: 0.2,
      includeInCheckout: true,
    },
    {
      instanceId: "beta-dining-hugg-table-1",
      productId: "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-closed",
      variantId: "black",
      position: [6.5, 0, 1.0],
      rotationY: 1.57,
      includeInCheckout: true,
    },
  ];
  const bedroomItems: DesignItem[] = [
    {
      instanceId: "beta-bedroom-chair-1",
      productId: "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman",
      variantId: "white_quartz",
      position: [-0.7, 0, -0.7],
      rotationY: -0.35,
      includeInCheckout: true,
    },
    {
      instanceId: "beta-bedroom-hugg-table-1",
      productId: "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened",
      variantId: "natural",
      position: [0.8, 0, 0.8],
      rotationY: 0.75,
      includeInCheckout: true,
    },
  ];

  return {
    version: 3,
    activeRoomId: "beta-living",
    title: "Beta Smoke Whole Home",
    style: "modern",
    budget: "mid",
    lightingPreset: "soft_daylight",
    notes: "Deterministic beta smoke fixture.",
    floorPlan: {
      openings: [
        {
          id: "opening-living-door",
          roomId: "beta-living",
          wall: "south",
          offsetMm: -850,
          widthMm: 900,
          kind: "door",
        },
        {
          id: "opening-dining-window",
          roomId: "beta-dining",
          wall: "east",
          offsetMm: 650,
          widthMm: 1400,
          kind: "window",
        },
        {
          id: "opening-bedroom-door",
          roomId: "beta-bedroom",
          wall: "north",
          offsetMm: 0,
          widthMm: 850,
          kind: "door",
        },
      ],
    },
    rooms: [
      {
        id: "beta-living",
        name: "Living Room",
        roomType: "living",
        floorLevel: 1,
        floorLabel: "1F",
        geometry: { width: 5.8, depth: 4.2, wallThickness: 0.14, height: 2.7, slabThickness: 0.12 },
        planPosition: { x: 0, z: 0 },
        planShape: "rectangle",
        surfaceFinishes: {
          floorMaterialId: "oak-natural",
          floorRotationDeg: 90,
          floorScale: 1.1,
          ceilingColor: "#f8f6f0",
        },
        surfaceOpacity: { wall: 0.88, floor: 1, ceiling: 0.7 },
        ceilingVisible: true,
        items: livingItems,
        zones: [
          {
            id: "zone-living-conversation",
            type: "seating",
            itemIds: livingItems.map((item) => item.instanceId),
            anchor: [0, 0, 0],
            source: "manual",
          },
        ],
        savedViews: [
          {
            id: "view-living-client",
            name: "Client Preview",
            cameraPosition: [3.6, 3.1, 5.2],
            cameraTarget: [0, 0.6, 0],
          },
        ],
        layoutVersions: [
          {
            id: "layout-living-manual",
            name: "Manual placement",
            source: "manual",
            timestamp: 1,
            items: livingItems,
            zones: [],
            summary: { itemCount: livingItems.length, zoneCount: 1 },
          },
        ],
      },
      {
        id: "beta-dining",
        name: "Dining Room",
        roomType: "dining",
        floorLevel: 1,
        floorLabel: "1F",
        geometry: { width: 4.1, depth: 3.4, wallThickness: 0.14, height: 2.7, slabThickness: 0.12 },
        planPosition: { x: 6.1, z: 0 },
        planShape: "rectangle",
        surfaceFinishes: {
          floorMaterialId: "stone-light",
          floorRotationDeg: 0,
          floorScale: 0.95,
          ceilingColor: "#ffffff",
        },
        surfaceOpacity: { wall: 0.92, floor: 1, ceiling: 0.75 },
        ceilingVisible: true,
        items: diningItems,
        zones: [
          {
            id: "zone-dining",
            type: "dining",
            itemIds: ["beta-sloane-table-1"],
            anchor: [6.1, 0, 0.1],
            source: "manual",
          },
        ],
        savedViews: [
          {
            id: "view-dining-plan",
            name: "Dining Plan",
            cameraPosition: [6.1, 5.2, 4.4],
            cameraTarget: [6.1, 0.4, 0],
          },
        ],
        layoutVersions: [
          {
            id: "layout-dining-latest",
            name: "Dining reviewed",
            source: "make_space",
            timestamp: 2,
            items: diningItems,
            zones: [],
            summary: { itemCount: 1, zoneCount: 1 },
          },
        ],
      },
      {
        id: "beta-bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        floorLevel: 1,
        floorLabel: "1F",
        geometry: { width: 4.4, depth: 3.8, wallThickness: 0.14, height: 2.65, slabThickness: 0.12 },
        planPosition: { x: 0, z: 5.2 },
        planShape: "rectangle",
        surfaceFinishes: {
          floorMaterialId: "walnut-warm",
          floorRotationDeg: 45,
          floorScale: 1,
          ceilingColor: "#fbfaf7",
        },
        surfaceOpacity: { wall: 0.9, floor: 1, ceiling: 0.72 },
        ceilingVisible: true,
        items: bedroomItems,
        zones: [
          {
            id: "zone-bedroom-reading",
            type: "reading",
            itemIds: bedroomItems.map((item) => item.instanceId),
            anchor: [0, 0, 0],
            source: "manual",
          },
        ],
        savedViews: [
          {
            id: "view-bedroom-preview",
            name: "Bedroom Preview",
            cameraPosition: [0, 4.4, 7.2],
            cameraTarget: [0, 0.5, 5.2],
          },
        ],
        layoutVersions: [
          {
            id: "layout-bedroom-latest",
            name: "Reading corner",
            source: "manual",
            timestamp: 3,
            items: bedroomItems,
            zones: [],
            summary: { itemCount: bedroomItems.length, zoneCount: 1 },
          },
        ],
      },
    ],
  };
}

export async function createBetaSeedDesign(options: { email?: string } = {}) {
  const prisma = getBetaPrismaClient();
  let user: Awaited<ReturnType<typeof prisma.user.create>> | null = null;
  let lastCreateError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const userId = betaId("user");
    const email = options.email ?? `${betaId("beta-smoke")}@example.com`;
    try {
      user = await prisma.user.create({
        data: { id: userId, email, name: "Beta Smoke User", plan: "free" },
      });
      break;
    } catch (error) {
      lastCreateError = error;
    }
  }
  if (!user) {
    throw new Error(`Unable to create beta smoke user: ${formatPrismaError(lastCreateError)}`);
  }
  const sessionToken = `sess_${crypto.randomBytes(16).toString("hex")}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const snapshot = buildBetaDesignSnapshot();
  const activeRoom = snapshot.rooms.find((room) => room.id === snapshot.activeRoomId) ?? snapshot.rooms[0];
  const shareToken = betaId("share");
  const design = await prisma.design.create({
    data: {
      title: snapshot.title,
      roomWidth: activeRoom.geometry.width,
      roomDepth: activeRoom.geometry.depth,
      items: activeRoom.items as unknown as PrismaJson,
      zones: activeRoom.zones as unknown as PrismaJson,
      savedViews: activeRoom.savedViews as unknown as PrismaJson,
      snapshot: snapshot as unknown as PrismaJson,
      style: snapshot.style,
      budget: snapshot.budget,
      mode: "homeowner",
      notes: snapshot.notes,
      shareEnabled: true,
      shareToken,
      userId: user.id,
    },
  });

  return {
    userId: user.id,
    designId: design.id,
    sessionToken,
    shareToken,
    snapshot,
  };
}

export async function addAuthCookies(
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  sessionToken: string
) {
  const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const secure = new URL(baseURL).protocol === "https:";
  await context.addCookies([
    {
      name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
      value: sessionToken,
      url: baseURL,
      expires,
      httpOnly: true,
      sameSite: "Lax" as const,
      secure,
    },
  ]);
}

export async function cleanupBetaSeed(userId: string) {
  const prisma = getBetaPrismaClient();
  await prisma.design.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
}
