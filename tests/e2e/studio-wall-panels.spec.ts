import type { Page } from "@playwright/test";
import sharp from "sharp";
import { test, expect } from "./fixtures";
import { chooseTemplateStart } from "./multi-room/helpers";

const PANEL_ATTRIBUTE = "data-selected-wall-panel-id";

type PixelBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type WorkspaceGridLeakMetrics = {
  paintedPixelCount: number;
  p90LocalContrast: number;
};

async function frameLivingEastWall(page: Page) {
  const navigator = page.getByRole("region", { name: "Room view navigator" });
  const cameraHandle = page.getByRole("button", {
    name: "Drag camera position",
  });
  const navigatorBox = await navigator.boundingBox();
  const cameraBox = await cameraHandle.boundingBox();
  expect(navigatorBox).not.toBeNull();
  expect(cameraBox).not.toBeNull();
  if (!navigatorBox || !cameraBox) {
    throw new Error("Room-view navigator was not measurable.");
  }

  await page.mouse.move(
    cameraBox.x + cameraBox.width / 2,
    cameraBox.y + cameraBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    navigatorBox.x + 30,
    navigatorBox.y + 103,
    { steps: 5 }
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.waitForTimeout(800);
}

async function clickPanelAt(page: Page, x: number, y: number) {
  await page.mouse.click(x, y);
  const selectedInspector = page.locator(`[${PANEL_ATTRIBUTE}]`);
  await expect(selectedInspector).toBeVisible();
  const panelId = await selectedInspector.getAttribute(PANEL_ATTRIBUTE);
  expect(panelId).toBeTruthy();
  return panelId as string;
}

async function scanLivingEastPanels(page: Page) {
  const hits = new Map<string, Array<{ x: number; y: number }>>();
  const selectedInspector = page.locator(`[${PANEL_ATTRIBUTE}]`);
  for (const y of [160, 200, 240, 280, 320, 360]) {
    for (let x = 300; x <= 900; x += 30) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(40);
      if ((await selectedInspector.count()) === 0) continue;
      const panelId = await selectedInspector.getAttribute(PANEL_ATTRIBUTE);
      if (
        !panelId ||
        !panelId.includes("_living_") ||
        !panelId.includes(":east:")
      ) {
        continue;
      }
      const panelHits = hits.get(panelId) ?? [];
      panelHits.push({ x, y });
      hits.set(panelId, panelHits);
    }
  }
  return hits;
}

