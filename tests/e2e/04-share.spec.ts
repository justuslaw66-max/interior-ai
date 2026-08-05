import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
  getBetaPrismaClient,
} from "./beta-seed";

async function extractPdfText(bytes: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items
        .map((item) => "str" in item ? item.str : "")
        .join(" "));
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.join("\n");
}

async function getSharedDesignFingerprint(
  request: APIRequestContext,
  designId: string,
  shareToken: string,
) {
  const response = await request.get(
    `/api/designs/${designId}?shareToken=${shareToken}`,
  );
  expect(response.status()).toBe(200);
  return fingerprintDesignSnapshot(legacyApiToSnapshot(await response.json()));
}

test.describe("4. Share Link Read-Only", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("shared design cannot expose editor mutations or change its snapshot", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    const rawPrivateSentinel = "PRIVATE RAW OUTER SHARE NOTES SENTINEL";
    const rawOuterTitle = "Raw outer title must not render";
    const rawOuterStyle = "raw-outer-style";
    const rawOuterBudget = "raw-outer-budget";
    const privateOwnerName = "Private Owner Identity Sentinel";
    try {
      const prisma = getBetaPrismaClient();
      await prisma.design.update({
        where: { id: seed.designId },
        data: {
          title: rawOuterTitle,
          style: rawOuterStyle,
          budget: rawOuterBudget,
          notes: rawPrivateSentinel,
        },
      });
      await prisma.user.update({
        where: { id: seed.userId },
        data: { name: privateOwnerName },
      });

      const expectedFingerprint = await getSharedDesignFingerprint(
        request,
        seed.designId,
        seed.shareToken,
      );
      expect(expectedFingerprint).toMatch(/[a-f0-9]{8}/);
      const publicApiResponse = await request.get(
        `/api/designs/${seed.designId}?shareToken=${seed.shareToken}`,
      );
      expect(publicApiResponse.status()).toBe(200);
      const publicApiText = await publicApiResponse.text();
      for (const privateValue of [
        rawPrivateSentinel,
        rawOuterTitle,
        rawOuterStyle,
        rawOuterBudget,
        privateOwnerName,
      ]) {
        expect(publicApiText).not.toContain(privateValue);
      }
      const publicApiBody = JSON.parse(publicApiText) as {
        title: string;
        style: string | null;
        budget: string | null;
        notes: string | null;
      };
      expect(publicApiBody).toMatchObject({
        title: seed.snapshot.title,
        style: seed.snapshot.style,
        budget: seed.snapshot.budget,
        notes: seed.snapshot.notes,
      });

      const response = await page.goto(`/share/${seed.shareToken}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      const viewer = page.getByTestId("share-viewer");
      await expect(viewer).toBeVisible({ timeout: 30_000 });
      await expect(viewer).toHaveAttribute("data-ready", "true", {
        timeout: 30_000,
      });
      await expect(page.getByText(/No editing in share view/i)).toBeVisible();
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        expectedFingerprint,
      );
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-item-count",
        "9",
      );
      await expect(page.getByTestId("share-floor-plan-preview")).toBeVisible();
      await expect(page.getByTestId("share-floor-plan-preview")).toContainText("Living Room");
      await expect(page.getByTestId("share-design-notes")).toContainText(
        "Deterministic beta smoke fixture.",
      );
      await expect(page.locator("h1").first()).toHaveText(seed.snapshot.title ?? "");
      await expect(page.getByText("Read-only • modern • mid", { exact: true })).toBeVisible();
      expect(await page.title()).toBe("Interior AI");
      const publicPageSource = await page.content();
      const publicPageMetadata = await page.locator("head").innerHTML();
      for (const privateValue of [
        rawPrivateSentinel,
        rawOuterTitle,
        rawOuterStyle,
        rawOuterBudget,
        privateOwnerName,
      ]) {
        expect(publicPageSource).not.toContain(privateValue);
        expect(publicPageMetadata).not.toContain(privateValue);
      }
      await expect(page.getByTestId("share-live-commerce")).toBeVisible();
      await expect(page.getByTestId("share-availability-warning")).toBeVisible();
      await expect(page.getByText("Editing creates a private copy in your account.")).toBeVisible();
      await expect(page.getByTestId("share-copy-to-edit")).toBeVisible();

      await expect(page.getByTestId("save-design")).toHaveCount(0);
      await expect(page.getByTestId("command-undo")).toHaveCount(0);
      await expect(page.getByTestId("selected-item-panel")).toHaveCount(0);
      await expect(page.getByTestId("create-share")).toHaveCount(0);

      await page.keyboard.press("Delete");
      await page.keyboard.press("Meta+Z");
      await viewer.locator("canvas").click({ position: { x: 80, y: 80 } });
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        expectedFingerprint,
      );
      expect(
        await getSharedDesignFingerprint(request, seed.designId, seed.shareToken),
      ).toBe(expectedFingerprint);

      const baseURL = new URL(page.url()).origin;
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      const duplicateResponse = await page.context().request.post(
        `${baseURL}/api/share/${seed.shareToken}/duplicate`,
      );
      expect(duplicateResponse.status()).toBe(200);
      const duplicateBody = await duplicateResponse.json() as { id: string };
      const duplicate = await prisma.design.findUniqueOrThrow({
        where: { id: duplicateBody.id },
        select: {
          title: true,
          style: true,
          budget: true,
          notes: true,
          snapshot: true,
        },
      });
      expect(duplicate).toMatchObject({
        title: `${seed.snapshot.title} (copy)`,
        style: seed.snapshot.style,
        budget: seed.snapshot.budget,
        notes: seed.snapshot.notes,
      });
      expect(JSON.stringify(duplicate)).not.toContain(rawPrivateSentinel);

      await page.goto(`/share/${seed.shareToken}/export`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("h1").first()).toHaveText(seed.snapshot.title ?? "");
      await expect(page.getByText("Prepared by: Interior AI", { exact: true })).toBeVisible();
      await expect(page.getByText("Style: modern", { exact: true })).toBeVisible();
      await expect(page.getByText("Budget: mid", { exact: true })).toBeVisible();
      await expect(page.getByText("Created:", { exact: false })).toHaveCount(0);
      const publicExportSource = await page.content();
      for (const privateValue of [
        rawPrivateSentinel,
        rawOuterTitle,
        rawOuterStyle,
        rawOuterBudget,
        privateOwnerName,
      ]) {
        expect(publicExportSource).not.toContain(privateValue);
      }

      const pdfResponse = await request.get(`/share/${seed.shareToken}/export/pdf`);
      expect(pdfResponse.status()).toBe(200);
      expect(pdfResponse.headers()["content-disposition"]).toContain(
        "beta-smoke-whole-home-presentation-pack.pdf",
      );
      const pdfBody = await pdfResponse.body();
      const pdfText = await extractPdfText(pdfBody);
      expect(pdfText).toContain(seed.snapshot.title);
      expect(pdfText).toContain(seed.snapshot.notes);
      expect(pdfText).toContain(`Style: ${seed.snapshot.style}`);
      expect(pdfText).toContain(`Budget: ${seed.snapshot.budget}`);
      for (const privateValue of [
        rawPrivateSentinel,
        rawOuterTitle,
        rawOuterStyle,
        rawOuterBudget,
        privateOwnerName,
      ]) {
        expect(pdfText).not.toContain(privateValue);
      }
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("shared design exposes and activates every saved presentation view", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    try {
      await page.goto(`/share/${seed.shareToken}`, {
        waitUntil: "domcontentloaded",
      });
      const viewer = page.getByTestId("share-viewer");
      await expect(viewer).toHaveAttribute("data-ready", "true", {
        timeout: 30_000,
      });
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-saved-view-count",
        "3",
      );
      const presentationViews = page.getByTestId("share-presentation-views");
      await expect(presentationViews).toContainText("Client Preview");
      await expect(presentationViews).toContainText("Dining Plan");
      await expect(presentationViews).toContainText("Bedroom Preview");

      const clientPreview = viewer.getByRole("button", {
        name: "Client Preview",
        exact: true,
      });
      await clientPreview.click();
      await expect(clientPreview).toHaveAttribute("aria-pressed", "true");

      await viewer.getByRole("button", { name: "Dining Room", exact: true }).click();
      const diningPlan = viewer.getByRole("button", {
        name: "Dining Plan",
        exact: true,
      });
      await expect(diningPlan).toBeVisible();
      await diningPlan.click();
      await expect(diningPlan).toHaveAttribute("aria-pressed", "true");

      await viewer.getByRole("button", { name: "Bedroom", exact: true }).click();
      const bedroomPreview = viewer.getByRole("button", {
        name: "Bedroom Preview",
        exact: true,
      });
      await expect(bedroomPreview).toBeVisible();
      await bedroomPreview.click();
      await expect(bedroomPreview).toHaveAttribute("aria-pressed", "true");
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
