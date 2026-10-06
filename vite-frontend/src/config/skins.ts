import { t } from "@/i18n";
export interface Skin {
  id: string;
  name: string;
  base: "light" | "dark";
  swatch: string;
}
export const SKINS: Skin[] = [
  { id: "light", get name() { return t("theme.light"); }, base: "light", swatch: "linear-gradient(#fff,#fff)" },
  { id: "dark", get name() { return t("theme.dark"); }, base: "dark", swatch: "linear-gradient(#111,#111)" },
];
export const DEFAULT_SKIN = "light";
const legacyDark = new Set(["aurora", "deepsea", "cyber", "midnight", "forest", "lava", "grape", "steel"]);
const legacySkins = ["aurora", "mesh", "deepsea", "sunrise", "cyber", "mint", "midnight", "clean", "forest", "lava", "sakura", "grape", "sand", "steel"];
export function savedSkin(): Skin {
  const saved = localStorage.getItem("skin");
  return SKINS.find((skin) => skin.id === saved) ?? SKINS[legacyDark.has(saved ?? "") ? 1 : 0];
}
export function applySkin(id: string): void {
  const skin = SKINS.find((entry) => entry.id === id) ?? SKINS[0];
  const html = document.documentElement;
  html.classList.remove(...legacySkins, "light", "dark");
  html.classList.add(skin.id);
  html.style.colorScheme = skin.base;
  localStorage.setItem("skin", skin.id);
}
