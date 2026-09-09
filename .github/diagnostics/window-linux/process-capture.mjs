import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { LIMITS, SIGNALS } from './projection.mjs';

const MARKERS = new Set(['runtime-smoke-browser-heartbeat-observation', 'runtime-smoke-browser-callback-requested', 'runtime-smoke-browser-callback-observation', 'runtime-smoke-browser-callback-timing', 'runtime-smoke-readiness-observation']);

export function createStreamProjection(project, stamp = () => ({})) {
  const events = []; const counters = { bytes: 0, lines: 0, omitted: 0, malformed: 0, capped: 0, projectionMs: 0 };
  let partial = Buffer.alloc(0); let dropping = false;
  function line(bytes) {
    counters.lines++; const start = performance.now();
    try {
      const text = bytes.toString('utf8');
      if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text) || Buffer.from(text).compare(bytes) !== 0) { counters.omitted++; return; }
      const match = /^\[([a-z-]+)\] (\{.*\})$/.exec(text);
      if (!match || !MARKERS.has(match[1])) { counters.omitted++; return; }
      const value = project(JSON.parse(match[2]));
      if (value === null) { counters.omitted++; return; }
      if (events.length >= LIMITS.events) { counters.capped++; return; }
      events.push({ ordinal: events.length + 1, ...stamp(), value });
    } catch { counters.malformed++; }
    finally { counters.projectionMs += performance.now() - start; }
  }
  return {
    consume(chunk) {
      counters.bytes += chunk.length;
      for (let offset = 0; offset < chunk.length;) {
        const newline = chunk.indexOf(10, offset); const end = newline < 0 ? chunk.length : newline;
        if (!dropping) {
          if (partial.length + end - offset > LIMITS.line) { partial = Buffer.alloc(0); dropping = true; counters.capped++; }
          else partial = Buffer.concat([partial, chunk.subarray(offset, end)]);
        }
        if (newline < 0) break;
        if (!dropping) line(partial);
        partial = Buffer.alloc(0); dropping = false; offset = newline + 1;
      }
    },
    finish() { if (partial.length || dropping) counters.omitted++; partial = Buffer.alloc(0); return { events, counters }; },
  };
}

export async function runCaptured({ command, args, cwd, environment, privateLog, project = () => null }) {
  const fd = fs.openSync(privateLog, 'wx', 0o600); let retained = 0; let rawCapped = false; let observerIoErrors = 0;
  const started = performance.now(); let eventSequence = 0;
  const stamp = () => ({ hostReceiptSequence: ++eventSequence, hostReceiptElapsedMs: performance.now() - started });
  const stdout = createStreamProjection(project, stamp); const stderr = createStreamProjection(project, stamp);
  const hash = createHash('sha256');
  let child;
  try { child = spawn(command, args, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch {
    try { fs.closeSync(fd); } catch { observerIoErrors++; }
    return { exitCode: null, signal: null, spawnFailed: true, elapsedMs: performance.now() - started, rawRetainedBytes: 0, rawCapped: false, observerIoErrors,
      rawSha256: hash.digest('hex'), stdout: stdout.finish(), stderr: stderr.finish() };
  }
  const observe = (stream, chunk) => {
    try {
      stream.consume(chunk);
      const remaining = 128 * 1024 * 1024 - retained;
      const bytes = chunk.subarray(0, Math.max(0, remaining)); let offset = 0;
      while (offset < bytes.length) {
        const count = fs.writeSync(fd, bytes, offset, bytes.length - offset);
        if (count <= 0) throw new Error('private-log-write');
        hash.update(bytes.subarray(offset, offset + count)); offset += count; retained += count;
      }
      if (bytes.length < chunk.length) rawCapped = true;
    } catch { observerIoErrors++; }
  };
  child.stdout.on('data', chunk => observe(stdout, chunk)); child.stderr.on('data', chunk => observe(stderr, chunk));
  let spawnFailed = false; child.on('error', () => { spawnFailed = true; });
  const result = await new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal: signal === null || SIGNALS.includes(signal) ? signal : 'unrecognized-signal' })));
  try { fs.closeSync(fd); } catch { observerIoErrors++; }
  return { exitCode: result.code, signal: result.signal, spawnFailed, elapsedMs: performance.now() - started, rawRetainedBytes: retained, rawCapped, observerIoErrors,
    rawSha256: hash.digest('hex'), stdout: stdout.finish(), stderr: stderr.finish() };
}
