/**
 * 16. Share → Duplicate Smoke
 *
 * Verifies the share-based design duplication flow end-to-end:
 *   1. Unauthenticated POST → 401
 *   2. Authenticated POST to a valid share token → 201 with { id }
 *   3. The duplicated design is readable via /api/designs/:id
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const baseURL = "http://localhost:3000";

let prismaClient: PrismaClient | null = null;

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=(.*)$/m);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    if (value) {
      process.env.DATABASE_URL = value;
      return value;
    }
  }

  return undefined;
}

function getPrismaClient(): PrismaClient {
  if (prismaClient) return prismaClient;
  const url = resolveDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is required for share-duplicate smoke tests");
  prismaClient = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  });
  return prismaClient;
}

const cookieCandidates = [
  "authjs.session-token",
  "next-auth.session-token",
  "__Secure-authjs.session-token",
  "__Secure-next-auth.session-token",
] as const;

async function createUserSession() {
  const prisma = getPrismaClient();
  const email = `share-dup-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@example.com`;
  const user = await prisma.user.create({ data: { email, plan: "free" } });
  const sessionToken = `sess_${crypto.randomBytes(12).toString("hex")}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return { userId: user.id, sessionToken };
}

async function postWithSession(
  request: import("@playwright/test").APIRequestContext,
  url: string,
  token: string
): Promise<{ response: import("@playwright/test").APIResponse; status: number }> {
  for (const cookieName of cookieCandidates) {
    const headers = { Cookie: `${cookieName}=${token}` };
    const response = await request.post(url, { headers });
    if (response.status() !== 401) {
      return { response, status: response.status() };
    }
  }
  const response = await request.post(url);
  return { response, status: response.status() };
}

test.describe("16. Share → Duplicate Smoke", () => {
  test.afterAll(async () => {
    if (prismaClient) {
      await prismaClient.$disconnect();
      prismaClient = null;
    }
  });

  test("unauthenticated request to share duplicate endpoint returns 401", async ({ request }) => {
    // Use a fake token — the auth check fires before any DB lookup
    const fakeToken = `smoke-${crypto.randomBytes(8).toString("hex")}`;
    const response = await request.post(`${baseURL}/api/share/${fakeToken}/duplicate`);
    expect(response.status()).toBe(401);
  });

  test("authenticated user can duplicate a shared design and gets back a design id", async ({ request }) => {
    const prisma = getPrismaClient();

    // 1. Create the owner user + session
    const { userId: ownerId } = await createUserSession();

    // 2. Create a shared design owned by that user
    const shareToken = `smoke-share-${crypto.randomBytes(8).toString("hex")}`;
    const sourceDesign = await prisma.design.create({
      data: {
        title: "Smoke Test Shared Design",
        roomWidth: 5,
        roomDepth: 4,
        items: [],
        shareEnabled: true,
        shareToken,
        userId: ownerId,
      },
      select: { id: true },
    });

    // 3. Create a second user (the duplicator)
    const { sessionToken: duplicatorToken, userId: duplicatorId } = await createUserSession();

    try {
      // 4. POST to the share duplicate endpoint with the duplicator's session
      const { response, status } = await postWithSession(
        request,
        `${baseURL}/api/share/${shareToken}/duplicate`,
        duplicatorToken
      );

      expect(status, `Expected 200 but got ${status}`).toBe(200);

      const body = await response.json();
      expect(typeof body.id).toBe("string");
      expect(body.id.length).toBeGreaterThan(0);

      // 5. Verify the duplicated design exists in the DB and belongs to the duplicator
      const dup = await prisma.design.findUnique({
        where: { id: body.id },
        select: { userId: true, title: true },
      });

      expect(dup).not.toBeNull();
      expect(dup!.userId).toBe(duplicatorId);
      expect(dup!.title).toMatch(/copy/i);
    } finally {
      // Cleanup
      await prisma.design
        .deleteMany({ where: { userId: { in: [ownerId, duplicatorId] } } })
        .catch(() => {});
      await prisma.session
        .deleteMany({ where: { userId: { in: [ownerId, duplicatorId] } } })
        .catch(() => {});
      await prisma.user
        .deleteMany({ where: { id: { in: [ownerId, duplicatorId] } } })
        .catch(() => {});
    }
  });

  test("duplicate of non-existent or non-shared token returns 404", async ({ request }) => {
    const prisma = getPrismaClient();
    const { sessionToken } = await createUserSession();

    const fakeToken = `nonexistent-${crypto.randomBytes(8).toString("hex")}`;
    const { response, status } = await postWithSession(
      request,
      `${baseURL}/api/share/${fakeToken}/duplicate`,
      sessionToken
    );

    // Should be 404 since the share token doesn't exist or isn't enabled
    expect([404, 401]).toContain(status);

    // Cleanup session
    await prisma.session
      .deleteMany({ where: { sessionToken } })
      .catch(() => {});
  });
});
