# Scan-to-Editable-Plan V1 — acceptance continuation

2026-09-15. **IN_PROGRESS**. Installation and local diagnosis are complete; real-plan conversion, independent coverage and native Illustrator acceptance remain incomplete. This is not READY or integrated. Authority: [original mandate](MANDATE.md), [continuation](Scan_Plan_Acceptance_Completion_Mandate.md).

## Exact source and tested revision

- **Source identity CLOSED:** `/Users/justus/Downloads/IMG_4900.jpg`,836×1080,93,802bytes, SHA-256 **a0d0209a591dc57352b803fc5f8678055da8a8a24a5c2bd5d795ed8dff2d5006**. Rehashed again after testing; identical to original uploaded IMG_4900(1).jpg. Identity does not establish accuracy.
- Worktree `/Users/justus/Developer/interior-ai-scan-to-editable-plan`, branch `feature/scan-to-editable-plan-v1`. Exact tested code checkpoint **210809e0bad3c6032b984bcd47b25ce13786a63f**, tree **d2a5ab4520c61a9a40fe958192bde94288e988c1**, production BuildID **VSPQEPT16lDYMkXJb8MtI**. This status update follows testing and is documentation only; do not describe a subsequent documentation commit as the revision that ran the tests.
- Resumed21b3354e11e222c1ef9e3df6e0979a13c9e17add was verified clean and status-only relative to testeddbc0ef4. Continuation checkpoint9c502a6 added scale diagnostics;210809e added incomplete consumer draft saving. No target synchronization or primary-checkout edits.
- **E** = `/Users/justus/Developer/interior-ai-task-state/scan-to-editable-plan-v1`. Historical evidence remains; the user-edited Illustrator sample is explicitly distinguished below from preserved original exporter bytes. Detailed prior status archived in E/status-before-final-acceptance-checkpoint-210809e.md and Git; original handoff in E/status-before-acceptance-continuation-21b3354.md.

## Normal isolated installation and checks — PASS

E/clean-install-210809e-r1/source has its own real node_modules and package cache, no escaping dependency symlinks or overlays. Normal **npm ci** with lifecycle scripts passed on Node24.13.0/npm11.6.2; Prisma7.9.0 generated into this copy using an inert database URL. Manifest/lock and all**3,983 tracked files**, including222 expanded LFS assets, remained unchanged after all checks.

- Lock SHA-256 **795e5926392614736ba10acb4ec97ef83941128b6a58b5265cc2746c2f3a92f0**. Installed fontkit1.1.1,pdf-lib1.17.1,sharp0.35.3,canvas1.0.2,tesseract7.0.0,engdata1.0.0. Exact paths/versions in dependency-verification.json.
- `npm run build -- --webpack`, `npm run typecheck`, `npm run test:scan-plan`, `npm run test:floor-plan-required`: **PASS exit0**. **40/40 Chromium/WebKit cases passed**,0retries,4.2min, using this immutable production build. Full lint and quality ratchets passed on the identical feature code before checkpointing. Optional existing local-OCR createRequire build warning remains; actual local OCR passed in the fresh real-source run.
- Actual PDF/SVG export plus independent pypdf/Poppler checks: **PASS**, A4landscape297×210mm,9260mm→92.6mm on paper,21 path starts,5 text objects,1 cubic swing,0 images, full licensed font embedded. Render inspected. PDF SHA **a06977f066e4feed3b5248badb6f4126344a8503ce190e7ba5dd68f830422e76**, identical to the authored acceptance pack. This does not establish Illustrator save/reopen.
- Evidence: E/clean-install-210809e-r1/{verification-complete.json,dependency-verification.json,identity.json,ci.log,build.log,types.log,scan.log,required.log,browser.log,browser-artifacts,vector-pack}. Earlier normal-install passes/failures at21b3354 and9c502a6 remain separately recorded, not relabelled.

## Real scan: diagnosis, draft recovery and missing conversion

**Automatic result remains zero canonical walls, rooms and openings.** The fresh210809e adapter rerun retained120 raster strokes and61 OCR reference texts;15 printed dimensions were accepted as observations. No external vision call occurred. E/clean-install-210809e-r1/real-scan-baseline.

The raw66.007944mm/px hypothesis associated2500 and3510 with wrong38px/53px fragments. Cross-checks rejected2500/1940/3510 by127.1/285.6/163.8px, but their alternative endpoints were also unverified. New diagnostics retain those endpoints and111single/8compound candidates, rather than claiming zero candidates or verified independent conflicts. Original/rendered transform is identity. Projected/Euclidean differences under0.046px do not explain the disagreement.

Scale failure prevents metric topology. A diagnostic-only run with that rejected scale still produced **no_closed_faces**: raster extraction found no conservative closed cycles; the existing PDF wall-band fallback requires native PDF paths. No useful semantic geometry was dropped by the UI. Source strokes/text remain unreviewed reference artwork, not editable walls.

