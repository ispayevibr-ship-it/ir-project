# Algorithmic PDF engine — incremental implementation

## 2026-10-17: persisted vector page index

The existing “Index all drawings” action now runs the text index and the existing
vector worker for each page, sequentially. Geometry is stored in the existing
entity database under `ai-pdf-geometry`, keyed by object, document, PDF SHA-256,
page and extractor schema version. No placements or quantities are changed.

A later batch run or geometry view reuses valid persisted pages, including after
application restart. A changed PDF or invalid cached segment forces extraction.
The user can stop after the current operation; starting the batch again resumes
through cached pages. This is user-initiated resume, not automatic startup work.

The existing text-only checkmark is explicitly labelled. A completed batch row
shows “Text and geometry”. Errors remain isolated per PDF.

Validation: existing hot-update validation suite plus persisted-cache regression
(restart, source changes, object isolation, corrupt cache, invalid worker result).

## Remaining scope of stage 1

- Existing geometry is a bounded sample of strokes and axis bands, not a complete
  vector index. Curve retention, all paint primitives and raster regions remain.
- Existing PDF limits remain: 80 pages per file, 48 MiB, worker time limits.
- OCR and local language assets are not implemented by this change.
- No 99% accuracy claim: the 041-2025 reference set has not been evaluated here.
- Page-specific forced reindex UI and durable queue/error/progress history remain.
- Coordinate solving, full instance accounting and detailed Three.js generation
  remain subsequent stages of the supplied specification.
