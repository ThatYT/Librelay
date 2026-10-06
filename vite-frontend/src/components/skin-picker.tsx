import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState } from "react";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { SKINS, savedSkin, applySkin } from "@/config/skins";

// 头部的主题(皮肤)选择器,自包含状态,不依赖布局。
export default function SkinPicker() {
  useTranslation();
  const [current, setCurrent] = useState<string>(savedSkin().id);

  const swatch = (bg: string) => (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 6,
        backgroundImage: bg,
        display: "inline-block",
        border: "1px solid rgba(128,128,128,.4)",
      }}
    />
  );

  const currentSwatch = SKINS.find((s) => s.id === current)?.swatch ?? SKINS[0].swatch;

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly variant="light" aria-label={t("m788db1cfec2a")}>
          {swatch(currentSwatch)}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t("m788db1cfec2a")}
        onAction={(key) => {
          applySkin(String(key));
          setCurrent(String(key));
        }}
      >
        {SKINS.map((s) => (
          <DropdownItem key={s.id} startContent={swatch(s.swatch)}>
            {s.name}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}