Independent visual observations are private in E/real-source-inventory-r1: heavy/thin boundary regions, door/opening/fixture symbols, two printed labels, all16 printed dimensions and uncertainties. Exact source crops, coordinate transforms, automatic versus separately observed endpoints and residuals are in E/clean-install-21b3354-r1/source-span-audit-r2. These are assistant pixel observations, not site measurements or a human pilot. Top9260 spans about518px; the bottom chain totaling9260 spans about501px. No uniform-scale exact recovery is claimed and no image warp was performed.

**Truthful consumer draft recovery PASS:** actual production file input uploaded the hash-confirmed original. Scripted assistance picked the top9260 span and bottom2500+1940+4820 span, both scanned-image quality. Actual rounded click coordinates gave**17.59px conflict** against the unchanged3px limit. The new **Save review draft** action persisted version2 through the existing versioned candidate interface. After browser reload and reopening Import2Ddrawing, the same conflict remained visible; no confirmation or geometry was created. E/clean-install-210809e-r1/consumer-real-draft-r1/{README.md,acceptance-summary.json,journey.json,*.png}.

That probe uses production UI/domain functions with an explicitly in-memory HTTP/persistence harness seeded only with actual adapter output. It is not live database certification. The separate synthetic lifecycle tests also prove correction persistence, stale-response isolation and blocked confirmation. Recovery copy no longer presumes the source is poor. The parent component shrank711→692lines; quality limits only lowered.

**NOT_DEMONSTRATED:** real-image-derived wall removal/addition, opening edits, matching3D, furnishing and PDF. Existing authored-fixture journeys pass separately. No authored JSON or manual tracing substituted for recognition, no complete-plan accuracy percentage or human correction-time saving claimed. A consistent source or explicitly reviewed reliable measurements/constraints is needed for metric reconstruction; semantic recovery also remains necessary. Additional independent supported real plans are pending.

## Illustrator — partial native editing, acceptance pending

**ILLUSTRATOR_ACCEPTANCE_PENDING.** User screenshot2026-09-15 11:34:48 shows Illustrator2024 with proposed-apartment.pdf open, a displaced wall individually selected with vector handles. User reports individual items move. This supports native individual-object editing of the authored PDF. E/illustrator-manual-20260915 retains screenshot/hash/observations.

**17:25 follow-up:** user confirms number editing, separately movable lines and saving proposed-apartment copy edited.pdf. Saved file found and hashed **31ab0f7fee2834a1b7d33c34e6a8e80187ec81911024599d86488fbcfb2b8a98**,58,526bytes. Read-only inspection and rendering confirm **9300 remains live text**, paths and Illustrator editing data remain, zero images, A4landscape. Metadata identifies Illustrator28.0(Macintosh). Text edit and edited-PDF save are now supported native results. E/illustrator-manual-20260915-save-r1.

Close/reopen confirmation and font fidelity remain pending: saved descriptor names LiberationSans but lists MyriadPro family; no warning observation is assumed. Specific door-leaf/swing, deletion/window/fixture actions, native scale and SVG checks remain unobserved. Screenshot has an unsaved asterisk. The original sample in the old preview was also modified; its observed bytes were preserved, while the original a06977f0… exporter bytes remain intact in the ZIP and clean-install packs. [Detailed evidence and checklist](ILLUSTRATOR-ACCEPTANCE.md). Two prior AppleEvent timeouts preserved; no retries.

## Preserved limits and next action

- Existing canonical document/compiler, private proposals, wall/opening edits, undo/reload, furnishing/collision and vector export remain. The sole independent review's three fixes and regression coverage are preserved; no new review campaign. Historical38/38 browser pass ondbc0ef4 remains separate from the current40/40 pass.
- Prior real disposable PostgreSQL confirmation/deletion/version race checks remain E/db-retention-r1/concurrency-r2.{json,log}; cluster stopped. No shared database/schema changes.
- Frozen source tolerances remain clean2px/scan3px, exact integer-mm edits, paper≤0.01mm and other original performance/mesh limits. **Curved floors:** adding/joining partitions is blocked when any curved wall exists. No broader curve engine added.
- **Inherited renderer resource growth remains unresolved:** historical+3textures/+1geometry per3D/2D cycle; attribution incomplete. Current browser performance checks passing does not establish memory stability. No broad renderer rewrite.
- **Pending input:** local paths to3–5 additional authorized varied apartment plans and known measurements were requested once. No independent batch or15–30-plan pilot completed.
- **AWAITING_APPROVAL_IN_CODEX:** one proposed OpenAIgpt-5.6-sol call on this scan only, max12,000output tokens/US$1,store:false,no retries, stated API retention. E/recognition-experiment-proposal.md. No credential read or external recognition performed. Approval would authorize only this bounded experiment; deterministic gates remain unchanged.
- Next: evaluate source-supported semantic proposals if the bounded call is approved; process authorized independent plans when supplied; demonstrate successful assisted conversion and complete native Illustrator acceptance. These acceptance gaps remain open; this checkpoint does not claim the whole feature is complete.

Last runtime check: production3033PID29068 cwdE/clean-install-210809e-r1/source; feature3018 and earlier immutable previews preserved. Recheck lsof before further app edits. No push, PR, merge/rebase/amend, deployment, secrets changes or shared writes.
