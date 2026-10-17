'use strict';

/**
 * Conservative placement resolver for indexed KM/KMD PDF annotations.
 * Coordinates and elevations are millimetres. Never invent missing values.
 * This module has no database writes or side effects.
 */
const TYPES = [
  ['column', /(?:^|\s)(?:колонна|колонны|стойка|стойки)(?:\s|$)/i],
  ['beam', /(?:^|\s)(?:балка|балки)(?:\s|$)/i],
  ['girder', /(?:^|\s)(?:ригель|ригели)(?:\s|$)/i],
  ['brace', /(?:^|\s)(?:связь|связи|раскос|раскосы)(?:\s|$)/i],
  ['wall-post', /(?:фахверк|фахверков)/i],
  ['purlin', /(?:прогон|прогоны)(?:\s|$)/i],
  ['strut', /(?:распорка|распорки)(?:\s|$)/i]
];
function normalizeMark(value) {
  return String(value ?? '').normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '');
}
function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function classify(name) {
  const label = String(name ?? '').toLowerCase();
  return TYPES.find(([, re]) => re.test(label))?.[0] ?? null;
}
function resolvePlacement(row, occurrence, grid) {
  const mark = normalizeMark(row.mark);
  const type = classify(row.name ?? row.description ?? '');
  const axes = grid?.axes ?? {};
  const xAxis = occurrence?.xAxis;
  const yAxis = occurrence?.yAxis;
  const endXAxis = occurrence?.endXAxis;
  const endYAxis = occurrence?.endYAxis;
  const axisValue = (axis, dimension) => {
    if (axis === undefined || axis === null) return null;
    return finite(axes[dimension]?.[String(axis)]);
  };
  const x = axisValue(xAxis, 'x');
  const y = axisValue(yAxis, 'y');
  const z0 = finite(occurrence?.z0);
  const z1 = finite(occurrence?.z1);
  const x1 = axisValue(endXAxis, 'x');
  const y1 = axisValue(endYAxis, 'y');
  const missing = [];
  if (!type) missing.push('type');
  if (x === null) missing.push('x');
  if (y === null) missing.push('y');
  if (z0 === null) missing.push('z0');
  if (z1 === null) missing.push('z1');
  const linear = type !== 'column' && type !== 'wall-post';
  if (linear && x1 === null) missing.push('endX');
  if (linear && y1 === null) missing.push('endY');
  const invalid = z0 !== null && z1 !== null && z1 < z0;
  const verified = occurrence?.verified === true && missing.length === 0 && !invalid;
  return {
    mark, type, sourcePage: occurrence?.page ?? null,
    status: invalid ? 'conflict' : verified ? 'ready' : 'review',
    missing, geometry: { x, y, z0, z1, x1, y1 },
    evidence: occurrence?.evidence ?? null
  };
}
function planPlacements(rows, occurrences, grid) {
  const byMark = new Map();
  for (const row of rows ?? []) {
    const key = normalizeMark(row.mark);
    if (key && !byMark.has(key)) byMark.set(key, row);
  }
  const placements = [];
  for (const occurrence of occurrences ?? []) {
    const mark = normalizeMark(occurrence.mark);
    const row = byMark.get(mark);
    if (!row) continue; // Only marks in the user's register
    placements.push(resolvePlacement(row, occurrence, grid));
  }
  return {
    placements,
    ready: placements.filter(p => p.status === 'ready').length,
    review: placements.filter(p => p.status === 'review').length,
    conflicts: placements.filter(p => p.status === 'conflict').length
  };
}
module.exports = { normalizeMark, classify, resolvePlacement, planPlacements };
