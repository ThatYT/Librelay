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

/** Shown for manual execution only; the panel never executes this script. */
export function warpSetupCommands(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid WARP port");
  return `bash <<'LIBRELAY_WARP_SETUP'
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Run this block as root (sudo -i), then retry.'; exit 1; }
export LC_ALL=C
. /etc/os-release
case "\${ID}:\${VERSION_CODENAME:-}" in
  debian:bookworm|debian:trixie|ubuntu:jammy|ubuntu:noble|ubuntu:resolute) ;;
  *) echo 'Use the official Cloudflare instructions for this OS: https://pkg.cloudflareclient.com/'; exit 1 ;;
esac
if ! command -v warp-cli >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl ca-certificates gnupg
  install -d -m 0755 /usr/share/keyrings
  key_tmp=$(mktemp)
  trap 'rm -f "$key_tmp"' EXIT
  curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg -o "$key_tmp"
  gpg --batch --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg "$key_tmp"
  rm -f "$key_tmp"
  trap - EXIT
  chmod 0644 /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ \${VERSION_CODENAME} main" > /etc/apt/sources.list.d/cloudflare-client.list
  apt-get update
  apt-get install -y cloudflare-warp
fi
systemctl enable --now warp-svc
ready=0
for attempt in $(seq 1 20); do
  if warp-cli --accept-tos status 2>&1 | grep -q 'Status update:'; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo 'WARP daemon is not ready. Inspect journalctl -u warp-svc, then retry.'; exit 1; }
# Keep any existing registration. Never delete it.
warp-cli --accept-tos registration show >/dev/null 2>&1 || warp-cli --accept-tos registration new
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port ${port}
warp-cli --accept-tos connect
sleep 3
warp-cli --accept-tos status
ss -lntp '( sport = :${port} )'
curl --fail --show-error --max-time 15 --proxy socks5h://127.0.0.1:${port} https://www.cloudflare.com/cdn-cgi/trace
LIBRELAY_WARP_SETUP`;
}
