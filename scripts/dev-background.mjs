#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const port = Number(process.env.DEV_PORT ?? process.env.PORT ?? 3000);
const logPath = process.env.DEV_BACKGROUND_LOG ?? "/tmp/interior-ai-next-dev.log";
const pidPath = process.env.DEV_BACKGROUND_PID ?? "/tmp/interior-ai-next-dev.pid";

function canConnect(host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

if ((await canConnect("127.0.0.1")) || (await canConnect("localhost"))) {
  console.log(`Dev server already responding on port ${port}.`);
  process.exit(0);
}

const logFd = fs.openSync(logPath, "a");
fs.writeSync(logFd, `\n\n[dev:bg] starting at ${new Date().toISOString()}\n`);

const child = spawn("npm", ["run", "dev"], {
  cwd: rootDir,
  detached: true,
  env: process.env,
  stdio: ["ignore", logFd, logFd],
});

child.unref();
fs.writeFileSync(pidPath, `${child.pid}\n`);
console.log(`Started detached dev server pid ${child.pid} on port ${port}.`);
console.log(`Log: ${logPath}`);
