# Canonical Interior AI Worktree

This checkout is the canonical application worktree for Interior AI:

`/Users/justus/Developer/interior-ai`

## Required worktree check

- Apply live application, UI, catalog, API, test, and runtime edits in this checkout unless the user explicitly names a different checkout.
- Before changing code intended for a running local app, identify the listening process and confirm its working directory (for example with `lsof -nP -iTCP:3000 -sTCP:LISTEN` followed by `lsof -a -p <pid> -d cwd`).
- If the running process uses another checkout, stop and report the mismatch before editing.
- Do not assume similarly named repositories under `Documents`, release-evidence directories, or RC directories are the live source.

## Safe synchronization

- Preserve dirty working-tree changes and port only reviewed, task-specific patches between checkouts.
- Never replace an entire dirty file from another checkout without first confirming that the complete diff is intentional.
- Treat release-evidence directories as evidence artifacts, not application source, unless the user explicitly asks to edit them.

## Verification

- After UI or runtime changes, confirm the edited path matches the running server's working directory.
- Verify that obsolete source strings or selectors are absent from this checkout and that the relevant local route still responds.
