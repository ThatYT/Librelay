import { t } from "@/i18n";
/**
 * Reality「伪装域名」候选(借壳 SNI)。
 *
 * 无域名搭 Reality 时,握手时对外表现成访问这个站点,所以要挑:
 * 国外大站、支持 TLS1.3+X25519、国内没被墙、且不在你机器所在地被劫持。
 *
 * ⚠️ 别用 www.microsoft.com —— 它启用了后量子密钥交换,Reality 握不上手,
 *    搭完连不上十有八九栽在这(踩过)。
 *
 * ⚠️ label 必须【就是域名本身】,补充说明一律放 desc。
 *    HeroUI 的 Autocomplete 选中后会把输入框显示值设成 label 并触发
 *    onInputChange(label),把 onSelectionChange 刚写好的 value 覆盖掉;
 *    label 里但凡多一个字,存进配置的就是那串带说明的文字,
 *    sing-box 拿它当借壳域名必然握不上手(已经踩过一次,VLESS/Trojan 全 -1)。
 */
export const SNI_PRESETS = [
  { value: "www.apple.com", label: "www.apple.com", get desc() { return t("m1c98269108b9"); } },
  { value: "www.icloud.com", label: "www.icloud.com", desc: "" },
  { value: "www.bing.com", label: "www.bing.com", desc: "" },
  { value: "www.cloudflare.com", label: "www.cloudflare.com", desc: "" },
  { value: "www.amazon.com", label: "www.amazon.com", desc: "" },
  { value: "www.nvidia.com", label: "www.nvidia.com", desc: "" },
  { value: "www.tesla.com", label: "www.tesla.com", desc: "" },
  { value: "addons.mozilla.org", label: "addons.mozilla.org", desc: "" },
];

export const DEFAULT_SNI = "www.apple.com";

/**
 * 提交前兜底清洗:只留合法域名字符,顺手砍掉中文括号说明之类的尾巴。
 * 前端下拉再怎么改,进后端的都得是个像域名的东西。
 */
export function cleanSni(input: string | null | undefined): string {
  const s = (input || "").trim();
  if (!s) return DEFAULT_SNI;
  // 取第一段合法域名(字母数字、点、连字符),丢掉后面跟的任何说明文字
  const m = s.match(/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+/);
  return m ? m[0] : DEFAULT_SNI;
}
