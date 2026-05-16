import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";

export function createPngPlaceholder(outPath: string): void {
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4//8/AwAI/AL+X7m7WQAAAABJRU5ErkJggg==",
    "base64"
  );
  fs.writeFileSync(outPath, png1x1);
}

async function withStaticServer(rootDir: string, run: (urlBase: string) => Promise<void>): Promise<void> {
  const server = http.createServer((req, res) => {
    const reqUrl = req.url ?? "/";
    const pathname = reqUrl.split("?")[0] || "/";
    const filePath = path.join(rootDir, pathname === "/" ? "thumb.html" : pathname.slice(1));

    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === ".html"
        ? "text/html"
        : ext === ".glb"
          ? "model/gltf-binary"
          : ext === ".js"
            ? "application/javascript"
            : "application/octet-stream";

    res.setHeader("Content-Type", type);
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Unable to resolve temporary thumbnail server port.");
    }
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function generateModelThumbnail(
  modelFilePath: string,
  outPath: string,
  size: number
): Promise<{ ok: boolean; reason?: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumb-render-"));
  try {
    const tempModelPath = path.join(tempDir, "model.glb");
    fs.copyFileSync(modelFilePath, tempModelPath);

    const thumbHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #f4f1eb; }
      .wrap {
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at 25% 20%, #ffffff 0%, #f4f1eb 50%, #ece7dd 100%);
      }
      model-viewer {
        width: 92vw;
        height: 92vh;
      }
    </style>
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  </head>
  <body>
    <div class="wrap">
      <model-viewer
        id="mv"
        src="/model.glb"
        camera-controls
        disable-pan
        exposure="1"
        shadow-intensity="1"
        camera-orbit="45deg 30deg 2.8m"
        camera-target="0m 0.5m 0m"
        environment-image="neutral"
      ></model-viewer>
    </div>
  </body>
</html>`;

    fs.writeFileSync(path.join(tempDir, "thumb.html"), thumbHtml, "utf8");

    await withStaticServer(tempDir, async (urlBase) => {
      const playwright = await import("@playwright/test");
      const browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      try {
        await page.goto(`${urlBase}/thumb.html`, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(1800);
        await page.locator("#mv").screenshot({ path: outPath });
      } finally {
        await browser.close();
      }
    });

    return { ok: fs.existsSync(outPath) };
  } catch (error) {
    const err = error as Error;
    return { ok: false, reason: err.message || "unknown thumbnail render failure" };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
