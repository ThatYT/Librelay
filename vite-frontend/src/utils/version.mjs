/** Render only numeric release versions; legacy commit metadata is never a version label. */
export function numericVersion(value, fallback = '-') {
  return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value : fallback;
}
