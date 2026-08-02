import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";
import {
  getE2EBaseUrl,
  resolveE2EAdminEmail,
  resolveE2EDatabaseUrl,
} from "./release-environment";

const baseURL = getE2EBaseUrl();
const isRemoteRelease = new URL(baseURL).protocol === "https:";

// This API-only spec handles live session headers for remote release validation.
// Never retain a trace that could serialize those headers into CI evidence.
test.use({ trace: "off" });

const cookieNames = [
  "authjs.session-token",
  "next-auth.session-token",
  "__Secure-authjs.session-token",
  "__Secure-next-auth.session-token",
] as const;

type AuthFixture = {
  adminCookie: string;
  ordinaryCookie: string;
  proCookie: string;
  expiredCookie: string;
  createdUserIds: string[];
  sessionTokens: string[];
};

let prisma: PrismaClient | null = null;
let authFixture: AuthFixture | null = null;

function getPrisma(): PrismaClient {
  if (prisma) return prisma;
  const databaseUrl = resolveE2EDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for admin authorization tests");

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error("Admin authorization tests refuse to create sessions in a remote database");
  }

  prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })),
  });
  return prisma;
}

async function createSession(userId: string, expires: Date): Promise<string> {
  const sessionToken = `admin-auth-${crypto.randomBytes(16).toString("hex")}`;
  await getPrisma().session.create({ data: { sessionToken, userId, expires } });
  return sessionToken;
}

async function createAuthFixture(): Promise<AuthFixture> {
  const database = getPrisma();
  const createdUserIds: string[] = [];
  const adminEmail = resolveE2EAdminEmail();
  let admin = await database.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await database.user.create({ data: { email: adminEmail, plan: "free" } });
    createdUserIds.push(admin.id);
  }

  const nonce = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
  const ordinary = await database.user.create({
    data: { email: `ordinary-${nonce}@example.test`, plan: "free" },
  });
  const pro = await database.user.create({
    data: { email: `pro-${nonce}@example.test`, plan: "pro" },
  });
  createdUserIds.push(ordinary.id, pro.id);

  const future = new Date(Date.now() + 60 * 60 * 1000);
  const past = new Date(Date.now() - 60 * 1000);
  const adminToken = await createSession(admin.id, future);
  const ordinaryToken = await createSession(ordinary.id, future);
  const proToken = await createSession(pro.id, future);
  const expiredToken = await createSession(ordinary.id, past);

  return {
    adminCookie: sessionCookie(adminToken),
    ordinaryCookie: sessionCookie(ordinaryToken),
    proCookie: sessionCookie(proToken),
    expiredCookie: sessionCookie(expiredToken),
    createdUserIds,
    sessionTokens: [adminToken, ordinaryToken, proToken, expiredToken],
  };
}

function sessionCookie(token: string): string {
  return cookieNames.map((name) => `${name}=${token}`).join("; ");
}

function createRemoteAuthFixture(): AuthFixture {
  const requiredCookie = (key: string): string => {
    const value = process.env[key]?.trim();
    if (!value) throw new Error(`${key} is required for remote admin authorization tests`);
    return value;
  };

  const cookies = {
    adminCookie: requiredCookie("PLAYWRIGHT_ADMIN_SESSION_COOKIE"),
    ordinaryCookie: requiredCookie("PLAYWRIGHT_ORDINARY_SESSION_COOKIE"),
    proCookie: requiredCookie("PLAYWRIGHT_PRO_SESSION_COOKIE"),
    expiredCookie: requiredCookie("PLAYWRIGHT_EXPIRED_SESSION_COOKIE"),
  };
  if (new Set(Object.values(cookies)).size !== Object.keys(cookies).length) {
    throw new Error("Remote admin authorization test cookies must be distinct");
  }

  return {
    ...cookies,
    createdUserIds: [],
    sessionTokens: [],
  };
}

async function expectIdentityProjection(
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
  expected: { plan: "free" | "pro"; source: "anon" | "db" }
): Promise<void> {
  const response = await request.get(`${baseURL}/api/me`, { headers: { Cookie: cookie } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual(expected);
}

async function expectDenied(response: import("@playwright/test").APIResponse): Promise<void> {
  expect(response.status()).toBe(403);
  expect(await response.text()).not.toContain("variantResolution");
}

test.describe("13. Admin authorization and variant audit", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    authFixture = isRemoteRelease ? createRemoteAuthFixture() : await createAuthFixture();
  });

  test.afterAll(async () => {
    if (!prisma || !authFixture) return;
    await prisma.session.deleteMany({ where: { sessionToken: { in: authFixture.sessionTokens } } });
    await prisma.user.deleteMany({ where: { id: { in: authFixture.createdUserIds } } });
    await prisma.$disconnect();
    prisma = null;
    authFixture = null;
  });

  test("signed-out, forged, expired, ordinary, and Pro callers are denied", async ({ request }) => {
    if (!authFixture) throw new Error("Admin authorization fixture was not created");

    await expectIdentityProjection(request, authFixture.expiredCookie, {
      plan: "free",
      source: "anon",
    });
    await expectIdentityProjection(request, authFixture.ordinaryCookie, {
      plan: "free",
      source: "db",
    });
    await expectIdentityProjection(request, authFixture.proCookie, {
      plan: "pro",
      source: "db",
    });

    const signedOut = await request.get(`${baseURL}/api/admin/audit`);
    await expectDenied(signedOut);

    const forged = await request.get(`${baseURL}/api/admin/audit?role=admin&devBypass=1`, {
      headers: {
        Cookie: "role=admin; isAdmin=true",
        "x-role": "admin",
        "x-interior-admin-bypass": "1",
      },
    });
    await expectDenied(forged);

    for (const token of [
      authFixture.expiredCookie,
      authFixture.ordinaryCookie,
      authFixture.proCookie,
    ]) {
      const denied = await request.get(`${baseURL}/api/admin/audit`, {
        headers: { Cookie: token },
      });
      await expectDenied(denied);
    }

    const malformed = await request.get(`${baseURL}/api/admin/audit`, {
      headers: { Cookie: sessionCookie("malformed-session-token") },
    });
    await expectDenied(malformed);
  });

  test("an allowlisted authenticated administrator reaches the direct route", async ({ request }) => {
    if (!authFixture) throw new Error("Admin authorization fixture was not created");
    const response = await request.get(`${baseURL}/api/admin/audit`, {
      headers: { Cookie: authFixture.adminCookie },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.variantResolution).toBeDefined();
    expect(typeof body.variantResolution.itemsScanned).toBe("number");
    expect(typeof body.variantResolution.variantsScanned).toBe("number");
    expect(Array.isArray(body.variantResolution.issues)).toBeTruthy();
    expect(body.variantResolution.itemsScanned).toBeGreaterThan(0);
    expect(body.variantResolution.variantsScanned).toBeGreaterThan(0);
  });
});
