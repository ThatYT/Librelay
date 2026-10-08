export const defaultProtocolPort = (protocol: string): string => protocol === "vless" ? "443" : "";

// undefined asks the backend to allocate; null identifies invalid user input.
export function parseProtocolPort(value: string): number | null | undefined {
  if (value === "") return undefined;
  if (!/^\d+$/.test(value)) return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}
