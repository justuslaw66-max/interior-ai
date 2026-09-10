import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { digest, LIMITS } from './projection.mjs';
export const PARENT = '8dccb85a91f02b1620b1f69af42ce0010550e7fd';
export const FOUNDATION = 'd5deaba4874bb62278d4ec026f95f0ad4ef9d71c';
export const FOUNDATION_TREE = 'f1a01d07a0c417ff6c0388f21369723dbe4b9dab';
export const OBSERVATION_FILES = Object.freeze(['components/editor/design-page/designSceneDemandPolicy.tsx', 'components/editor/design-page/windowRenderingAttribution.ts', 'scripts/window-rendering-attribution.mjs', 'tests/e2e/00-runtime-smoke.spec.ts']);
export const MATERIAL_FILE = 'components/editor/renderers/GeneratedWindowFrame3D.tsx';
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: LIMITS.document });
const line = (root, args) => git(root, args).toString('utf8').trim();
export function verifyRetainedParent(root) {
  if (line(root, ['rev-parse', `${PARENT}^`]) !== FOUNDATION || line(root, ['rev-parse', `${FOUNDATION}^{tree}`]) !== FOUNDATION_TREE || line(root, ['diff', '--name-only', FOUNDATION, PARENT]) !== 'scripts/stable-runtime-smoke.mjs') throw new Error('source-delta');
  const before = git(root, ['show', `${FOUNDATION}:scripts/stable-runtime-smoke.mjs`]).toString('utf8');
  const needle = '  await createAndVerifyBundle({ ...context, runtime });\n';
  const insertion = '  context.testHooks?.beforeSuccessfulRootRemoval?.({\n    roots: context.roots,\n    paths,\n    lifecycleEnvironment: context.lifecycleEnvironment,\n    finalDatabase: finalization.finalDatabase,\n  });\n';
  if (before.split(needle).length !== 2 || !git(root, ['show', `${PARENT}:scripts/stable-runtime-smoke.mjs`]).equals(Buffer.from(before.replace(needle, needle + insertion)))) throw new Error('retention-delta');
}
export function verifySourceDelta(root, source) {
  verifyRetainedParent(root);
  if (!['A','B'].includes(source.id) || source.foundation !== FOUNDATION || source.foundationTree !== FOUNDATION_TREE || source.parent !== PARENT ||
      line(root, ['rev-list', '--parents', '-n', '1', source.commit]) !== `${source.commit} ${PARENT}` || line(root, ['rev-parse', `${source.commit}^{tree}`]) !== source.tree) throw new Error('source-delta');
  return verifyVariantTree(root, source.tree, source.id);
}
export function verifyVariantTree(root, tree, id) {
  if (!['A','B'].includes(id) || !/^[a-f0-9]{40}$/.test(tree)) throw new Error('source-delta');
  const files = [...OBSERVATION_FILES, ...(id === 'B' ? [MATERIAL_FILE] : [])].sort();
  if (line(root, ['diff', '--name-only', PARENT, tree]) !== files.join('\n')) throw new Error('source-delta');
  const approved = JSON.parse(fs.readFileSync(path.join(root, '.github/diagnostics/window-linux/observation-source.json'), 'utf8'));
  if (Object.keys(approved).sort().join('\n') !== [...OBSERVATION_FILES].sort().join('\n')) throw new Error('source-delta');
  for (const name of OBSERVATION_FILES) if (digest(git(root, ['show', `${tree}:${name}`])) !== approved[name]) throw new Error('source-delta');
  const original = git(root, ['show', `${PARENT}:${MATERIAL_FILE}`]).toString('utf8');
  if (original.split('transmission={0.5}').length !== 2) throw new Error('source-delta');
  const expected = id === 'B' ? original.replace('transmission={0.5}', 'transmission={0}') : original;
  if (!git(root, ['show', `${tree}:${MATERIAL_FILE}`]).equals(Buffer.from(expected))) throw new Error('source-delta');
  const lock = git(root, ['show', `${tree}:package-lock.json`]);
  if (!lock.equals(git(root, ['show', `${FOUNDATION}:package-lock.json`]))) throw new Error('lockfile-delta');
  return digest(lock);
}
export function verifyPairDelta(root, sources) {
  const [a,b] = sources;
  if (a.id !== 'A' || b.id !== 'B' || a.commit === b.commit || line(root, ['diff', '--name-only', a.commit, b.commit]) !== MATERIAL_FILE) throw new Error('source-delta');
  const before = git(root, ['show', `${a.commit}:${MATERIAL_FILE}`]).toString('utf8');
  if (!git(root, ['show', `${b.commit}:${MATERIAL_FILE}`]).equals(Buffer.from(before.replace('transmission={0.5}', 'transmission={0}')))) throw new Error('source-delta');
}
