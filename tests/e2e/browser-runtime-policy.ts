import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ConsoleMessage, Page, Request, Response } from "@playwright/test";

type CountedAllowance = {
  minCount: number;
  maxCount: number;
  reason: string;
  observed: number;
};

type AllowedHttpFailure = CountedAllowance & {
  method: string;
  url: string;
  status: number;
};

type AllowedConsoleMessage = CountedAllowance & {
  type: "error" | "warning";
  text: string | RegExp;
};

type AllowedRequestFailure = CountedAllowance & {
  method: string;
  url: string;
  errorText: string;
};

export type BrowserRuntimePolicy = ReturnType<typeof installBrowserRuntimePolicy>;

function describeResponse(response: Response) {
  return `${response.request().method()} ${response.status()} ${response.url()}`;
}

function consoleAllowanceMatches(
  allowance: AllowedConsoleMessage,
  message: ConsoleMessage,
) {
  return allowance.type === message.type() &&
    (typeof allowance.text === "string"
      ? allowance.text === message.text()
      : allowance.text.test(message.text()));
}

function requestFailureAllowanceMatches(
  allowance: AllowedRequestFailure,
  request: Request,
) {
  return allowance.method === request.method() &&
    allowance.url === request.url() &&
    allowance.errorText === request.failure()?.errorText;
}

function recordAllowedEvent<T extends CountedAllowance>(
  allowance: T,
  failures: string[],
  description: string,
) {
  allowance.observed += 1;
  if (allowance.observed > allowance.maxCount) {
    failures.push(`Allowance exceeded (${allowance.reason}): ${description}`);
  }
}

export function installBrowserRuntimePolicy(page: Page, testTitle: string) {
  const failures: string[] = [];
  const allowedHttpFailures: AllowedHttpFailure[] = [];
  const allowedConsoleMessages: AllowedConsoleMessage[] = [];
  const allowedRequestFailures: AllowedRequestFailure[] = [];

  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const allowance = allowedConsoleMessages.find((candidate) =>
      consoleAllowanceMatches(candidate, message)
    );
    if (allowance) {
      recordAllowedEvent(
        allowance,
        failures,
        `console.${message.type()}: ${message.text()}`,
      );
      return;
    }
    failures.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const allowance = allowedRequestFailures.find((candidate) =>
      requestFailureAllowanceMatches(candidate, request)
    );
    if (allowance) {
      recordAllowedEvent(
        allowance,
        failures,
        `${request.method()} ${request.url()} (${request.failure()?.errorText})`,
      );
      return;
    }
    failures.push(
      `requestfailed: ${request.method()} ${request.url()} ` +
        `(${request.failure()?.errorText ?? "unknown"})`,
    );
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const allowance = allowedHttpFailures.find((candidate) =>
      candidate.method === response.request().method() &&
      candidate.status === response.status() &&
      candidate.url === response.url()
    );
    if (!allowance) {
      failures.push(`unexpected HTTP response: ${describeResponse(response)}`);
      return;
    }
    recordAllowedEvent(allowance, failures, describeResponse(response));
  });

  return {
    allowHttpFailure(input: Omit<AllowedHttpFailure, "observed">) {
      allowedHttpFailures.push({ ...input, observed: 0 });
    },
    allowConsoleMessage(input: Omit<AllowedConsoleMessage, "observed">) {
      allowedConsoleMessages.push({ ...input, observed: 0 });
    },
    allowRequestFailure(input: Omit<AllowedRequestFailure, "observed">) {
      allowedRequestFailures.push({ ...input, observed: 0 });
    },
    assertSatisfied() {
      for (const allowance of [
        ...allowedHttpFailures,
        ...allowedConsoleMessages,
        ...allowedRequestFailures,
      ]) {
        if (allowance.observed < allowance.minCount) {
          failures.push(
            `Expected allowed event not observed (${allowance.reason}).`,
          );
        }
      }
      if (failures.length === 0) return;
      throw new Error(
        `Strict browser runtime policy failed for ${testTitle}:\n` +
          failures.map((failure) => `- ${failure}`).join("\n"),
      );
    },
  };
}

function readBuiltDesignChunkPaths() {
  const worktree = process.env.INDEPENDENT_WORKTREE ?? process.cwd();
  try {
    const html = readFileSync(
      join(worktree, ".next", "server", "app", "design.html"),
      "utf8",
    );
    return [...new Set(
      html.match(/\/_next\/static\/chunks\/[^"']+\.js/g) ?? [],
    )];
  } catch {
    return [];
  }
}

export function allowKnownChromiumDesignRuntimeEvents(
  policy: BrowserRuntimePolicy,
  baseUrl: string,
) {
  policy.allowConsoleMessage({
    type: "warning",
    text: /^\[\.WebGL-0x[\da-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/,
    minCount: 0,
    maxCount: 4,
    reason: "Chromium's software WebGL driver emits this bounded ReadPixels diagnostic",
  });
  for (const pathname of readBuiltDesignChunkPaths()) {
    policy.allowRequestFailure({
      method: "GET",
      url: new URL(pathname, baseUrl).href,
      errorText: "net::ERR_ABORTED",
      minCount: 0,
      maxCount: 2,
      reason: "Next cancels this exact built design chunk after branch selection",
    });
  }
}
