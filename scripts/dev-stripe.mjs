#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const baseUrl = "http://127.0.0.1:3000";
const verifyMode = process.argv.includes("--test");
const children = [];
let tempHome = null;
let shuttingDown = false;

loadEnvConfig(rootDir, true);

function fail(message) {
  throw new Error(message);
}

function redact(value) {
  return String(value)
    .replace(/(?:sk|rk)_test_[A-Za-z0-9_]+/g, "<redacted-test-key>")
    .replace(/whsec_[A-Za-z0-9_]+/g, "<redacted-webhook-secret>");
}

function readStripeCliKey() {
  const configured = process.env.STRIPE_SECRET_KEY?.trim();
  if (configured) {
    if (!/^(?:sk|rk)_test_/.test(configured)) {
      fail("STRIPE_SECRET_KEY must be a Stripe test key for the local test stack");
    }
    return configured;
  }

  const configPath = path.join(os.homedir(), ".config", "stripe", "config.toml");
  if (!fs.existsSync(configPath)) {
    fail("Stripe CLI is not logged in. Run `stripe login` first.");
  }

  const content = fs.readFileSync(configPath, "utf8");
  const key = content.match(/^\s*test_mode_api_key\s*=\s*["']([^"']+)["']/m)?.[1];
  if (!key || !/^(?:sk|rk)_test_/.test(key)) {
    fail("The Stripe CLI profile does not contain a usable test key. Run `stripe login` again.");
  }

  const expiryRaw = content.match(/^\s*test_mode_key_expires_at\s*=\s*["']?([^\n"']+)/m)?.[1]?.trim();
  if (expiryRaw) {
    const expiry = Number(expiryRaw);
    if (Number.isFinite(expiry) && expiry > 0 && expiry * 1000 <= Date.now()) {
      fail("The Stripe CLI test key has expired. Run `stripe login` again.");
    }
  }

  return key;
}

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is required for the local Pro billing test stack");
  const parsed = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    fail(`Refusing to run Stripe test fixtures against non-local database host ${parsed.hostname}`);
  }
}

function priceMatches(price, { amount, interval }) {
  return (
    price.active === true &&
    price.livemode === false &&
    price.type === "recurring" &&
    price.currency === "sgd" &&
    price.unit_amount === amount &&
    price.recurring?.interval === interval &&
    price.recurring?.interval_count === 1
  );
}

async function resolvePrices(stripe) {
  const requestedMonthly = process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
  const requestedYearly = process.env.STRIPE_PRICE_PRO_YEARLY?.trim();

  if (requestedMonthly || requestedYearly) {
    if (!requestedMonthly || !requestedYearly || requestedMonthly === requestedYearly) {
      fail("Configured monthly/yearly Stripe test price IDs must both exist and be distinct");
    }
    const [monthly, yearly] = await Promise.all([
      stripe.prices.retrieve(requestedMonthly),
      stripe.prices.retrieve(requestedYearly),
    ]);
    if (!priceMatches(monthly, { amount: 2990, interval: "month" })) {
      fail("STRIPE_PRICE_PRO_MONTHLY is not the active SGD 29.90 monthly test price");
    }
    if (!priceMatches(yearly, { amount: 24990, interval: "year" })) {
      fail("STRIPE_PRICE_PRO_YEARLY is not the active SGD 249.90 yearly test price");
    }
    if (monthly.product !== yearly.product) {
      fail("Monthly and yearly Pro prices must belong to the same Stripe product");
    }
    return { monthly, yearly };
  }

  const prices = await stripe.prices.list({ active: true, type: "recurring", limit: 100 });
  const monthly = prices.data.filter((price) =>
    priceMatches(price, { amount: 2990, interval: "month" })
  );
  const yearly = prices.data.filter((price) =>
    priceMatches(price, { amount: 24990, interval: "year" })
  );
  const pairs = monthly.flatMap((monthPrice) =>
    yearly
      .filter((yearPrice) => monthPrice.product === yearPrice.product)
      .map((yearPrice) => ({ monthly: monthPrice, yearly: yearPrice }))
  );

  if (pairs.length !== 1) {
    fail(
      "Could not resolve one unambiguous SGD 29.90/month + SGD 249.90/year Stripe test price pair"
    );
  }
  return pairs[0];
}

async function assertPortalConfigured(stripe) {
  const configurations = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  if (configurations.data.length === 0) {
    fail("Stripe Billing Portal has no active test configuration");
  }
}

