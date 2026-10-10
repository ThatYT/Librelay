import ProtocolPortButton from "@/components/protocol-port-button";
import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";
import toast from "@/utils/toast";
import { toastResult } from "@/utils/partial-success";
import {
  getInboundList,
  oneClickRelay,
  testLanding,
  deleteInboundsByNode,
  getNodeList,
  getLandingList,
} from "@/api";
import { SNI_PRESETS, DEFAULT_SNI, cleanSni } from "@/config/sni";

/**
 * 中转(前置机协议 + 落地出口)· 机器卡模式。
 * 搭中转时当场填落地(粘贴分享链接/住宅socks)→ 经前置机测试通 → 保存搭建。
 * 车友连的还是前置机的订阅,只是出口 IP 在落地那台。
 */
export default function RelayPage() {
  useTranslation();
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [landings, setLandings] = useState<any[]>([]);

  const [buildOpen, setBuildOpen] = useState(false);
  const [buildForm, setBuildForm] = useState<any>({ nodeId: null, name: "", link: "", sni: DEFAULT_SNI, listenPort: "443" });
  const [buildLoading, setBuildLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null); // {ok, exitIp, latencyMs, skipped, msg}

  const loadAll = async () => {
    try {
      const [ib, nd, ld] = await Promise.all([
        getInboundList(),
        getNodeList(),
        getLandingList(),
      ]);
      if (ib.code === 0) setInbounds(ib.data || []);
      if (nd.code === 0) setNodes(nd.data || []);

      if (ld.code === 0) setLandings(ld.data || []);
    } catch (e) {
      toast.error(t("md1d044826a45"));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const protoLabel = (p: string) =>
    (({ vless: "VLESS-Reality", trojan: "Trojan-Reality", vmess: "VMess", shadowsocks: "Shadowsocks-2022", hysteria2: "Hysteria2", tuic: "TUIC", anytls: "AnyTLS" } as any)[p] || p);
  const landingById = (id: any) => landings.find((l) => l.id === id);

  const handleTest = async () => {
    if (!buildForm.nodeId) return toast.error(t("m064ba3b75aba"));
    if (!buildForm.link) return toast.error(t("m62248cacf80f"));
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await testLanding(buildForm.nodeId, buildForm.link);
      if (res.code === 0) {
        setTestResult(res.data);
        if (res.data?.skipped) toast.success(res.data?.msg || t("mcc453f867926"));
        else if (res.data?.ok) toast.success(t("m3cb15fba3007", {v0: res.data?.exitIp}));
      } else {
        setTestResult({ ok: false, msg: res.msg });
        toast.error(res.msg || t("m77c9e582e855"));
      }
    } catch (e) {
      toast.error(t("m77c9e582e855"));
    }
    setTestLoading(false);
  };

  const handleBuild = async () => {
    if (!buildForm.nodeId) return toast.error(t("mbcfd611a459f"));
    if (!buildForm.link) return toast.error(t("mf224d1fc65ac"));
    if (!/^\d+$/.test(buildForm.listenPort) || Number(buildForm.listenPort) < 1 || Number(buildForm.listenPort) > 65535) return toast.error(t("port.range"));
    setBuildLoading(true);
    try {
      const res = await oneClickRelay(buildForm.nodeId, buildForm.link, buildForm.name, cleanSni(buildForm.sni), Number(buildForm.listenPort));
      // 同 inbound 页:半成功(「中转已入库,但下发配置失败」「中断…已成功 N 个」)
      // 协议是真建出来了,不该报红条、不该把弹窗晾着让人再点一次。
      if (toastResult(res, t("mef8bfddf4d9d"), t("m0088b5d170f1"), toast)) {
        setBuildOpen(false);
      }
      loadAll(); // 真失败也刷,列表要回到面板真实的样子
    } catch (e) {
      toast.error(t("m0088b5d170f1"));
    }
    setBuildLoading(false);
  };

  const handleClearNode = async (nodeId: number, nodeName: string, landingId: any, landingName: string) => {
    if (!window.confirm(t("m80b4eceda814", {v0: nodeName, v1: landingName}))) return;
    const res = await deleteInboundsByNode(nodeId, true, landingId);
    if (res.code === 0) {
      toast.success(t("m1df1b6c301fc"));
      loadAll();
    } else {
      toast.error(res.msg || t("m660fb1b057cd"));
    }
  };

  // 中转线路 = 每(前置机 × 落地)一条卡
  const relayLines: any[] = [];
  nodes.forEach((n) => {
    const relayIbs = inbounds.filter((ib) => ib.nodeId === n.id && ib.landingId);
    const lids = Array.from(new Set(relayIbs.map((ib) => ib.landingId)));
    lids.forEach((lid) => {
      relayLines.push({ node: n, landingId: lid, inbounds: relayIbs.filter((ib) => ib.landingId === lid) });
    });
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">{t("m7f785150a8e2")}</h1>
        <Button
          color="secondary"
          onPress={() => {
            setBuildForm({ nodeId: null, name: "", link: "", sni: DEFAULT_SNI, listenPort: "443" });
            setTestResult(null);
            setBuildOpen(true);
          }}
        > {t("m52f22a5734e6")} </Button>
      </div>

      <div className="text-xs text-default-500"> {t("mdae67e01060a")} </div>

      {/* 每(前置机 × 落地)一张卡 = 一条中转线路 */}
      <div className="grid gap-3 md:grid-cols-2">
        {relayLines.map((ln) => {
          const n = ln.node;
          const l = landingById(ln.landingId);
          const landingName = l ? `${l.name}(${l.type})` : t("ma118bf00ad6b", {v0: ln.landingId});
          const online = n.status === 1;
          const firstIp = n.ip ? String(n.ip).split(",")[0].trim() : (n.serverIp || "");
          return (
            <Card key={`${n.id}-${ln.landingId}`}>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold truncate">🖥️ {n.name}</span>
                  <Chip size="sm" variant="flat" color={online ? "success" : "default"}>{online ? t("mb9086662b1df") : t("mbe1b4f3c6c1c")}</Chip>
                  <Chip size="sm" variant="flat" color="primary" className="ml-auto">{ln.inbounds.length} {t("mab2f31f30acf")}</Chip>
                </div>
                {firstIp && <div className="text-xs text-default-500 font-mono">{t("md9138ea30edc")} {firstIp}</div>}
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-default-500">{t("m1fa2cdf4fe20")}</span>
                  <Chip size="sm" variant="flat" color="warning">{landingName}</Chip>
                </div>
                <div className="flex flex-wrap gap-1">
                  {ln.inbounds.map((ib: any) => (
                    <Chip key={ib.id} size="sm" variant="flat" color="secondary">{protoLabel(ib.protocol)}:{ib.listenPort} <ProtocolPortButton entry={ib} onSaved={loadAll} /></Chip>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" color="danger" variant="flat" onPress={() => handleClearNode(n.id, n.name, ln.landingId, landingName)}> {t("m23157042bc53")} </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
      {relayLines.length === 0 && (
        <div className="text-center text-default-400 py-8"> {t("m0f71195d194c")} </div>
      )}

      {/* 「我自己用」结果:直接把订阅链接给出来 */}
      <Modal isOpen={buildOpen} onClose={() => setBuildOpen(false)} size="2xl">
        <ModalContent>
          <ModalHeader>{t("m52f22a5734e6")}</ModalHeader>
          <ModalBody className="space-y-3">
            <div className="text-sm text-default-500"> {t("ma8a5cfaa97e5")} </div>
            <Select
              label={t("mf2954dfb7298")}
              placeholder={t("mffb7e36adb6c")}
              selectedKeys={buildForm.nodeId ? [String(buildForm.nodeId)] : []}
              onSelectionChange={(k) => { setBuildForm({ ...buildForm, nodeId: Number(Array.from(k)[0]) }); setTestResult(null); }}
            >
              {nodes.map((n) => (<SelectItem key={n.id}>{n.name}</SelectItem>))}
            </Select>
            <Input
              label={t("mc9e137cfc059")}
              placeholder={t("m4f792585e7e7")}
              value={buildForm.name}
              onChange={(e) => setBuildForm({ ...buildForm, name: e.target.value })}
            />
            <Textarea
              label={t("mee1e05d40e75")}
              placeholder={t("m85ad1ee2ae49")}
              minRows={2}
              value={buildForm.link}
              onChange={(e) => { setBuildForm({ ...buildForm, link: e.target.value }); setTestResult(null); }}
              description={t("m657bcb1864c5")}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="flat" color="secondary" isLoading={testLoading} onPress={handleTest}>{t("m2a265b5af141")}</Button>
              {testResult && (
                testResult.skipped ? (
                  <span className="text-xs text-default-500">{testResult.msg}</span>
                ) : testResult.ok ? (
                  <span className="text-xs text-success">{t("m271e92ef9033")} <b className="font-mono">{testResult.exitIp}</b> · {testResult.latencyMs}ms</span>
                ) : (
                  <span className="text-xs text-danger">❌ {testResult.msg || t("m7badfabc6ef1")}</span>
                )
              )}
            </div>
            {/* Reality 借壳域名:建在前置机上的协议用,给个常用列表也允许自己输 */}
            <Input label={t("port.label")} type="number" min={1} max={65535} value={buildForm.listenPort}
              onValueChange={(listenPort) => setBuildForm({ ...buildForm, listenPort })} />
            <Autocomplete
              label={t("me2ff9a4822f7")}
              allowsCustomValue
              defaultItems={SNI_PRESETS}
              inputValue={buildForm.sni}
              onInputChange={(v) => setBuildForm({ ...buildForm, sni: v })}
              onSelectionChange={(k) => { if (k) setBuildForm({ ...buildForm, sni: String(k) }); }}
              description={t("ma233605d1c72")}
            >
              {(item: any) => <AutocompleteItem key={item.value} description={item.desc || undefined}>{item.label}</AutocompleteItem>}
            </Autocomplete>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setBuildOpen(false)}>{t("m2cd0f3be8738")}</Button>
            <Button color="secondary" isLoading={buildLoading} onPress={handleBuild}>{t("md64076b84217")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
