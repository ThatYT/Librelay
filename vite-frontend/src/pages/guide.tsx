import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Accordion, AccordionItem } from "@heroui/accordion";

/**
 * 使用说明:四个功能(协议管理 / 中转 / 端口转发 / 隧道转发)啥区别、啥时候用哪个。
 * 纯说明页,侧栏「使用说明」进来。
 *
 * 排版取向:这页是拿来「查」的不是拿来「读」的 —— 所以四个功能做成卡片网格一眼扫完,
 * 决策树画成分叉的方块而不是嵌套列表,链路图用等宽块并把关键节点挑出颜色。
 */

/** 四个功能的主色,全页统一:哪儿提到某个功能,颜色就是这个 */
const FEATURES = [
  {
    get name() { return t("mcf676c020118"); },
    color: "primary" as const,
    dot: "bg-primary",
    icon: "🛡️",
    get headline() { return t("m710f9fe7ca93"); },
    get body() { return t("mae51fbc1a3a1"); },
  },
  {
    get name() { return t("m7f785150a8e2"); },
    color: "warning" as const,
    dot: "bg-warning",
    icon: "🔀",
    get headline() { return t("m9956c71de767"); },
    get body() { return t("m676a61fbd759"); },
  },
  {
    get name() { return t("mdae851b6621c"); },
    color: "secondary" as const,
    dot: "bg-secondary",
    icon: "🔌",
    get headline() { return t("m3bd2259f4a09"); },
    get body() { return t("m7065df10c1a4"); },
  },
  {
    get name() { return t("mf13895bd3f8a"); },
    color: "default" as const,
    dot: "bg-default-400",
    icon: "🔒",
    get headline() { return t("m69384b72bc48"); },
    get body() { return t("m9f8d92cb3724"); },
  },
];

/** 小节标题,统一样式 */
function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  useTranslation();
  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <h2 className="text-base font-bold">{children}</h2>
      {hint && <span className="text-xs text-default-400">{hint}</span>}
    </div>
  );
}

/** 决策树里的一个分支块 */
function Branch({
  tag,
  title,
  color,
  children,
}: {
  tag: string;
  title: string;
  color: "primary" | "warning" | "secondary" | "default";
  children: React.ReactNode;
}) {
  useTranslation();
  const ring = {
    primary: "border-primary/40 bg-primary/5",
    warning: "border-warning/40 bg-warning/5",
    secondary: "border-secondary/40 bg-secondary/5",
    default: "border-default-300 bg-default-100/50",
  }[color];
  return (
    <div className={`rounded-xl border ${ring} p-4 space-y-2 h-full`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{tag}</span>
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <div className="text-sm text-default-600 space-y-2">{children}</div>
    </div>
  );
}

/** 「→ 用这个功能」的结论条 */
function Verdict({ name, color }: { name: string; color: "primary" | "warning" | "secondary" | "default" }) {
  useTranslation();
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-default-400 text-xs">{t("m04e45efb3be8")}</span>
      <Chip size="sm" color={color} variant="flat" className="font-medium">
        {name}
      </Chip>
    </div>
  );
}

