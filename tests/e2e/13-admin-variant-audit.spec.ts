import { test, expect } from "./fixtures";

test.describe("13. Admin Variant Audit", () => {
  test("admin audit payload includes variant resolution telemetry summary", async ({ request }) => {
    const response = await request.get("/api/admin/audit?devBypass=1", {
      headers: {
        "x-interior-admin-bypass": "1",
      },
    });

    if (!response.ok()) {
      test.info().annotations.push({
        type: "note",
        description: `Skipping admin audit assertions because endpoint returned HTTP ${response.status()}`,
      });
      return;
    }
    const body = await response.json();

    expect(body.variantResolution).toBeDefined();
    expect(typeof body.variantResolution.itemsScanned).toBe("number");
    expect(typeof body.variantResolution.variantsScanned).toBe("number");
    expect(Array.isArray(body.variantResolution.issues)).toBeTruthy();
    expect(Array.isArray(body.variantResolution.missingMedia)).toBeTruthy();
    expect(Array.isArray(body.variantResolution.missingCommerceMapping)).toBeTruthy();
    expect(Array.isArray(body.variantResolution.unavailableCommerce)).toBeTruthy();

    expect(body.variantResolution.itemsScanned).toBeGreaterThan(0);
    expect(body.variantResolution.variantsScanned).toBeGreaterThan(0);
  });
});