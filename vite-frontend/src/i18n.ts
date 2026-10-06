import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh-CN.json";
import en from "./locales/en-US.json";

export type Language = "zh-CN" | "en-US";
export const languageKey = "tms.language";
export function initialLanguage(saved: string | null, browser: string): Language {
  if (saved === "zh-CN" || saved === "en-US") return saved;
  return browser.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}
void i18next.use(initReactI18next).init({
  resources: { "zh-CN": { translation: zh }, "en-US": { translation: en } },
  lng: initialLanguage(localStorage.getItem(languageKey), navigator.language),
  fallbackLng: "en-US",
  keySeparator: false,
  interpolation: { escapeValue: false },
  initImmediate: false,
  showSupportNotice: false,
});
i18next.on("languageChanged", (language) => {
  localStorage.setItem(languageKey, language);
  document.documentElement.lang = language;
});
document.documentElement.lang = i18next.language;
// Global accessor also works in validators, notifications, and API utilities.
export const t = (key: string, values?: Record<string, unknown>): string => String(i18next.t(key, values));
export default i18next;
