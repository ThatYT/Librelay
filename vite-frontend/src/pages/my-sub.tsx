import { getSubscriptionUrl } from "@/api/network";
import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import toast from "@/utils/toast";
import { getMyLines, getUserPackageInfo, deleteLine } from "@/api";
import { isAdmin } from "@/utils/auth";
import { JwtUtil } from "@/utils/jwt";
import { copyTextToClipboard } from "@/utils/clipboard";
import { SubQrToggle } from "@/components/sub-qr";

/**
 * 我的订阅(车友视角)· 一条订阅 = 一个套餐。
 * 每条线路各自带流量配额、到期、状态——不存在"账号总流量"这种混淆概念。
 * 车友只管复制链接导客户端,内部的机器/端口/转发对他隐藏。
 */
export default function MySubPage() {
  useTranslation();
  const [lines, setLines] = useState<any[]>([]);
  // 「全部线路」聚合订阅:一条链接包含他所有线路,以后新开线路也不用重发
  const [allSubToken, setAllSubToken] = useState<string>("");
  const [account, setAccount] = useState<any>(null); // 只用来判断账号是否被停用/到期
  const [loading, setLoading] = useState(true);

  const subUrl = (token: string) => getSubscriptionUrl('sub', token);
  // Clash / Mihomo 是另一套格式(YAML),和上面那条 base64 链接列表不通用。
  // 用 Clash Verge、ClashMeta 的人贴上面那条会得到一个空订阅。
  const clashUrl = (token: string) => getSubscriptionUrl('clash', token);

  const load = async () => {
    try {
      const [ln, pkg] = await Promise.all([getMyLines(), getUserPackageInfo()]);
      if (ln.code === 0) {
        // 后端返回结构从数组改成了 {lines, allSubToken},这里两种都认,
        // 万一前后端镜像版本不同步也不会白屏
        const d: any = ln.data;
        setLines(Array.isArray(d) ? d : (d?.lines || []));
        if (!Array.isArray(d) && d?.allSubToken) setAllSubToken(d.allSubToken);
      }
      if (pkg.code === 0) setAccount(pkg.data?.userInfo || null);
    } catch (e) {
      toast.error(t("md1d044826a45"));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const GB = 1024 * 1024 * 1024;
  const fmtGB = (bytes: number) => ((bytes || 0) / GB).toFixed(2) + " GB";
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString();

  // 账号级异常(被管理员停用 / 账号到期)才提示,平时不打扰
  // 必须转成真正的布尔值:exp_time = 0 表示「永久」,而 `0 && ...` 返回的是 0 不是 false,
  // React 会把这个 0 原样渲染到页面上(标题下面凭空多出一个 "0")
  const accountDisabled = !!account && account.status !== undefined && account.status !== 1;
  const accountUsed = (account?.inFlow || 0) + (account?.outFlow || 0);
  const accountExhausted = !!account?.unifiedLimits && account.flow > 0 && accountUsed >= account.flow * GB;
  const accountExpired = !!account?.expTime && account.expTime > 0 && account.expTime <= Date.now();

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-bold">{t("m79aad303b15f")}</h1>
        <span className="text-sm text-default-500">{t("m76e547a8fa54")} {lines.length} {t("m17f2bbb8b6fb")}</span>
      </div>

      {(accountDisabled || accountExpired || accountExhausted) && (
        <Card className="border border-danger/40 bg-danger/5">
          <CardBody className="text-sm text-danger"> {accountExhausted ? t("limits.exhausted") : t("m5f1fe6db40fa")}{accountExpired ? t("mb9d8853e0ce7") : t("m59c007695802")}{t("m10d6df652718")} </CardBody>
        </Card>
      )}

      {account?.unifiedLimits && (
        <Card><CardBody className="space-y-2">
          <h2 className="font-semibold">{t("limits.account")}</h2>
          <p>{fmtGB(accountUsed)} / {account.flow > 0 ? `${account.flow} GiB` : t("limits.unlimited")}</p>
          <p>{t("limits.speedShort")}: {account.speedMbps > 0 ? `${account.speedMbps} Mbps` : t("limits.unlimited")}</p>
          <p className="text-xs text-default-500">{t("limits.explain")}</p>
        </CardBody></Card>
      )}

      {!loading && allSubToken && lines.length > 1 && (
        <Card className="border border-primary/40 bg-primary/5">
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Chip size="sm" color="primary" variant="flat">{t("m385a5053e4c5")}</Chip>
              <span className="text-sm text-default-600">{t("m517c5f888be4")}</span>
              <Chip size="sm" variant="flat" className="ml-auto">
                {lines.reduce((n: number, l: any) => n + (l.protocolCount || 0), 0)} {t("mab2f31f30acf")} </Chip>
            </div>
            <Input
              readOnly
              size="sm"
              value={subUrl(allSubToken)}
              onClick={(e: any) => { if (e.target?.select) e.target.select(); }}
            />
            <div className="flex gap-2 items-start">
              <Button
                size="sm"
                color="primary"
                onPress={async () => {
                  (await copyTextToClipboard(subUrl(allSubToken)))
                    ? toast.success(t("mf428fcdd76c7"))
                    : toast.error(t("md9c9f3be73c7"));
                }}
              > {t("m1541c2076c07")} </Button>
              <SubQrToggle url={subUrl(allSubToken)} />
              <Button
                size="sm"
                variant="flat"
                onPress={async () => {
                  (await copyTextToClipboard(clashUrl(allSubToken)))
                    ? toast.success(t("m4208eddf743e"))
                    : toast.error(t("m79b2fbf1e922"));
                }}
              > {t("m8edcbedd09a7")} </Button>
            </div>
            <div className="text-xs text-default-400"> {t("ma60ebbb0a571")} </div>
            <div className="text-xs text-default-400"> {t("m04e45efb3be8")} <span className="text-default-500">{t("m608e0e1f41a5")}</span> {t("me2dbef49d664")} <span className="text-default-500">Clash Verge / ClashMeta / Mihomo</span> {t("m55395cf84f3d")} </div>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="text-center text-default-400 py-8">{t("m9dc0825fba54")}</div>
      ) : lines.length === 0 ? (
        <Card>
          <CardBody className="text-center text-default-400 py-8"> {t("m523ff309e600")} </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {lines.map((ln: any, idx: number) => {
            const url = subUrl(ln.subToken);
            const isRelay = ln.type === "relay";
            const used = ln.flow || 0;
            const quota = ln.quotaGb > 0 ? ln.quotaGb * GB : 0;
            const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
            const stopped = ln.lineStatus === 0;
            return (
              <Card key={idx} className={stopped ? "opacity-70" : ""}>
                <CardBody className="space-y-3">
                  {/* 标题行:类型 + 机器 + 协议数 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip size="sm" variant="flat" color={isRelay ? "warning" : "primary"}>
                      {isRelay ? t("m7e92caa8ec8c", {v0: ln.landingName ? "→" + ln.landingName : ""}) : t("m01d28f2c903a")}
                    </Chip>
                    <span className="font-medium truncate">{ln.nodeName}</span>
                    {stopped && <Chip size="sm" color="danger" variant="flat">{t("ma8c3698b5b8c")}</Chip>}
                    <Chip size="sm" variant="flat" className="ml-auto">{ln.protocolCount} {t("mab2f31f30acf")}</Chip>
                  </div>

                  {/* 这条订阅自己的套餐:流量 + 到期 */}
                  {!account?.unifiedLimits && <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-default-500 text-xs">{t("m81a9d0b5a2a2")} </span>
                      <span className="font-semibold">{fmtGB(used)}</span>
                      <span className="text-default-400">
                        {quota > 0 ? ` / ${ln.quotaGb} GB` : t("m5f1ef15182bc")}
                      </span>
                    </div>
                    <div>
                      <span className="text-default-500 text-xs">{t("m1f29b74ad60c")} </span>
                      <span className="font-semibold">
                        {ln.lineExpTime ? fmtDate(ln.lineExpTime) : t("m3e71ccc89a43")}
                      </span>
                    </div>
                  </div>}
                  {!account?.unifiedLimits && quota > 0 && (
                    <div className="w-full h-1.5 bg-default-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  {/* 订阅链接 */}
                  <Input
                    readOnly
                    size="sm"
                    value={url}
                    onClick={(e: any) => { if (e.target?.select) e.target.select(); }}
                  />
                  <div className="flex gap-2 items-start">
                    <Button
                      size="sm"
                      color="primary"
                      onPress={async () => {
                        (await copyTextToClipboard(url))
                          ? toast.success(t("mf428fcdd76c7"))
                          : toast.error(t("md9c9f3be73c7"));
                      }}
                    > {t("m1541c2076c07")} </Button>
                    <SubQrToggle url={url} />
                    {/* 删除只给管理员看。这一页车友也在用,而删线路是不可逆的 ——
                        端口会释放,以后要再用得管理员重新分配、重新发一遍链接。
                        车友手滑点一下就得来找人重开,这个成本不该由界面制造。
                        要收回别人的线路仍然走「用户管理」,那边还多一个可逆的「停用」。 */}
                    {isAdmin() && (
                      <>
                        <div className="flex-1" />
                        <Button
                          size="sm"
                          variant="light"
                          color="danger"
                          onPress={async () => {
                            const myId = JwtUtil.getUserIdFromToken();
                            if (myId == null) return toast.error(t("m030e2615abd3"));
                            if (!confirm(t("m9036360d6bd4", {v0: ln.nodeName, v1: ln.protocolCount}))) return;
                            const res = await deleteLine(myId, ln.nodeId, ln.landingId ?? null);
                            if (res.code === 0) {
                              toast.success(t("m76dbcf21457f"));
                              await load();
                            } else {
                              toast.error(res.msg || t("mc228558cf257"));
                            }
                          }}
                        > {t("m2f9daa828907")} </Button>
                      </>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* 用法 */}
      <Card>
        <CardBody className="space-y-2 text-sm text-default-600">
          <div className="font-semibold">{t("m9fe7ee970509")}</div>
          <div>{t("m54970f9c5592")}</div>
          <ul className="list-disc pl-5 space-y-1 text-default-500">
            <li><b>v2rayN(Windows)</b>{t("me9b379ddc89c")}</li>
            <li><b>{t("mdc1dcf97bfde")}</b>{t("m3aa10183b9e4")}</li>
            <li><b>{t("m7fb723cbcdb6")}</b>{t("m82436d9b4d6a")}</li>
          </ul>
          <div className="text-xs text-default-400"> {t("m5a35279c1180")} </div>
        </CardBody>
      </Card>
    </div>
  );
}