function isPortAvailable() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(3000, "127.0.0.1");
  });
}

function spawnOwned(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    detached: process.platform !== "win32",
    ...options,
  });
  children.push(child);
  return child;
}

function killOwned(child, signal = "SIGTERM") {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // Process already exited.
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [...children].reverse()) killOwned(child);
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (tempHome) fs.rmSync(tempHome, { recursive: true, force: true });
  process.exitCode = exitCode;
}

function startWebhookListener(stripeKey) {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "interior-ai-stripe-"));
  const configDir = path.join(tempHome, ".config", "stripe");
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });

  return new Promise((resolve, reject) => {
    const listener = spawnOwned(
      "stripe",
      [
        "listen",
        "--skip-update",
        "--api-key",
        stripeKey,
        "--forward-to",
        `${baseUrl}/api/stripe/webhook`,
      ],
      {
        env: {
          ...process.env,
          HOME: tempHome,
          XDG_CONFIG_HOME: path.join(tempHome, ".config"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let combined = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) reject(new Error("Timed out waiting for Stripe webhook listener"));
    }, 30000);

    const handleChunk = (chunk) => {
      const text = chunk.toString();
      combined += text;
      const secret = combined.match(/whsec_[A-Za-z0-9_]+/)?.[0];
      if (secret && !settled) {
        settled = true;
        clearTimeout(timer);
        console.log("Stripe test webhook listener ready.");
        resolve({ listener, webhookSecret: secret });
        return;
      }
      if (settled) process.stdout.write(redact(text));
    };

    listener.stdout.on("data", handleChunk);
    listener.stderr.on("data", handleChunk);
    listener.once("exit", (code) => {
      clearTimeout(timer);
      if (!settled) reject(new Error(`Stripe listener exited early (${code ?? "unknown"})`));
    });
  });
}

async function waitForServer(child) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`Next dev server exited early (${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { redirect: "manual" });
      if (response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (child.exitCode !== null) {
          fail(`Next dev server exited early (${child.exitCode})`);
        }
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  fail("Timed out waiting for the Next dev server");
}

async function run() {
  assertLocalDatabase();
  if (!(await isPortAvailable())) {
    fail("Port 3000 is already in use. Run `npm run dev:stop` before `npm run dev:stripe`.");
  }

  const stripeKey = readStripeCliKey();
  const stripe = new Stripe(stripeKey);
  const account = await stripe.accounts.retrieve();
  if (account.charges_enabled === undefined) fail("Unable to validate the Stripe test account");
  const prices = await resolvePrices(stripe);
  await assertPortalConfigured(stripe);
  const { webhookSecret } = await startWebhookListener(stripeKey);

  const childEnv = {
    ...process.env,
    APP_ENV: "development",
    NEXT_PUBLIC_APP_ENV: "development",
    APP_ORIGIN: baseUrl,
    AUTH_URL: baseUrl,
    NEXTAUTH_URL: baseUrl,
    FEATURE_CHECKOUT: "true",
    STRIPE_SECRET_KEY: stripeKey,
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    STRIPE_PRICE_PRO_MONTHLY: prices.monthly.id,
    STRIPE_PRICE_PRO_YEARLY: prices.yearly.id,
  };
  delete childEnv.VERCEL_ENV;

  console.log(
    `Validated Stripe test plans: SGD ${(prices.monthly.unit_amount / 100).toFixed(2)}/month and SGD ${(prices.yearly.unit_amount / 100).toFixed(2)}/year.`
  );

  const next = spawnOwned("npm", ["run", "dev:hot"], {
    env: childEnv,
    stdio: "inherit",
  });
  await waitForServer(next);

  if (verifyMode) {
    const test = spawnOwned(process.execPath, ["scripts/test-pro-billing-local.mjs"], {
      env: { ...childEnv, PRO_BILLING_BASE_URL: baseUrl },
      stdio: "inherit",
    });
    const code = await new Promise((resolve) => test.once("exit", (value) => resolve(value ?? 1)));
    await shutdown(code);
    return;
  }

  console.log(`Pro billing test stack ready at ${baseUrl}. Press Ctrl+C to stop.`);
  await new Promise((resolve) => {
    if (next.exitCode !== null) resolve(next.exitCode);
    else next.once("exit", resolve);
  });
  await shutdown(next.exitCode ?? 0);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

run().catch(async (error) => {
  console.error(`Pro billing test stack failed: ${redact(error?.message ?? error)}`);
  await shutdown(1);
});
