export function isValidBillingPolicy(mode, multiplier) {
  return ['both', 'upload', 'download'].includes(mode) &&
    typeof multiplier === 'number' && Number.isFinite(multiplier) &&
    multiplier >= 0 && multiplier <= 1000 && /^\d+(\.\d{1,4})?$/.test(String(multiplier));
}