export default function GuidePage() {
  useTranslation();
  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px]">
      {/* 页头 */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("mcb4ba40bf823")}</h1>
        <p className="text-sm text-default-500"> {t("m5f4c0898371e")} </p>
      </div>

      {/* 四个功能:卡片网格,一眼扫完 */}
      <div>
        <SectionTitle hint={t("maed28995ef34")}>{t("m1eff86dd11e8")}</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-3">
          {FEATURES.map((f) => (
            <Card key={f.name} className="border border-divider h-full">
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{f.icon}</span>
                  <Chip size="sm" color={f.color} variant="flat" className="font-medium">
                    {f.name}
                  </Chip>
                </div>
                <div className="font-medium text-sm leading-snug">{f.headline}</div>
                <div className="text-xs text-default-500 leading-relaxed">{f.body}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      {/* 决策树 */}
      <div>
        <SectionTitle hint={t("mbbcb9ee557e7")}>{t("m72b19fee46e0")}</SectionTitle>

        <div className="mt-3 space-y-4">
          {/* 第一问 */}
          <Card className="border border-divider">
            <CardBody className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold shrink-0">
                  1
                </span>
                <span className="font-semibold text-sm">{t("mad562714b1d5")}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Branch tag="📋" title={t("mb856b34506e8")} color="primary">
                  <div className="flex items-start gap-2">
                    <span className="text-default-400 shrink-0">·</span>
                    <span>{t("m4d2a00ad589f")}</span>
                    <Chip size="sm" color="primary" variant="flat">{t("mcf676c020118")}</Chip>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-default-400 shrink-0">·</span>
                    <span>{t("mec3dc110271a")}</span>
                    <Chip size="sm" color="warning" variant="flat">{t("m7f785150a8e2")}</Chip>
                  </div>
                  <div className="text-xs text-success pt-1">{t("mc0ffa7cdc314")}</div>
                </Branch>

                <Branch tag="🔌" title={t("m239111441bf1")} color="default">
                  <p>{t("m3c4430c37902")}</p>
                  <div className="text-xs text-default-500 pt-1">{t("mc8efd707204a")}</div>
                </Branch>
              </div>
            </CardBody>
          </Card>

          {/* 第二问 */}
          <Card className="border border-divider">
            <CardBody className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold shrink-0">
                  2
                </span>
                <span className="font-semibold text-sm">{t("m9e129f6f9f24")}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Branch tag="🔒" title={t("m44048b009a53")} color="secondary">
                  <p className="text-xs text-default-500">{t("m68f6e5b0a9d5")}</p>
                  <p>{t("m8b0b213289f7")}</p>
                  <Verdict name={t("mdae851b6621c")} color="secondary" />
                </Branch>

                <Branch tag="📭" title={t("ma6cf66aa84f8")} color="default">
                  <p className="text-xs text-default-500">{t("m65c9a6736d51")}</p>
                  <p className="font-medium">{t("m1f834ea6684f")}</p>

                  <div className="space-y-2 pt-1">
                    <div className="rounded-lg bg-default-100 p-2.5 space-y-1">
                      <div className="text-xs font-medium">{t("m7e783411390b")}</div>
                      <div className="text-xs text-default-500">{t("m64518d37e99e")}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-default-400 text-xs">{t("m1eef8e868282")}</span>
                        <Chip size="sm" color="secondary" variant="flat">{t("mdae851b6621c")}</Chip>
                      </div>
                    </div>

                    <div className="rounded-lg border border-warning/40 bg-warning/5 p-2.5 space-y-1">
                      <div className="text-xs font-medium">{t("mee4b58552d79")}</div>
                      <div className="text-xs text-default-500"> {t("m2299b30adf1c")} </div>
                      <div className="flex items-center gap-2">
                        <span className="text-default-400 text-xs">{t("m5cd633683dc5")}</span>
                        <Chip size="sm" color="default" variant="flat">{t("mf13895bd3f8a")}</Chip>
                      </div>
                      <div className="text-xs text-default-500">{t("m172a2ed68269")}</div>
                    </div>
                  </div>
                </Branch>
              </div>
            </CardBody>
          </Card>

          {/* 结论 */}
          <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
            <span className="font-semibold">{t("m1bfc0d6a189c")}</span>
            <span className="text-default-600">
              {" "}{t("m5771179c8b12")} <b>{t("m49a22c662f8e")}</b>。
            </span>
          </div>
        </div>
      </div>

      {/* 进阶搭法 */}
      <div>
        <SectionTitle hint={t("m9259c6225765")}>{t("m95a6b8895d51")}</SectionTitle>
        <Card className="border border-divider mt-3">
          <CardBody className="space-y-4">
            <p className="text-sm text-default-600"> {t("m1c21e2189e69")}<b>{t("m2a47a7aecc03")}</b>{t("me15de0c94812")} </p>

            {/* 搭法 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-divider p-3 space-y-1">
                <div className="text-xs text-default-400">{t("m60fcddc9934b")}</div>
                <div className="text-sm"> {t("m9145669030ae")} <b>{t("md448d143c4e0")}</b> {t("m6d78078dd933")} <b>{t("m3350d8c9ca51")}</b>
                </div>
              </div>
              <div className="rounded-lg border border-divider p-3 space-y-1">
                <div className="text-xs text-default-400">{t("m7f794680f794")}</div>
                <div className="text-sm"> {t("m9145669030ae")} <b>{t("m674ca7d76508")}</b> {t("m6d78078dd933")} <b>{t("mf9fb1cc9500f")}</b>
                </div>
              </div>
            </div>

            {/* 链路图 */}
            <div className="rounded-lg bg-default-100 p-4 overflow-x-auto">
              <div className="flex items-center gap-2 text-sm font-mono whitespace-nowrap">
                <span className="px-2 py-1 rounded bg-default-200">{t("m477581b84e50")}</span>
                <span className="text-primary text-xs">──Reality──▶</span>
                <span className="px-2 py-1 rounded bg-primary/15 text-primary font-medium">{t("m674ca7d76508")}</span>
                <span className="text-warning text-xs">──VLESS──▶</span>
                <span className="px-2 py-1 rounded bg-warning/15 text-warning font-medium">{t("md448d143c4e0")}</span>
                <span className="text-success text-xs">──socks5──▶</span>
                <span className="px-2 py-1 rounded bg-success/15 text-success font-medium">{t("m94782ac82cb8")}</span>
              </div>
            </div>

            <div className="text-xs text-default-500 space-y-2">
              <p>
                <b>{t("m081a5e1e256c")}</b>{t("m8458d679ceb1")} </p>
              <p>
                <b>{t("m34fbde74e18b")}</b>{t("mc49d0bb2217c")} <b>{t("m386d4a6265a2")}</b> {t("m39e8c8376c7b")} </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 对照表 */}
      <div>
        <SectionTitle hint={t("mebea6055e38f")}>{t("me3bf240f9f1b")}</SectionTitle>
        <Card className="border border-divider mt-3">
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-default-200">
                    <th className="py-2.5 pr-4 text-left text-xs font-medium text-default-400 w-36"></th>
                    {FEATURES.map((f) => (
                      <th key={f.name} className="py-2.5 pr-4 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${f.dot}`} />
                          <span className="font-semibold">{f.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-b [&>tr]:border-default-100 [&>tr:last-child]:border-0">
                  {[
                    [t("m077346c3291c"), t("mcf8efc450f71"), t("mcf8efc450f71"), t("mc9ee93870170"), t("mc9ee93870170")],
                    [t("mc0b0b8e1d6db"), t("m90ce0f66f094"), t("m90ce0f66f094"), t("m484d55613910"), t("m155ffb68ae8b")],
                    [t("m319ceca8ef3e"), t("m8a94c4a1cdbd"), t("m6e7480959f57"), t("m4724ee88724a"), t("m4213eb8800d7")],
                    [t("ma8a0c0157902"), t("mb4e17eb44835"), t("mea88d51843da"), t("md6de42b1ec74"), t("m5d5b110bd96a")],
                    [t("m550f9064ef06"), "1", t("m1eb106c67a0a"), "1", t("mf37112790f23")],
                    [t("mf7d4230317cd"), t("m8d9e4cb940d8"), t("m8d9e4cb940d8"), t("m410785bd7347"), t("m410785bd7347")],
                  ].map((row) => (
                    <tr key={row[0]}>
                      <td className="py-2.5 pr-4 text-xs text-default-400 align-top">{row[0]}</td>
                      {row.slice(1).map((cell, i) => (
                        <td key={i} className="py-2.5 pr-4 align-top">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 常见问题 */}
      <div>
        <SectionTitle hint={t("m3128d7b31ae4")}>{t("m45a6d115fdfb")}</SectionTitle>
        <Card className="border border-divider mt-3">
          <CardBody className="px-2">
            <Accordion variant="light" selectionMode="multiple">
              <AccordionItem
                key="q1"
                aria-label={t("mda5f9360029e")}
                title={<span className="text-sm font-medium">{t("m7249898ac28e")}</span>}
              >
                <p className="text-sm text-default-500 leading-relaxed pb-2"> {t("ma2d32d8a8302")}<b>{t("m792d53a27314")}</b>{t("mf7513db642d0")} <b>{t("me04b7a218055")}</b>
                </p>
              </AccordionItem>

              <AccordionItem
                key="q2"
                aria-label={t("m426639299bcf")}
                title={<span className="text-sm font-medium">{t("m71d84d167180")}</span>}
              >
                <p className="text-sm text-default-500 leading-relaxed pb-2"> {t("m467f941cddd6")}<b>{t("mfbf413d429bd")}</b>{t("mf375a157197b")}<b>{t("m18470a0cc9a1")}</b>{t("m7c9c8ef90aa7")} <b>{t("m646f00bb877e")}</b>{t("m9cc96956abfe")}<b>{t("m1de6323c2f75")}</b>{t("m4ab6d5e17558")} <b>{t("m81921cc9b1f7")}</b> {t("m89db9985ac5b")} </p>
              </AccordionItem>

              <AccordionItem
                key="q3"
                aria-label={t("m573f77c42156")}
                title={<span className="text-sm font-medium">{t("me51a7c131491")}</span>}
              >
                <p className="text-sm text-default-500 leading-relaxed pb-2"> {t("mff6851a5eaf3")} </p>
              </AccordionItem>

              <AccordionItem
                key="q4"
                aria-label={t("m1746375bc171")}
                title={<span className="text-sm font-medium">{t("ma1eb92e7560b")}</span>}
              >
                <p className="text-sm text-default-500 leading-relaxed pb-2"> {t("m3310921b8de5")} <code className="font-mono text-xs">127.0.0.1:40000+</code>{t("m008a6b6cbd6c")} <code className="font-mono text-xs">inbound-tunnel-node*</code> {t("m244dbf4c4777")} <code className="font-mono text-xs">inbound-*-user-*</code> {t("m6206a99c843a")}<b>{t("m5ac9ba017fec")}</b>。
                </p>
              </AccordionItem>
            </Accordion>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
