'use strict';
/* Deterministic extraction of axis/dimension/elevation candidates from PDF.js
 * text fragments. This is evidence gathering, NOT automatic geometry approval. */
const { markOccurrences } = require('./ai-pdf-mark-matcher');
const { dimensionChains } = require('./ai-pdf-dimension-chains');
const { associateLabels } = require('./ai-pdf-spatial-associations');
const num = s => Number(String(s).replace(',', '.'));
const normal = s => String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const axisToken = /^[A-ZА-ЯЁ]{1,3}(?:\d{1,2})?$|^\d{1,3}(?:\/\d{1,2})?$/u;
function extractPageCandidates(page, allowedMarks, grid = {}) {
  const fragments = Array.isArray(page?.fragments) ? page.fragments : [];
  const marks = markOccurrences(page, allowedMarks);
  const axisNames = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value) : [];
  const xAxes = new Set(axisNames(grid.axes_x ?? grid.x).map(String));
  const yAxes = new Set(axisNames(grid.axes_y ?? grid.y).map(String));
  const observations = [];
  fragments.forEach((fragment, index) => {
    const text = normal(fragment?.text ?? fragment?.str);
    if (!text) return;
    const x = Number(fragment?.x), y = Number(fragment?.y);
    const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    const base = { page: page?.page ?? null, fragmentIndex: index, text, point };
    if (axisToken.test(text) && (xAxes.has(text) || yAxes.has(text)))
      observations.push({ ...base, kind: 'axis', dimension: xAxes.has(text) && yAxes.has(text) ? 'ambiguous' : xAxes.has(text) ? 'x' : 'y', value: text });
    // Signed elevations: +12.000, -0.150, ±0.000, or explicit "отм. 12,000".
    const elev = text.match(/(?:^|\bотм\.?\s*)([+\-±]\s*\d{1,3}[.,]\d{3})(?:\s|$)/iu);
    if (elev) observations.push({ ...base, kind: 'elevation', valueMm: Math.round(num(elev[1].replace(/\s/g,'').replace('±','+')) * 1000) });
    // Explicitly dimensioned lengths only; do not treat bare numeric axes as lengths.
    const dim = text.match(/^(?:L\s*=\s*|длина\s*[:=]\s*)(\d{1,7})(?:\s*мм)?$/iu);
    if (dim) observations.push({ ...base, kind: 'dimension', valueMm: Number(dim[1]) });
  });
  const candidates = { page: page?.page ?? null,
    marks: marks.map(hit => ({ ...hit, verified: false })),
    observations,
    dimensionChains: dimensionChains(page, grid),
    safeForAutoPlacement: false,
    extraction: 'pdf_text_layer',
    warning: 'Candidates require geometric association with drawing and validation'
  };
  return { ...candidates, spatialAssociations: associateLabels(candidates) };
}
module.exports = { extractPageCandidates };