async function dragNavigatorHandle(
  page: Page,
  accessibleName: string,
  x: number,
  y: number
) {
  const handle = page.getByRole("button", { name: accessibleName });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error(`${accessibleName} was not measurable.`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}

async function setLivingEastWallAngle(
  page: Page,
  angleDeg: number,
  direction: 1 | -1
) {
  const livingRoom = page.getByRole("button", {
    name: /^Focus Living \/ Sleep$/,
  });
  const roomBox = await livingRoom.boundingBox();
  expect(roomBox).not.toBeNull();
  if (!roomBox) throw new Error("Living room navigator box was unavailable.");
  const targetX = roomBox.x + roomBox.width - 2;
  const targetY = roomBox.y + roomBox.height * 0.78;
  const cameraX = roomBox.x + 3;
  const normalDistance = Math.max(1, targetX - cameraX);
  const cameraY =
    targetY +
    direction *
      Math.tan(THREE_DEGREES_TO_RADIANS * angleDeg) *
      normalDistance;
  await dragNavigatorHandle(page, "Drag view center", targetX, targetY);
  await dragNavigatorHandle(page, "Drag camera position", cameraX, cameraY);
  await page.waitForTimeout(300);
}

const THREE_DEGREES_TO_RADIANS = Math.PI / 180;

async function wallPanelDiagonalMetrics(
  page: Page,
  suppliedBounds?: PixelBounds
) {
  const screenshot = await page.screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) throw new Error("Viewport size was unavailable.");
  const pixelScale = info.width / viewport.width;
  const channels = info.channels;
  const pixelAt = (x: number, y: number) => {
    const resolvedX = Math.max(0, Math.min(info.width - 1, Math.round(x)));
    const resolvedY = Math.max(0, Math.min(info.height - 1, Math.round(y)));
    const offset = (resolvedY * info.width + resolvedX) * channels;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!] as const;
  };

  const selectedPixels: Array<[number, number]> = [];
  const sceneMinX = Math.round(285 * pixelScale);
  const sceneMaxX = Math.round(995 * pixelScale);
  const sceneMinY = Math.round(35 * pixelScale);
  const sceneMaxY = Math.round(715 * pixelScale);
  for (let y = sceneMinY; y < sceneMaxY; y += 1) {
    for (let x = sceneMinX; x < sceneMaxX; x += 1) {
      const [red, green, blue] = pixelAt(x, y);
      if (
        blue > 155 &&
        blue - red > 75 &&
        blue - green > 55 &&
        red < 100 &&
        green < 175
      ) {
        selectedPixels.push([x, y]);
      }
    }
  }
  expect(selectedPixels.length).toBeGreaterThan(30 * pixelScale);

  let bounds = suppliedBounds;
  if (!bounds) {
    bounds = selectedPixels.reduce<PixelBounds>(
      (current, [x, y]) => ({
        minX: Math.min(current.minX, x),
        minY: Math.min(current.minY, y),
        maxX: Math.max(current.maxX, x),
        maxY: Math.max(current.maxY, y),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      }
    );
  }

  const inset = Math.max(8, Math.round(8 * pixelScale));
  const inner = {
    minX: bounds.minX + inset,
    minY: bounds.minY + inset,
    maxX: bounds.maxX - inset,
    maxY: bounds.maxY - inset,
  };
  expect(inner.maxX - inner.minX).toBeGreaterThan(35 * pixelScale);
  expect(inner.maxY - inner.minY).toBeGreaterThan(70 * pixelScale);
  const projectedWidth = bounds.maxX - bounds.minX;
  const projectedHeight = bounds.maxY - bounds.minY;
  const rowExtents = new Map<number, { min: number; max: number }>();
  const columnExtents = new Map<number, { min: number; max: number }>();
  selectedPixels.forEach(([x, y]) => {
    const row = rowExtents.get(y);
    rowExtents.set(y, {
      min: Math.min(row?.min ?? x, x),
      max: Math.max(row?.max ?? x, x),
    });
    const column = columnExtents.get(x);
    columnExtents.set(x, {
      min: Math.min(column?.min ?? y, y),
      max: Math.max(column?.max ?? y, y),
    });
  });
  const middleRows = Array.from(rowExtents.entries()).filter(
    ([y]) =>
      y >= bounds.minY + projectedHeight * 0.18 &&
      y <= bounds.maxY - projectedHeight * 0.18
  );
  const middleColumns = Array.from(columnExtents.entries()).filter(
    ([x]) =>
      x >= bounds.minX + projectedWidth * 0.18 &&
      x <= bounds.maxX - projectedWidth * 0.18
  );
  const oppositeVerticalEdgesVisible =
    middleRows.filter(
      ([, extent]) => extent.max - extent.min >= projectedWidth * 0.45
    ).length / Math.max(1, middleRows.length);
  const oppositeHorizontalEdgesVisible =
    middleColumns.filter(
      ([, extent]) => extent.max - extent.min >= projectedHeight * 0.45
    ).length / Math.max(1, middleColumns.length);
  const colorDistance = (
    first: readonly number[],
    second: readonly number[]
  ) =>
    Math.sqrt(
      first.reduce(
        (sum, channel, index) =>
          sum + (channel - (second[index] ?? channel)) ** 2,
        0
      ) / 3
    );
  const crossDiagonalDeltas = (rising: boolean) => {
    const values: number[] = [];
    const normalOffset = Math.max(2, Math.round(2 * pixelScale));
    for (let index = 12; index <= 88; index += 1) {
      const progress = index / 100;
      const x =
        inner.minX + (inner.maxX - inner.minX) * progress;
      const yProgress = rising ? 1 - progress : progress;
      const y =
        inner.minY + (inner.maxY - inner.minY) * yProgress;
      const first = pixelAt(
        x - normalOffset,
        y + (rising ? -normalOffset : normalOffset)
      );
      const second = pixelAt(
        x + normalOffset,
        y + (rising ? normalOffset : -normalOffset)
      );
      values.push(colorDistance(first, second));
    }
    values.sort((first, second) => first - second);
    return {
      mean:
        values.reduce((sum, value) => sum + value, 0) /
        Math.max(1, values.length),
      p90: values[Math.floor(values.length * 0.9)] ?? 0,
    };
  };

  return {
    bounds,
    falling: crossDiagonalDeltas(false),
    rising: crossDiagonalDeltas(true),
    oppositeVerticalEdgesVisible,
    oppositeHorizontalEdgesVisible,
  };
}

