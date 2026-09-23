import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { getSerializedDesignDocumentByteLength } from "../lib/design-document-contract";
import { snapshotToStored } from "../lib/room-persistence";
import { fingerprintDesignSnapshot } from "../lib/snapshot-fingerprint";
import performanceBudgets from "../config/phase8-performance-budgets.json";
import {
  PHASE8_SOURCE_BINDINGS,
  sha256Bytes,
  type Phase8BenchmarkCommand,
  type Phase8BenchmarkMode,
  type Phase8FixtureSummary,
  type Phase8ProjectBenchmarkBudgets,
  type Phase8SourceBinding,
} from "./phase8-project-benchmark-contract";
import { createAllPhase8RepresentativeProjects } from "./phase8-representative-projects";

export const PHASE8_EXPECTED_FINGERPRINTS = {
  small: "3acd8307",
  medium: "8064c579",
  large: "c76918bc",
} as const;

function git(repositoryRoot: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

export function assertPhase8SourceIsClean(repositoryRoot: string): void {
  try {
    execFileSync("git", ["diff", "--quiet"], { cwd: repositoryRoot, stdio: "ignore" });
    execFileSync("git", ["diff", "--cached", "--quiet"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    throw new Error("Phase 8 benchmark evidence requires a clean HEAD worktree and index");
  }
  const untracked = git(repositoryRoot, "ls-files", "--others", "--exclude-standard");
  if (untracked) throw new Error("Phase 8 benchmark evidence rejects non-ignored untracked paths");
  const trackedIgnored = git(repositoryRoot, "ls-files", "-ci", "--exclude-standard");
  if (trackedIgnored) throw new Error("Phase 8 benchmark evidence rejects tracked ignored paths");
  for (const binding of PHASE8_SOURCE_BINDINGS) {
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", "--", binding.path], {
        cwd: repositoryRoot,
        stdio: "ignore",
      });
    } catch {
      throw new Error(`bound benchmark source ${binding.path} must be tracked by HEAD`);
    }
  }
}

export function readPhase8GitIdentity(repositoryRoot: string): {
  sourceCommitSha: string;
  sourceTreeSha: string;
  branch: string;
} {
  const sourceCommitSha = git(repositoryRoot, "rev-parse", "HEAD");
  const sourceTreeSha = git(repositoryRoot, "rev-parse", "HEAD^{tree}");
  const branchName = git(repositoryRoot, "branch", "--show-current");
  return {
    sourceCommitSha,
    sourceTreeSha,
    branch: branchName || `detached@${sourceCommitSha}`,
  };
}

export function readPhase8SourceBindings(repositoryRoot: string): Phase8SourceBinding[] {
  return PHASE8_SOURCE_BINDINGS.map((binding) => ({
    ...binding,
    sha256: sha256Bytes(readFileSync(path.join(repositoryRoot, binding.path))),
  }));
}

export function createPhase8FixtureSummaries(): Phase8FixtureSummary[] {
  return createAllPhase8RepresentativeProjects().map((project) => {
    const rooms = project.snapshot.rooms;
    const serialized = JSON.stringify(snapshotToStored(project.snapshot));
    const fingerprint = fingerprintDesignSnapshot(project.snapshot);
    if (fingerprint !== PHASE8_EXPECTED_FINGERPRINTS[project.scale]) {
      throw new Error(`${project.scale} representative fingerprint changed`);
    }
    return {
      scale: project.scale,
      rooms: rooms.length,
      items: rooms.reduce((total, room) => total + room.items.length, 0),
      views: rooms.reduce((total, room) => total + room.savedViews.length, 0),
      zones: rooms.reduce((total, room) => total + room.zones.length, 0),
      openings: project.snapshot.floorPlan?.openings?.length ?? 0,
      serializedBytes: getSerializedDesignDocumentByteLength(serialized),
      fingerprint,
    };
  });
}

export function phase8ProjectBenchmarkBudgets(): Phase8ProjectBenchmarkBudgets {
  return performanceBudgets.projectBenchmarks;
}

export function phase8BenchmarkCommand(
  mode: Phase8BenchmarkMode,
  jsonOutput: boolean,
): Phase8BenchmarkCommand {
  return { packageScript: "benchmark:phase8:projects", mode, jsonOutput };
}
