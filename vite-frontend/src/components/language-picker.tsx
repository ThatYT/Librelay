import { useTranslation } from "react-i18next";
import { Select, SelectItem } from "@heroui/select";

export default function LanguagePicker() {
  const { i18n } = useTranslation();
  return <Select aria-label="Language / 语言" className="w-32" size="sm"
    selectedKeys={[i18n.language]}
    onSelectionChange={(keys) => { const language = String(Array.from(keys)[0]); if (language === "zh-CN" || language === "en-US") void i18n.changeLanguage(language); }}>
    <SelectItem key="zh-CN">中文</SelectItem>
    <SelectItem key="en-US">English</SelectItem>
  </Select>;
}
