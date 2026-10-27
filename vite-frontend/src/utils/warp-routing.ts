export interface WarpPolicy { enabled: boolean; port: number; domains: string[] }
export const defaultWarpPolicy = (): WarpPolicy => ({
  enabled: false, port: 31000,
  domains: ["google.com", "google.com.hk", "googleapis.com", "gstatic.com", "googleusercontent.com", "notebook.google"],
});
export function readWarpPolicy(stored?: string | null): WarpPolicy {
  if (!stored) return defaultWarpPolicy();
  const policy = JSON.parse(stored);
  if (!policy || typeof policy.enabled !== "boolean" || !Number.isInteger(policy.port)
    || policy.port < 1 || policy.port > 65535 || !Array.isArray(policy.domains)
    || !policy.domains.length || !policy.domains.every((domain: unknown) => typeof domain === "string"))
    throw new Error("Invalid stored WARP policy");
  return policy;
}
export function warpFormPolicy(enabled: boolean, port: string, domains: string): WarpPolicy | null {
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  const suffixes = [...new Set(domains.split(/[\s,]+/).filter(Boolean))];
  if (!suffixes.length || suffixes.length > 100) return null;
  return { enabled, port: Number(port), domains: suffixes };
}
