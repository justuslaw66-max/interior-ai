#!/usr/bin/env node

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3000";
const route = process.env.DEV_SMOKE_ROUTE ?? "/design";
const expectedText = process.env.DEV_SMOKE_TEXT ?? "Living Room";
const targetUrl = new URL(route, baseUrl).toString();

async function main() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  try {
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const status = response?.status() ?? 0;
    const visible = await page
      .waitForFunction((text) => document.body?.innerText.includes(text), expectedText, {
        timeout: 30000,
      })
      .then(() => true)
      .catch(() => false);

    if (status < 200 || status >= 400 || !visible || errors.length > 0) {
      console.log("Status: smoke failed");
      console.log(`Action: inspect ${targetUrl} and the dev server log`);
      console.log(`- url: ${targetUrl}`);
      console.log(`- status: ${status}`);
      console.log(`- expected text visible: ${visible}`);
      for (const error of errors.slice(0, 10)) {
        console.log(`- browser error: ${error}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("Status: smoke passed");
    console.log("Action: none");
    console.log(`- url: ${targetUrl}`);
    console.log(`- status: ${status}`);
    console.log(`- expected text visible: ${visible}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.log("Status: smoke failed");
  console.log("Action: make sure the dev server is running, then inspect the script error");
  console.log(`- ${error?.stack ?? error?.message ?? String(error)}`);
  process.exitCode = 1;
});