async function workspaceGridLeakMetrics(
  page: Page
): Promise<WorkspaceGridLeakMetrics> {
  const screenshot = await page.screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) throw new Error("Viewport size was unavailable.");
  const pixelScale = info.width / viewport.width;
  const channels = info.channels;
  const pixelAt = (x: number, y: number) => {
    const resolvedX = Math.max(0, Math.min(info.width - 1, Math.round(x)));
    const resolvedY = Math.max(0, Math.min(info.height - 1, Math.round(y)));
    const offset = (resolvedY * info.width + resolvedX) * channels;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!] as const;
  };
  const isPaintedRed = (x: number, y: number) => {
    const [red, green, blue] = pixelAt(x, y);
    return red > 70 && red - green > 18 && red - blue > 18;
  };
  const luminance = (x: number, y: number) => {
    const [red, green, blue] = pixelAt(x, y);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const localContrasts: number[] = [];
  const directions = [
    [3, 3],
    [3, -3],
    [3, 0],
    [0, 3],
  ] as const;
  const sceneMinX = Math.round(330 * pixelScale);
  const sceneMaxX = Math.round(1000 * pixelScale);
  const sceneMinY = Math.round(48 * pixelScale);
  const sceneMaxY = Math.round(710 * pixelScale);

  for (let y = sceneMinY; y < sceneMaxY; y += 1) {
    for (let x = sceneMinX; x < sceneMaxX; x += 1) {
      if (!isPaintedRed(x, y)) continue;
      let maximumContrast = 0;
      for (const [directionX, directionY] of directions) {
        const deltaX = Math.max(2, Math.round(directionX * pixelScale));
        const deltaY = Math.round(directionY * pixelScale);
        if (
          !isPaintedRed(x - deltaX, y - deltaY) ||
          !isPaintedRed(x + deltaX, y + deltaY)
        ) {
          continue;
        }
        const neighborMean =
          (luminance(x - deltaX, y - deltaY) +
            luminance(x + deltaX, y + deltaY)) /
          2;
        maximumContrast = Math.max(
          maximumContrast,
          Math.abs(luminance(x, y) - neighborMean)
        );
      }
      localContrasts.push(maximumContrast);
    }
  }

  localContrasts.sort((first, second) => first - second);
  return {
    paintedPixelCount: localContrasts.length,
    p90LocalContrast:
      localContrasts[Math.floor(localContrasts.length * 0.9)] ?? 0,
  };
}

async function wallPaintColorMetrics(
  page: Page,
  samplePoint: { x: number; y: number },
  authoredHex: string
) {
  const screenshot = await page.screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) throw new Error("Viewport size was unavailable.");
  const pixelScale = info.width / viewport.width;
  const channels = info.channels;
  const centerX = Math.round(samplePoint.x * pixelScale);
  const centerY = Math.round(samplePoint.y * pixelScale);
  const sampleRadius = Math.max(6, Math.round(10 * pixelScale));
  const channelSamples: [number[], number[], number[]] = [[], [], []];
  for (
    let y = centerY - sampleRadius;
    y <= centerY + sampleRadius;
    y += 1
  ) {
    for (
      let x = centerX - sampleRadius;
      x <= centerX + sampleRadius;
      x += 1
    ) {
      const offset = (y * info.width + x) * channels;
      channelSamples[0].push(data[offset]!);
      channelSamples[1].push(data[offset + 1]!);
      channelSamples[2].push(data[offset + 2]!);
    }
  }
  const median = (values: number[]) => {
    values.sort((first, second) => first - second);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  const renderedRgb = channelSamples.map(median) as [
    number,
    number,
    number,
  ];
  const authoredRgb = [
    Number.parseInt(authoredHex.slice(1, 3), 16),
    Number.parseInt(authoredHex.slice(3, 5), 16),
    Number.parseInt(authoredHex.slice(5, 7), 16),
  ] as const;
  const srgbToLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const relativeLuminance = (rgb: readonly number[]) =>
    0.2126 * srgbToLinear(rgb[0] ?? 0) +
    0.7152 * srgbToLinear(rgb[1] ?? 0) +
    0.0722 * srgbToLinear(rgb[2] ?? 0);
  return {
    renderedRgb,
    authoredRgb,
    luminanceRatio:
      relativeLuminance(renderedRgb) /
      Math.max(0.001, relativeLuminance(authoredRgb)),
    meanChannelDelta:
      renderedRgb.reduce(
        (sum, channel, index) =>
          sum + Math.abs(channel - (authoredRgb[index] ?? channel)),
        0
      ) / 3,
  };
}

