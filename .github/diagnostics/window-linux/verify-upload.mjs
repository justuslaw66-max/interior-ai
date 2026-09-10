import fs from 'node:fs';
import path from 'node:path';
import { readOwnedPhysicalFile } from './retention.mjs';
import { LIMITS, digest } from './projection.mjs';

export function verifyUpload(publication) {
  const indexBytes = readOwnedPhysicalFile(publication, path.join(publication, 'inventory.json'));
  const inventory = JSON.parse(indexBytes);
  if (inventory.classification !== 'DIAGNOSTIC_ONLY' || Object.keys(inventory).sort().join(',') !== 'classification,files' || !Array.isArray(inventory.files) || inventory.files.length > 7 || inventory.files.length === 0) throw new Error('upload-index');
  const allowed = new Set(['campaign.json', ...['A', 'B'].flatMap(id => ['retention.json', 'runtime-report.json', 'phase-timings.json'].map(name => `${id}/${name}`))]);
  const names = inventory.files.map(item => item.name);
  if (new Set(names).size !== names.length || !names.includes('campaign.json') || names.some(name => !allowed.has(name))) throw new Error('upload-names');
  const actual = [];
  for (const entry of fs.readdirSync(publication, { withFileTypes: true })) {
    if (entry.isFile()) actual.push(entry.name);
    else if (entry.isDirectory() && ['A', 'B'].includes(entry.name)) {
      for (const nested of fs.readdirSync(path.join(publication, entry.name), { withFileTypes: true })) {
        if (!nested.isFile()) throw new Error('upload-nonregular');
        actual.push(`${entry.name}/${nested.name}`);
      }
    } else throw new Error('upload-nonregular');
  }
  if (actual.sort().join('\n') !== [...names, 'inventory.json'].sort().join('\n')) throw new Error('upload-inventory-changed');
  let total = indexBytes.length;
  for (const item of inventory.files) {
    if (Object.keys(item).sort().join(',') !== 'bytes,name,sha256' || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('upload-descriptor');
    total += item.bytes; if (total > LIMITS.artifact) throw new Error('upload-cap');
    const bytes = readOwnedPhysicalFile(publication, path.join(publication, item.name), item.bytes);
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error('upload-content-changed');
  }
  return { files: names.length + 1, bytes: total };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const root = path.join(process.env.RUNNER_TEMP, 'window-linux-standing-r1-02');
    if (readOwnedPhysicalFile(root, path.join(root, 'upload-ready'), 32).toString('utf8') !== 'ALLOWLISTED\n') throw new Error('upload-not-ready');
    verifyUpload(path.join(root, 'sanitized'));
  } catch { process.exitCode = 1; }
}
