# IR Project AI — status relative to the 18-section KM/KMD mounting specification

**Working branch:** \`feature/ir-project-ai-next\` (not \`main\`).
**Release base:** Windows Beta 1.7.222, subsequent AI hot patches.
**Goal:** verified physical mark instances placed in the existing 2D / Three.js montage layout.

## Architecture and immutable rules

- Excel mark register is authoritative; never synthesize new marks from PDFs.
- Mark identity: object + work-type + project cipher + persistent mark record ID.
- Each physical placement has its own ID (mark record ID + instance ordinal).
- PDF source identity: document ID, SHA-256, page and evidence text.
- X/Y/Z are millimetres; only explicit evidence can justify exact offsets.
- Manual scheme records are not overwritten by the automatic planner.
- Missing or conflicting evidence must stay unplaced and be reviewed.
- Never change the active database in response to a PDF load/scan alone.

## Implemented and validated

- Existing Excel mark import and SQLite mark register preserved.
- Fast, bounded text-layer extraction and selective Qwen queue already existed.
- Lightweight PDF scheme tab extracts evidence-linked candidates; no claim
  that it geometrically understands entire drawings.
- Mass planning rechecks source register and exact mark ID; ambiguous repeated
  labels across different project ciphers are blocked.
- Actual PDF file SHA-256 is checked before batch previews/commits, and source
  page must exist in a matching PDF index.
- Scheme axes and dimensions are resolved from saved object grid.
- Physical instance IDs and inventory counts (unique mark rows, total instances,
  already placed, remaining) are available to the montage UI.
- Two-stage preview includes source PDF/page, instance, axes, exact X/Y/Z,
  accepted items and reasons for rejection.
- Mass apply is a single synchronous SQLite transaction, checking a snapshot
  token immediately before insertion; a failure rolls back the whole batch.
- Each batch has a journalled operation ID. Undo refuses to remove modified
  placements or placements with linked child records.
- Existing manually placed geometry is preserved; exact occupied-position
  conflicts are rejected.
- Automated tester covers the actual front-end flow: scan -> preview without
  writes -> commit -> undo.

## NOT yet implemented — do not report as complete

1. Reliable geometrical reading of all *vector linework* and dimension chains
   from KM/KMD PDF drawings, including arbitrary offsets and grid transformations.
2. Coordinate system calibration from visual scanned mounting plans.
3. Visual OCR + Qwen region analysis with source bounding boxes and a
   deterministic source-to-coordinate attribution model.
4. Automatic alignment of multiple KM montage plans, elevations, and KMD detail
   drawings including revision-conflict resolution.
5. Persisted unconfirmed suggestions and manual coordinate edits across
   rescan/restart, with confidence and source fragments per parameter.
6. PDF highlighting of detected marks and precise visual supporting geometry.
7. Truly resumable large batch processing, progress/per-page errors and
   pagination beyond the current bounded PDF index and 250-page quick scan.
8. End-to-end acceptance on complete real KM/KMD drawing packages against
   independently verified placement truth data.
9. Automatic 3D preview of all accepted proposals before writing; current
   preview is a verified coordinate table, not an overlay of ghost geometry.

## Acceptance verification required on real project

- Confirm number of distinct marks and physical copies from Excel.
- Confirm matching within a work type/cipher; reject K6/K60/K600 confusion.
- Verify ambiguous PDFs cannot create source-free geometry or new marks.
- For each accepted item inspect the KM montage plan, a section/elevation and
  KMD details as needed; compare exact coordinates with drawing dimensions.
- Verify plan and Three.js use the same saved objects.
- Run automatic placement twice; second run should insert zero duplicates.
- Edit a placed item manually; then undo must refuse to overwrite that edit.
- Fail the second SQLite insert in a test environment; confirm no partial rows.
- Verify backups and revision-linked engineering history remain intact.

## Next development order

1. Persist proposals and human corrections keyed by physical mark instance.
2. Extract PDF fragment coordinates and vector geometry with reproducible
   sheet-to-grid transform; add exact source rectangles.
3. Link plan, section and detail evidence into one record per instance.
4. Selectively invoke Qwen for difficult cropped regions, validating output
   against geometry and mark register.
5. Provide overlay preview and explicit green/yellow/red/grey classification.
6. Test against Varvarinskoye real drawing sets; never claim automatic
   completion merely from matching label text.
