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

- Existing stroke geometry is a bounded sample. Painted contours now retain cubic
  and quadratic Bezier control points, fill rules and source operator indices.
  Clipping is flagged as unresolved; raster regions and complete coverage remain.
- Existing PDF limits remain: 80 pages per file, 48 MiB, worker time limits.
- OCR and local language assets are not implemented by this change.
- No 99% accuracy claim: the 041-2025 reference set has not been evaluated here.
- Page-specific forced reindex UI and durable queue/error/progress history remain.
- Coordinate solving, full instance accounting and detailed Three.js generation
  remain subsequent stages of the supplied specification.

## 2026-10-17: painted contours and curves

The page worker additionally preserves bounded painted paths, including short
lines, cubic/quadratic Bezier curves, closed and filled paths. Both legacy and
packed PDF.js operators are supported. Geometry stays in viewport coordinates.
Clipped paths are explicitly flagged; no exact visible clipping is claimed.
Truncation is explicit and partial contours are discarded. Cache schema 2 forces
old pages to be recalculated on the next batch run. No circle/axis/profile
classification or placement is inferred from these raw paths.

Validation includes translated/scaled/rotated coordinates, transform restoration,
legacy shorthand Beziers, packed paths, malformed input, unpainted paths,
clipping flags and bounded storage. Hot-worker dependency loading is tested.

## 2026-10-17: independent framed plans

The automatic geometry sweep now detects rectangular painted frames at arbitrary
page positions. Each frame must independently fit the existing user axis grid.
When two or more disjoint frames qualify, each gets its own region bounds,
calibration and mark-label/outline/dimension analysis. The source frame operator
index is retained. Clipped, overlapping, nested and uncalibrated frames are
rejected; the prior half-page/manual workflow remains the fallback.

This is not general diagram segmentation: unframed views, title-based
classification and rotated pages remain unresolved. Repeated labels are still
source observations, not confirmed physical instances. No coordinates or
placements are assigned merely from a text-label position.

Regression covers two off-centre frames, separate calibration, same mark in both
views, clipping, overlaps, missing axis evidence and invalid region bounds.

## 2026-10-17: vertically separated unframed plans

Automatic analysis also searches up to 12 substantial gaps between registered
axis-label rows, instead of assuming a fixed half-page boundary. Both regions
must independently calibrate and share at least three named axes per direction;
their page-to-grid transforms must differ. This prevents two crops of one plan
from being counted as independent views. Geometry and text are both required.
This supports two vertically stacked views; arbitrary unframed layouts and
multiple-view instance reconciliation are still pending. No 3D placement or
physical instance count is inferred from repeated labels.