async function rapidOrbitGridLeakMetrics(page: Page) {
  const navigator = page.getByRole("region", { name: "Room view navigator" });
  const cameraHandle = page.getByRole("button", {
    name: "Drag camera position",
  });
  const navigatorBox = await navigator.boundingBox();
  const cameraBox = await cameraHandle.boundingBox();
  expect(navigatorBox).not.toBeNull();
  expect(cameraBox).not.toBeNull();
  if (!navigatorBox || !cameraBox) {
    throw new Error("Room-view navigator was not measurable.");
  }
  const inset = 24;
  const orbitPoints = [
    { x: navigatorBox.x + inset, y: navigatorBox.y + inset },
    {
      x: navigatorBox.x + navigatorBox.width - inset,
      y: navigatorBox.y + inset,
    },
    {
      x: navigatorBox.x + navigatorBox.width - inset,
      y: navigatorBox.y + navigatorBox.height - inset,
    },
    {
      x: navigatorBox.x + inset,
      y: navigatorBox.y + navigatorBox.height - inset,
    },
    { x: navigatorBox.x + inset, y: navigatorBox.y + inset },
    {
      x: navigatorBox.x + navigatorBox.width - inset,
      y: navigatorBox.y + navigatorBox.height - inset,
    },
  ];
  const metrics: WorkspaceGridLeakMetrics[] = [];

  await page.mouse.move(
    cameraBox.x + cameraBox.width / 2,
    cameraBox.y + cameraBox.height / 2
  );
  await page.mouse.down();
  try {
    for (const point of orbitPoints) {
      await page.mouse.move(point.x, point.y, { steps: 1 });
      await page.waitForTimeout(24);
      metrics.push(await workspaceGridLeakMetrics(page));
    }
  } finally {
    await page.mouse.up();
  }

  return metrics;
}

