import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
  certificationBuildGeneratedOutputIssues,
  finalizeCertificationBuildGeneratedOutput,
  preflightCertificationBuildGeneratedOutput,
} from "./production-certification-build-generated-output.mjs";

function git(root, args) {
  const child = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
}

const identity = Object.freeze({
  certificationId: "build-output-certification",
  candidateId: "build-output-candidate",
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  nextBuildId: "build-output-id",
  artifactSha256: "c".repeat(64),
  productionManifestSha256: "d".repeat(64),
  semanticJournalSha256: "e".repeat(64),
  semanticJournalNonce: "123e4567-e89b-42d3-a456-426614174001",
});

const root = mkdtempSync(path.join(tmpdir(), "cert-build-generated-output-"));
try {
  writeFileSync(path.join(root, ".gitignore"), "next-env.d.ts\n.next/\n");
  writeFileSync(path.join(root, "sentinel.txt"), "preserve\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Certification fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);

  const preflight = preflightCertificationBuildGeneratedOutput({
    repositoryRoot: root,
  });
  writeFileSync(
    path.join(root, "next-env.d.ts"),
    NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
  );
  mkdirSync(path.join(root, ".next"));
  writeFileSync(path.join(root, ".next/BUILD_ID"), "retained-build\n");
  const evidence = finalizeCertificationBuildGeneratedOutput({
    repositoryRoot: root,
    preflight,
    identity,
  });
  assert.deepEqual(certificationBuildGeneratedOutputIssues(evidence, identity), []);
  assert.equal(existsSync(path.join(root, "next-env.d.ts")), false);
  assert.equal(
    readFileSync(path.join(root, ".next/BUILD_ID"), "utf8"),
    "retained-build\n",
  );
  assert.equal(existsSync(path.join(root, "sentinel.txt")), true);

  const tampered = structuredClone(evidence);
  tampered.cleanup.postCleanupAbsenceProof = false;
  assert.match(
    certificationBuildGeneratedOutputIssues(tampered, identity).join("\n"),
    /cleanup|seal/,
  );
  assert.match(
    certificationBuildGeneratedOutputIssues(evidence, {
      ...identity,
      artifactSha256: "f".repeat(64),
    }).join("\n"),
    /identity does not match/,
  );

  writeFileSync(path.join(root, "next-env.d.ts"), "pre-existing\n");
  assert.throws(
    () => preflightCertificationBuildGeneratedOutput({ repositoryRoot: root }),
    /absent before the strict build/,
  );
  unlinkSync(path.join(root, "next-env.d.ts"));

  mkdirSync(path.join(root, "next-env.d.ts"));
  assert.throws(
    () => preflightCertificationBuildGeneratedOutput({ repositoryRoot: root }),
    /absent before the strict build/,
  );
  rmSync(path.join(root, "next-env.d.ts"), { recursive: true });

  writeFileSync(path.join(root, "next-env.d.ts"), "tracked output\n");
  git(root, ["add", "-f", "next-env.d.ts"]);
  git(root, ["commit", "-qm", "track prohibited output"]);
  assert.throws(
    () => preflightCertificationBuildGeneratedOutput({ repositoryRoot: root }),
    /must remain untracked build output/,
  );
  git(root, ["rm", "-q", "--", "next-env.d.ts"]);
  git(root, ["commit", "-qm", "remove prohibited output"]);

  const missingOutputPreflight = preflightCertificationBuildGeneratedOutput({
    repositoryRoot: root,
  });
  assert.throws(
    () =>
      finalizeCertificationBuildGeneratedOutput({
        repositoryRoot: root,
        preflight: missingOutputPreflight,
        identity,
      }),
    /was not produced/,
  );

  const directoryPreflight = preflightCertificationBuildGeneratedOutput({
    repositoryRoot: root,
  });
  mkdirSync(path.join(root, "next-env.d.ts"));
  assert.throws(
    () =>
      finalizeCertificationBuildGeneratedOutput({
        repositoryRoot: root,
        preflight: directoryPreflight,
        identity,
      }),
    /physical regular generated file/,
  );
  assert.equal(lstatSync(path.join(root, "next-env.d.ts")).isDirectory(), true);
  rmSync(path.join(root, "next-env.d.ts"), { recursive: true });

  symlinkSync(
    path.join(root, "missing-target"),
    path.join(root, "next-env.d.ts"),
  );
  assert.throws(
    () => preflightCertificationBuildGeneratedOutput({ repositoryRoot: root }),
    /absent before the strict build/,
  );
  unlinkSync(path.join(root, "next-env.d.ts"));

  const malformedPreflight = preflightCertificationBuildGeneratedOutput({
    repositoryRoot: root,
  });
  writeFileSync(path.join(root, "next-env.d.ts"), "malformed\n");
  assert.throws(
    () =>
      finalizeCertificationBuildGeneratedOutput({
        repositoryRoot: root,
        preflight: malformedPreflight,
        identity,
      }),
    /current strict build contract/,
  );
  assert.equal(existsSync(path.join(root, "next-env.d.ts")), true);
  unlinkSync(path.join(root, "next-env.d.ts"));

  const symlinkPreflight = preflightCertificationBuildGeneratedOutput({
    repositoryRoot: root,
  });
  symlinkSync(path.join(root, "sentinel.txt"), path.join(root, "next-env.d.ts"));
  assert.throws(
    () =>
      finalizeCertificationBuildGeneratedOutput({
        repositoryRoot: root,
        preflight: symlinkPreflight,
        identity,
      }),
    /physical regular generated file/,
  );
  assert.equal(existsSync(path.join(root, "sentinel.txt")), true);
  unlinkSync(path.join(root, "next-env.d.ts"));

  const substitutionPreflight = preflightCertificationBuildGeneratedOutput({
    repositoryRoot: root,
  });
  writeFileSync(
    path.join(root, "next-env.d.ts"),
    NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
  );
  const retainedOriginal = path.join(root, "retained-original-next-env.d.ts");
  assert.throws(
    () =>
      finalizeCertificationBuildGeneratedOutput({
        repositoryRoot: root,
        preflight: substitutionPreflight,
        identity,
        testHooks: {
          beforeExactUnlink({ target }) {
            renameSync(target, retainedOriginal);
            writeFileSync(
              target,
              NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
            );
          },
        },
      }),
    /exact cleanup unlinked a different file/,
  );
  assert.equal(existsSync(retainedOriginal), true);
  assert.equal(existsSync(path.join(root, "next-env.d.ts")), false);
  unlinkSync(retainedOriginal);

  writeFileSync(path.join(root, ".gitignore"), "*.d.ts\n.next/\n");
  assert.throws(
    () => preflightCertificationBuildGeneratedOutput({ repositoryRoot: root }),
    /exact ignored build output/,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Production certification build generated-output tests passed.");
