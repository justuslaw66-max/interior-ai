# Illustrator acceptance — pending

Status: **ILLUSTRATOR_ACCEPTANCE_PENDING**. Illustrator 2024 reports version **28.0.0** on this Mac. The JavaScript automation and System Events diagnostic each returned AppleEvent timeout `-1712`; no artwork-editing action ran. PDF inspection and another renderer do not establish Illustrator acceptance.

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
