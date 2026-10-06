import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import toast from "@/utils/toast";
import {
  getLandingList,
  createLanding,
  updateLanding,
  deleteLanding,
  testLanding,
  getInboundList,
  getNodeList,
} from "@/api";
import { copyTextToClipboard } from "@/utils/clipboard";

/**
 * 落地管理。
 *
 * 为什么单独开一页:以前落地只能在「中转」页搭中转时顺手填一条,建完就再也看不到、改不了。
 * 粉丝原话:「创建完成后,落地出口(socks5)配置无法二次更改……只能删除这个中转协议,
 * 重新再次创建,然后又要去指挥舱删除不需要的协议,逻辑上来说就有点复杂了」。
 * 后端的 create/update/delete/test 四个接口一直都在,缺的只是这个前端入口。
 *
 * 改落地会让后端把【用到它的机器】全部重推一遍 sing-box 配置,所以换代理串是安全的:
 * 车友的订阅链接、UUID、端口都不变,只有出口 IP 变了。
 */
export default function LandingPage() {
  useTranslation();
  const [landings, setLandings] = useState<any[]>([]);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 新建/编辑共用一个弹窗:form.id 有值 = 编辑
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ id: null, name: "", link: "", remark: "" });
  const [saving, setSaving] = useState(false);

  // 弹窗里的「经哪台前置机测」
  const [testNodeId, setTestNodeId] = useState<number | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // 列表行上的快速测试:结果按落地 id 存
  const [rowTesting, setRowTesting] = useState<number | null>(null);
  const [rowResult, setRowResult] = useState<Record<number, any>>({});

  const loadAll = async () => {
    try {
      const [ld, ib, nd] = await Promise.all([getLandingList(), getInboundList(), getNodeList()]);
      if (ld.code === 0) setLandings(ld.data || []);
      if (ib.code === 0) setInbounds(ib.data || []);
      if (nd.code === 0) setNodes(nd.data || []);
    } catch (e) {
      toast.error(t("md1d044826a45"));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // 这条落地被谁在用。后端删除时会按同一口径拒绝,所以先在卡片上显示出来,
  // 免得用户点了删除才被告知「正在被 6 个中转协议使用」。
  const usageOf = (landingId: number) => {
    const ibs = inbounds.filter((ib) => ib.landingId === landingId);
    const nodeIds = Array.from(new Set(ibs.map((ib) => ib.nodeId))).filter((x) => x != null);
    return { count: ibs.length, nodeIds: nodeIds as number[] };
  };
  const nodeName = (id: number) => nodes.find((n) => n.id === id)?.name || t("mfb4424ab26ed", {v0: id});

  const typeColor = (t: string) =>
    t === "socks5" ? "warning" : t === "direct" ? "default" : "secondary";

  const openCreate = () => {
    setForm({ id: null, name: "", link: "", remark: "" });
    setTestNodeId(nodes[0]?.id ?? null);
    setTestResult(null);
    setOpen(true);
  };

  const openEdit = (l: any) => {
    // origLink 只为判断「出口换没换」:换了就得把卡片上那条旧的测试结果扔掉(见 finishSave)
    setForm({ id: l.id, name: l.name || "", link: l.link || "", remark: l.remark || "", origLink: l.link || "" });
    // 默认用「已经在跑这条落地」的那台机器去测 —— 那台才是真正会受影响的
    setTestNodeId(usageOf(l.id).nodeIds[0] ?? nodes[0]?.id ?? null);
    setTestResult(null);
    setOpen(true);
  };

  const handleTest = async () => {
    if (!testNodeId) return toast.error(t("m0b46d31120bb"));
    if (!form.link.trim()) return toast.error(t("m112184666a49"));
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await testLanding(testNodeId, form.link.trim());
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

  // 保存成功(含「改了但没推上」)之后的收尾。
  // 出口一换,卡片上那条测试结果就是【上一条链接】的成绩了,继续挂着等于骗人 —— 直接扔掉。
  // 只改了名字/备注则保留,省得白测一次。
  const finishSave = () => {
    if (form.id && form.origLink !== undefined && form.origLink !== form.link.trim()) {
      setRowResult((p) => {
        const n = { ...p };
        delete n[form.id];
        return n;
      });
    }
    setOpen(false);
    loadAll();
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error(t("m4fd70a48e0e0"));
    if (!form.link.trim()) return toast.error(t("m56ce089a68ce"));
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), link: form.link.trim(), remark: form.remark?.trim() || "" };
      const res = form.id
        ? await updateLanding({ id: form.id, ...payload })
        : await createLanding(payload);

      if (res.code === 0) {
        const u = form.id ? usageOf(form.id) : { count: 0, nodeIds: [] };
        toast.success(
          form.id
            ? u.nodeIds.length
              ? t("mca7642780c3e", {v0: u.nodeIds.length})
              : t("m1bd91a7d0c53")
            : t("mc5d7ea1c9fa4"),
        );
        finishSave();
      } else if (form.id && res.msg && res.msg.startsWith("落地已改")) {
        // 后端这条是【半成功】:库已经改完,只是有机器没推上(多半离线)。
        // 当成失败会更糟 —— 弹窗不关、列表不刷新,用户会以为改动没保存、再改一遍。
        toast(res.msg, { icon: "⚠️", duration: 8000 });
        finishSave();
      } else {
        toast.error(res.msg || t("m6309a3bb5ba4"));
      }
    } catch (e) {
      toast.error(t("m6309a3bb5ba4"));
    }
    setSaving(false);
  };

  const handleDelete = async (l: any) => {
    const u = usageOf(l.id);
    if (u.count > 0) {
      // 后端也会拦(口径一样),这里提前说清楚,省一次往返和一次困惑
      toast.error(t("m99c74db4179f", {v0: l.name, v1: u.count, v2: u.nodeIds.map(nodeName).join("、")}), { duration: 8000 });
      return;
    }
    if (!window.confirm(t("m1af27cc84027", {v0: l.name}))) return;
    try {
      const res = await deleteLanding(l.id);
      if (res.code === 0) {
        toast.success(t("m077a6d37719a"));
        loadAll();
      } else {
        toast.error(res.msg || t("mc228558cf257"));
      }
    } catch (e) {
      toast.error(t("mc228558cf257"));
    }
  };

  // 行内快速测试:用正在跑它的那台机器去拨。没机器在用就测不了(测试必须经一台前置机)
  const handleRowTest = async (l: any) => {
    const nid = usageOf(l.id).nodeIds[0] ?? nodes[0]?.id;
    if (!nid) return toast.error(t("m8e6798b23a99"));
    setRowTesting(l.id);
    try {
      const res = await testLanding(nid, l.link);
      setRowResult((p) => ({
        ...p,
        [l.id]: res.code === 0 ? { ...res.data, via: nodeName(nid) } : { ok: false, msg: res.msg, via: nodeName(nid) },
      }));
      if (res.code !== 0) toast.error(res.msg || t("m77c9e582e855"));
    } catch (e) {
      toast.error(t("m77c9e582e855"));
    }
    setRowTesting(null);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">{t("m44989b913d7b")}</h1>
        <Button color="warning" onPress={openCreate}>{t("mfcfef2cedf4b")}</Button>
      </div>

      <div className="text-xs text-default-500"> {t("m318b58da8754")}<b>{t("m61c2ab9c0b30")}</b>{t("ma0b3104d2fc7")} </div>

      {loading ? (
        <div className="text-center text-default-400 py-8">{t("m4927a53bcc88")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {landings.map((l) => {
            const u = usageOf(l.id);
            const r = rowResult[l.id];
            return (
              <Card key={l.id}>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold truncate">🌐 {l.name}</span>
                    <Chip size="sm" variant="flat" color={typeColor(l.type) as any}>{l.type}</Chip>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={u.count > 0 ? "primary" : "default"}
                      className="ml-auto shrink-0"
                    >
                      {u.count > 0 ? t("mdff81dbfc0e0", {v0: u.count}) : t("mdae661d17c2d")}
                    </Chip>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-xs font-mono text-default-500 truncate flex-1" title={l.link}>
                      {l.link}
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={async () => {
                        (await copyTextToClipboard(l.link))
                          ? toast.success(t("m0d990a51f43e"))
                          : toast.error(t("m753d8bb0da99"));
                      }}
                    >
                      📋
                    </Button>
                  </div>

                  {u.nodeIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-default-500">{t("m2f3c2efbf3a4")}</span>
                      {u.nodeIds.map((nid) => (
                        <Chip key={nid} size="sm" variant="flat" color="secondary">{nodeName(nid)}</Chip>
                      ))}
                    </div>
                  )}

                  {l.remark && <div className="text-xs text-default-400">{t("m53b2ca9aff9b")}{l.remark}</div>}

                  {r && (
                    <div className="text-xs">
                      {r.skipped ? (
                        <span className="text-default-500">{r.msg}</span>
                      ) : r.ok ? (
                        <span className="text-success">{t("m271e92ef9033")} <b className="font-mono">{r.exitIp}</b> · {r.latencyMs}{t("m4090f813fb0b")} {r.via}</span>
                      ) : (
                        <span className="text-danger">❌ {r.msg || t("m7badfabc6ef1")}{t("m9a2d0a6da781")} {r.via})</span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" color="primary" variant="flat" className="flex-1" onPress={() => openEdit(l)}> {t("m0ed9861c7c8e")} </Button>
                    <Button
                      size="sm"
                      color="secondary"
                      variant="flat"
                      isLoading={rowTesting === l.id}
                      onPress={() => handleRowTest(l)}
                    > {t("md88530d313f0")} </Button>
                    <Button size="sm" color="danger" variant="flat" onPress={() => handleDelete(l)}> {t("m2f9daa828907")} </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && landings.length === 0 && (
        <div className="text-center text-default-400 py-8"> {t("m26880cce159a")} </div>
      )}

      {/* 新建 / 编辑 */}
      <Modal isOpen={open} onClose={() => setOpen(false)} size="2xl">
        <ModalContent>
          <ModalHeader>{form.id ? t("m7c7d3481d252") : t("mfcfef2cedf4b")}</ModalHeader>
          <ModalBody className="space-y-3">
            {form.id && usageOf(form.id).nodeIds.length > 0 && (
              <div className="text-xs bg-warning-50 text-warning-700 dark:bg-warning-100/10 dark:text-warning-500 rounded-lg px-3 py-2"> {t("mddec472285c3")} <b>{usageOf(form.id).nodeIds.map(nodeName).join("、")}</b> {t("me6dc70eb0065")} </div>
            )}
            <Input
              label={t("m85ec36a512c9")}
              placeholder={t("mbdd6a8231fe1")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Textarea
              label={t("mc22636f69e10")}
              placeholder={t("m85ad1ee2ae49")}
              minRows={2}
              value={form.link}
              onChange={(e) => { setForm({ ...form, link: e.target.value }); setTestResult(null); }}
              description={t("mc5085bcde78b")}
            />
            <Input
              label={t("m97cf9a175f3d")}
              placeholder={t("m7c5ca5319719")}
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
            />
            <div className="flex items-end gap-2">
              <Select
                label={t("mf62bf36832a1")}
                size="sm"
                className="flex-1"
                selectedKeys={testNodeId ? [String(testNodeId)] : []}
                onSelectionChange={(k) => { setTestNodeId(Number(Array.from(k)[0])); setTestResult(null); }}
              >
                {nodes.map((n) => (<SelectItem key={n.id}>{n.name}</SelectItem>))}
              </Select>
              <Button size="sm" variant="flat" color="secondary" isLoading={testLoading} onPress={handleTest}> {t("m2a265b5af141")} </Button>
            </div>
            {testResult && (
              <div className="text-xs">
                {testResult.skipped ? (
                  <span className="text-default-500">{testResult.msg}</span>
                ) : testResult.ok ? (
                  <span className="text-success">{t("m271e92ef9033")} <b className="font-mono">{testResult.exitIp}</b> · {testResult.latencyMs}ms</span>
                ) : (
                  <span className="text-danger">❌ {testResult.msg || t("m7badfabc6ef1")}</span>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setOpen(false)}>{t("m2cd0f3be8738")}</Button>
            <Button color="warning" isLoading={saving} onPress={handleSave}>
              {form.id ? t("m493fd3b9d4a6") : t("mcde2cd071d25")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
