import nativeToast from "react-hot-toast";
import { t } from "@/i18n";
import en from "@/locales/en-US.json";
import zh from "@/locales/zh-CN.json";

const messages = Object.entries(zh).sort((a, b) => b[1].length - a[1].length);
/** Translate display messages without changing server codes or machine error matching. */
export function serverMessage(message: string): string {
  const exact = messages.find(([key, value]) => value === message || (en as Record<string, string>)[key] === message);
  if (exact) return t(exact[0]);
  const userNode = message.match(/^Cannot apply user limits on node (\d+): (.*)\. Update the node agent and ensure it is online; then retry\.$/);
  if (userNode) return t("error.userLimitNode", { node: userNode[1], detail: serverMessage(userNode[2]) });
  const userSaved = message.match(/^User settings saved; node synchronization is pending: (.*)$/);
  if (userSaved) return t("error.userLimitSaved", { detail: serverMessage(userSaved[1]) });
  const unavailable = message.match(/^Cannot use (TCP|UDP) port (\d+) on node (\d+): (.*)$/);
  if (unavailable) return t("error.portUnavailable", { network: unavailable[1], port: unavailable[2], node: unavailable[3], detail: serverMessage(unavailable[4]) });
  const used = message.match(/^(TCP|UDP) port (\d+) is already used on node (\d+)$/);
  if (used) return t("error.portUsed", { network: used[1], port: used[2], node: used[3] });
  const reserved = message.match(/^(TCP|UDP) port (\d+) is reserved by a forwarding service on node (\d+)$/);
  if (reserved) return t("error.portReserved", { network: reserved[1], port: reserved[2], node: reserved[3] });
  return messages.reduce((text, [key, source]) =>
    source.length >= 4 && !source.includes("{{") && /[\u3400-\u9fff]/.test(source)
      ? text.split(source).join(t(key)) : text, message);
}
function localize<T>(message: T): T {
  return (typeof message === "string" ? serverMessage(message) : message) as T;
}
const toast: typeof nativeToast = Object.assign(
  (...args: Parameters<typeof nativeToast>) => nativeToast(localize(args[0]), args[1]),
  nativeToast,
  {
    error: (...args: Parameters<typeof nativeToast.error>) => nativeToast.error(localize(args[0]), args[1]),
    success: (...args: Parameters<typeof nativeToast.success>) => nativeToast.success(localize(args[0]), args[1]),
    loading: (...args: Parameters<typeof nativeToast.loading>) => nativeToast.loading(localize(args[0]), args[1]),
  },
);
export default toast;