test.describe("Studio canonical wall panels", () => {
  test("each Living east piece has one stable target and isolated material", async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      const sentinel = "__e2e_studio_wall_panels_storage_cleared";
      if (window.localStorage.getItem(sentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(sentinel, "1");
    });

    const runtimeFailures: string[] = [];
    page.on("pageerror", (error) => runtimeFailures.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      runtimeFailures.push(message.text());
    });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-studio").click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
      "4 rooms",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByRole("button", { name: "Focus room" })).toBeVisible({
      timeout: 30_000,
    });
    await frameLivingEastWall(page);

    const panelHits = await scanLivingEastPanels(page);
    expect(panelHits.size).toBe(3);
    const firstPanelEntry = [...panelHits].find(([panelId]) =>
      panelId.includes(":east:segment-start:")
    );
    const finalPanelEntry = [...panelHits].find(([panelId]) =>
      panelId.includes(":segment-end:interior")
    );
    const middlePanelEntry = [...panelHits].find(
      ([panelId]) =>
        !panelId.includes(":east:segment-start:") &&
        !panelId.includes(":segment-end:interior")
    );
    expect(firstPanelEntry).toBeTruthy();
    expect(middlePanelEntry).toBeTruthy();
    expect(finalPanelEntry).toBeTruthy();
    if (!firstPanelEntry || !middlePanelEntry || !finalPanelEntry) {
      throw new Error("Studio Living east panel identities were incomplete.");
    }
    const [_firstPanelId, firstHits] = firstPanelEntry;
    const [middlePanelId, middleHits] = middlePanelEntry;
    const [finalPanelId, finalHits] = finalPanelEntry;
    expect(firstHits.length).toBeGreaterThanOrEqual(1);
    expect(middleHits.length).toBeGreaterThanOrEqual(2);
    expect(finalHits.length).toBeGreaterThanOrEqual(2);
    expect(
      await clickPanelAt(page, middleHits[0].x, middleHits[0].y)
    ).toBe(middlePanelId);
    expect(
      await clickPanelAt(page, middleHits.at(-1)!.x, middleHits.at(-1)!.y)
    ).toBe(middlePanelId);
    expect(await clickPanelAt(page, finalHits[0].x, finalHits[0].y)).toBe(
      finalPanelId
    );
    expect(
      await clickPanelAt(page, finalHits.at(-1)!.x, finalHits.at(-1)!.y)
    ).toBe(finalPanelId);

    await clickPanelAt(page, middleHits[0].x, middleHits[0].y);
    const selectedInspector = page.locator(`[${PANEL_ATTRIBUTE}]`);
    await page.getByRole("button", { name: "Change material" }).click();
    await expect(selectedInspector).toHaveAttribute(
      PANEL_ATTRIBUTE,
      middlePanelId
    );
    await page.getByText("Anima Beige", { exact: true }).first().click();
    await expect(selectedInspector).toContainText("Anima Beige");

    await clickPanelAt(page, finalHits[0].x, finalHits[0].y);
    await expect(selectedInspector).toContainText("No wall material");
    await clickPanelAt(page, firstHits[0].x, firstHits[0].y);
    await expect(selectedInspector).toContainText("No wall material");

    await page.getByRole("button", { name: /^Undo/ }).click();
    await clickPanelAt(page, middleHits[0].x, middleHits[0].y);
    await expect(selectedInspector).toContainText("No wall material");

    await clickPanelAt(page, finalHits[0].x, finalHits[0].y);
    await page.getByRole("button", { name: "Focus room" }).click();
    await expect(page.getByRole("button", { name: "Show home" })).toBeVisible();
    const cdp = await context.newCDPSession(page);
    for (const deviceScaleFactor of [1, 2]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 720,
        deviceScaleFactor,
        mobile: false,
      });
      for (const direction of [1, -1] as const) {
        for (const angleDeg of [0.5, 1, 2, 5]) {
          await setLivingEastWallAngle(page, angleDeg, direction);
          const metrics = await wallPanelDiagonalMetrics(page);
          expect(
            Math.max(metrics.falling.mean, metrics.rising.mean),
            `No mean triangle seam at ${angleDeg}° direction ${direction} DPR ${deviceScaleFactor}`
          ).toBeLessThan(6);
          expect(
            Math.max(metrics.falling.p90, metrics.rising.p90),
            `No p90 triangle seam at ${angleDeg}° direction ${direction} DPR ${deviceScaleFactor}`
          ).toBeLessThan(12);
          expect(
            metrics.oppositeVerticalEdgesVisible,
            `Both vertical outline edges remain visible at ${angleDeg}° direction ${direction} DPR ${deviceScaleFactor}`
          ).toBeGreaterThan(0.65);
          expect(
            metrics.oppositeHorizontalEdgesVisible,
            `Both horizontal outline edges remain visible at ${angleDeg}° direction ${direction} DPR ${deviceScaleFactor}`
          ).toBeGreaterThan(0.65);
        }
      }
    }
    await page.getByRole("button", { name: "Show home" }).click();
    await expect(page.getByRole("button", { name: "Focus room" })).toBeVisible();
    await setLivingEastWallAngle(page, 2, 1);
    const entireHomeMetrics = await wallPanelDiagonalMetrics(page);
    expect(
      Math.max(
        entireHomeMetrics.falling.mean,
        entireHomeMetrics.rising.mean
      )
    ).toBeLessThan(6);
    expect(entireHomeMetrics.oppositeVerticalEdgesVisible).toBeGreaterThan(
      0.65
    );
    expect(entireHomeMetrics.oppositeHorizontalEdgesVisible).toBeGreaterThan(
      0.65
    );

    expect(
      runtimeFailures.filter(
        (message) =>
          /duplicate key|encountered two children|runtime error|uncaught/i.test(
            message
          )
      )
    ).toEqual([]);
  });

  test("Apply to room copies one selected finish to every wall in that room", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      const sentinel = "__e2e_studio_wall_apply_room_storage_cleared";
      if (window.localStorage.getItem(sentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(sentinel, "1");
    });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-studio").click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
      "4 rooms",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByRole("button", { name: "Focus room" })).toBeVisible({
      timeout: 30_000,
    });
    await frameLivingEastWall(page);

    const panelHits = await scanLivingEastPanels(page);
    expect(panelHits.size).toBe(3);
    const entries = [...panelHits.values()];
    const [firstHits, middleHits, finalHits] = entries;
    expect(firstHits?.[0]).toBeTruthy();
    expect(middleHits?.[0]).toBeTruthy();
    expect(finalHits?.[0]).toBeTruthy();
    if (!firstHits?.[0] || !middleHits?.[0] || !finalHits?.[0]) {
      throw new Error("Studio Living east panel hit points were incomplete.");
    }

    const selectedInspector = page.locator(`[${PANEL_ATTRIBUTE}]`);
    await clickPanelAt(page, middleHits[0].x, middleHits[0].y);
    await page.getByRole("button", { name: "Change material" }).click();
    await page.getByText("Anima Beige", { exact: true }).first().click();
    await expect(selectedInspector).toContainText("Anima Beige");
    const wallGrout = page.getByTestId("selection-inspector-wall-grout");
    await expect(wallGrout).toBeVisible();
    await wallGrout.getByTestId("wall-surface-joint-size-5").click();
    await expect(
      wallGrout.getByTestId("wall-surface-joint-size"),
    ).toContainText("5 mm");
    await wallGrout.getByTestId("wall-surface-joint-color").click();
    await expect(
      wallGrout.getByTestId("wall-surface-grout-color-palette"),
    ).toBeVisible();
    await wallGrout.getByTestId("wall-surface-grout-color-cc8a10").click();
    await expect(
      wallGrout.getByTestId("wall-surface-grout-color-palette"),
    ).toBeHidden();
    await expect(
      wallGrout.getByTestId("wall-surface-joint-color").locator("span"),
    ).toHaveCSS("background-color", "rgb(204, 138, 16)");
    await clickPanelAt(page, firstHits[0].x, firstHits[0].y);
    await expect(selectedInspector).toContainText("No wall material");
    await expect(page.getByTestId("selection-inspector-wall-grout")).toBeHidden();

    await clickPanelAt(page, middleHits[0].x, middleHits[0].y);
    await page.getByTestId("selection-inspector-wall-apply-room").click();
    await clickPanelAt(page, firstHits[0].x, firstHits[0].y);
    await expect(selectedInspector).toContainText("Anima Beige");
    await expect(
      page.getByTestId("wall-surface-joint-size"),
    ).toContainText("5 mm");
    await expect(
      page.getByTestId("wall-surface-joint-color").locator("span"),
    ).toHaveCSS("background-color", "rgb(204, 138, 16)");
    await clickPanelAt(page, finalHits[0].x, finalHits[0].y);
    await expect(selectedInspector).toContainText("Anima Beige");

    await page.getByRole("button", { name: /^Undo/ }).click();
    await clickPanelAt(page, firstHits[0].x, firstHits[0].y);
    await expect(selectedInspector).toContainText("No wall material");
    await clickPanelAt(page, middleHits[0].x, middleHits[0].y);
    await expect(selectedInspector).toContainText("Anima Beige");
    await expect(
      page.getByTestId("wall-surface-joint-size"),
    ).toContainText("5 mm");
    await expect(
      page.getByTestId("wall-surface-joint-color").locator("span"),
    ).toHaveCSS("background-color", "rgb(204, 138, 16)");
  });

  test("rapid orbit never reveals the workspace grid through returning walls", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      const sentinel = "__e2e_studio_wall_grid_flash_storage_cleared";
      if (window.localStorage.getItem(sentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(sentinel, "1");
    });

    const runtimeFailures: string[] = [];
    page.on("pageerror", (error) => runtimeFailures.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      runtimeFailures.push(message.text());
    });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-studio").click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
      "4 rooms",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByRole("button", { name: "Focus room" })).toBeVisible({
      timeout: 30_000,
    });
    await frameLivingEastWall(page);

    const panelHits = await scanLivingEastPanels(page);
    expect(panelHits.size).toBe(3);
    const widestPanelHits = [...panelHits.values()].sort(
      (first, second) => second.length - first.length
    )[0];
    expect(widestPanelHits?.[0]).toBeTruthy();
    if (!widestPanelHits?.[0]) {
      throw new Error("A Living east wall panel was not available.");
    }
    await clickPanelAt(page, widestPanelHits[0].x, widestPanelHits[0].y);
    await page.getByRole("button", { name: "Change material" }).click();
    await page.getByTestId("wall-surface-mode-paint").click();
    await page.getByTestId("wall-paint-search").fill("Spanish Red");
    await page
      .getByTestId("wall-paint-swatch-nippon-0803-spanish-red")
      .click();
    await page.getByTestId("selection-inspector-wall-apply-room").click();
    await page.waitForTimeout(300);

    const orbitMetrics = await rapidOrbitGridLeakMetrics(page);
    const measurableFrames = orbitMetrics.filter(
      (metrics) => metrics.paintedPixelCount > 1_000
    );
    expect(measurableFrames.length).toBeGreaterThanOrEqual(4);
    expect(
      Math.max(
        ...measurableFrames.map((metrics) => metrics.p90LocalContrast)
      ),
      "Fast camera movement must not expose high-contrast workspace grid lines through painted wall pixels."
    ).toBeLessThan(8);
    expect(
      runtimeFailures.filter((message) =>
        /duplicate key|encountered two children|runtime error|uncaught/i.test(
          message
        )
      )
    ).toEqual([]);
  });

  test("Angel Pink paint remains perceptually close to its authored swatch", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      const sentinel = "__e2e_studio_wall_paint_color_storage_cleared";
      if (window.localStorage.getItem(sentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(sentinel, "1");
    });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-studio").click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
      "4 rooms",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByRole("button", { name: "Focus room" })).toBeVisible({
      timeout: 30_000,
    });
    await frameLivingEastWall(page);

    const panelHits = await scanLivingEastPanels(page);
    const widestPanelHits = [...panelHits.values()].sort(
      (first, second) => second.length - first.length
    )[0];
    expect(widestPanelHits?.[0]).toBeTruthy();
    if (!widestPanelHits?.[0]) {
      throw new Error("A Living east wall panel was not available.");
    }
    await clickPanelAt(page, widestPanelHits[0].x, widestPanelHits[0].y);
    await page.getByRole("button", { name: "Change material" }).click();
    await page.getByTestId("wall-surface-mode-paint").click();
    await page.getByTestId("wall-paint-search").fill("Angel Pink");
    await page
      .getByTestId("wall-paint-swatch-nippon-1162-angel-pink")
      .click();
    await page.waitForTimeout(300);

    const samplePoint = {
      x:
        widestPanelHits.reduce((sum, hit) => sum + hit.x, 0) /
        widestPanelHits.length,
      y:
        widestPanelHits.reduce((sum, hit) => sum + hit.y, 0) /
        widestPanelHits.length,
    };
    const colorMetrics = await wallPaintColorMetrics(
      page,
      samplePoint,
      "#FBF1F2"
    );
    expect(colorMetrics.luminanceRatio).toBeGreaterThan(0.8);
    expect(colorMetrics.luminanceRatio).toBeLessThan(0.95);
    expect(colorMetrics.meanChannelDelta).toBeLessThan(26);
    expect(
      colorMetrics.renderedRgb[0] -
        (colorMetrics.renderedRgb[1] + colorMetrics.renderedRgb[2]) / 2
    ).toBeGreaterThan(1);

    await page.getByTestId("wall-paint-family-clear").click();
    await page.getByTestId("wall-paint-search").fill("Spanish Red");
    await page
      .getByTestId("wall-paint-swatch-nippon-0803-spanish-red")
      .click();
    await page.waitForTimeout(300);
    const midToneMetrics = await wallPaintColorMetrics(
      page,
      samplePoint,
      "#C2756D"
    );
    expect(midToneMetrics.luminanceRatio).toBeGreaterThan(0.68);
    expect(midToneMetrics.luminanceRatio).toBeLessThan(1);
    expect(midToneMetrics.meanChannelDelta).toBeLessThan(25);
    expect(
      midToneMetrics.renderedRgb[0] -
        Math.max(
          midToneMetrics.renderedRgb[1],
          midToneMetrics.renderedRgb[2]
        )
    ).toBeGreaterThan(55);
  });
});
