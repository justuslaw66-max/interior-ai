# Illustrator acceptance — partial native results

Status: **ILLUSTRATOR_ACCEPTANCE_PENDING**. Illustrator 2024 reports version **28.0.0** on this Mac. The JavaScript automation and System Events diagnostic each returned AppleEvent timeout `-1712`; no artwork-editing action ran. PDF inspection and another renderer do not establish Illustrator acceptance.

2026-09-15 manual update: the user opened proposed-apartment.pdf in Illustrator2024, showed an individually selected/moved wall, and reported that individual items can move. This is a partial native object-editing observation. Dimension text editing, font warnings/substitution, exact saved output identity, save/close/reopen and the separate SVG test remain pending. Screenshot and direct report are retained privately in E/illustrator-manual-20260915. No additional AppleEvent attempt ran.

2026-09-15 17:25 manual update supersedes the text-edit/save portions of the earlier pending record. The user reports saving **proposed-apartment copy edited.pdf**, successfully editing the number, and moving each line separately. The saved file was found in E/local-preview-dbc0ef4/vector-pack,58,526bytes, SHA-256 **31ab0f7fee2834a1b7d33c34e6a8e80187ec81911024599d86488fbcfb2b8a98**. Its metadata identifies Adobe Illustrator28.0(Macintosh). Independent read-only inspection finds **9300 as live text**, vector paths, one cubic curve, zero images, Illustrator private editing data and A4landscape297.000083×210.000144mm. Poppler rendering was visually inspected. **Native individual-object movement, dimension text editing and saving an edited PDF are supported by actual evidence.**

Explicit close/reopen confirmation remains pending; the screenshot tab has an asterisk, so the visible state may contain newer unsaved changes. PDF parsing is not a native reopen test. Font fidelity also remains pending: the saved font descriptor names LiberationSans but lists MyriadPro as the family; the pink text highlighting's cause and actual warning/substitution need confirmation. Specific window/door-leaf-versus-swing/deletion/fixture actions, physical-scale checks and separate SVG acceptance remain unobserved. A concise close/reopen/font follow-up was asked directly in Codex. Private screenshot, saved-copy snapshot, hashes and independent inspection are in E/illustrator-manual-20260915-save-r1.

Evidence provenance correction: the original-tab sample at E/local-preview-dbc0ef4/vector-pack/proposed-apartment.pdf now also contains9300 and differs from the historical exporter hash (current **7d9c2713a4422236821a575478f474e0a8d7bb2d01688eca2be681dbbcc03b5d**). It was preserved without restoring/overwriting it. Original exporter bytes **a06977f066e4feed3b5248badb6f4126344a8503ce190e7ba5dd68f830422e76** remain intact in the review-pack ZIP and both normal-install vector packs. These native tests concern the authored export fixture, not successful real-scan recognition.

The independently authored test pack is generated with:

```sh
SCAN_PLAN_ARTIFACT_DIR=/Users/justus/Developer/interior-ai-task-state/scan-to-editable-plan-v1/artifacts/illustrator-final npm run test:scan-plan
```

It produces `proposed-apartment.pdf`, `proposed-apartment.svg`, `proposed-apartment.json`, `drawing-manifest.json`, and `vector-inspection.json`. These are synthetic integration artifacts with no client plan image. The manifest identifies each wall/opening/fixture/dimension primitive and the page transform. The default PDF is A4 landscape at 1:100; its 9260 mm dimension must measure 92.6 mm between the dimension-line endpoints on paper.

## Native test

1. Use **File → Open** on the PDF and import its artwork. Leave “Import PDF pages as links” unchecked. Do not place a linked PDF page into another document. Record the exact Illustrator version, source-file hash, any import warnings and font substitutions.
2. With Direct Selection, select the replacement vertical partition near the middle. Move one wall shape, then delete a different wall shape. Confirm other walls remain separate objects. Record whether ungrouping or releasing a clipping group was necessary.
3. Select and alter a window line on the upper-right exterior wall. Select the door leaf on the replacement partition and move it independently of its cubic swing curve; edit one swing handle.
4. Move the small column outline at the lower right. Edit the dimension text **9260** to **9300** as text, then change a character back. Record the actual font used. Moving outlined glyphs is not an editable-text pass.
5. Save a new local PDF with Illustrator editing data, close only this test document and reopen it. Verify the geometry changes and editable **9300** text persist. Keep the app-generated input PDF unchanged. Export a preview and retain the edited test copy as evidence.
6. Open the SVG separately as artwork and repeat the selection/text/save/reopen checks to a new `.ai` file. Record this separately; an SVG pass cannot substitute for the PDF result.

Record outcome for each action as PASS, FAIL or NOT_RUN, with input/output hashes and observable object counts. Do not infer editable type from appearance alone. The export embeds the complete Liberation Sans Regular font program in PDF and a display font in SVG, while retaining text objects. The bundled font and SIL OFL 1.1 license are in public/fonts/liberation-sans. Install that font locally if Illustrator requests it; font availability/substitution and actual character editing must be observed, not inferred from embedded display glyphs. Missing glyphs and unsupported complex shaping reject visibly; multilingual support remains limited. Independent pypdf/pdfplumber extraction of Café Ω and Poppler rendering pass, but do not prove Illustrator editing. Proprietary Illustrator layers or PGF data are not promised in app-generated PDFs.

Adobe documents [opening PDF artwork and the optional linked-page setting](https://helpx.adobe.com/illustrator/desktop/add-and-import-files/import-other-file-types/import-adobe-pdf-files.html), and [Illustrator-specific editing data added when saving PDFs](https://helpx.adobe.com/illustrator/kb/optimize-native-pdf-file-sizes.html). Those documents do not constitute a test of this exporter.
