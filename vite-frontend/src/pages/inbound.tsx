import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { defaultProtocolPort, parseProtocolPort } from "@/utils/protocol-port";
import { useState, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";
import toast from "@/utils/toast";
import { toastResult } from "@/utils/partial-success";
import {
  getInboundList,
  createInbound,
  updateInboundPort,
  oneClickInbound,
  deleteInboundsByNode,
  getNodeList,
  pushNodeConfig,
} from "@/api";
import { SNI_PRESETS, DEFAULT_SNI, cleanSni } from "@/config/sni";

/**
 * 协议管理(合体面板)· 机器卡模式。
 * 一台机器 = 一张卡(卡上折叠着这台机器的全套协议)。
 * Access is assigned explicitly from User Management.
 */
export default function InboundPage() {
  useTranslation();
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<any>({ nodeId: null, protocol: "vless", sni: DEFAULT_SNI, dest: "", remark: "", listenPort: "443" });
  const [createLoading, setCreateLoading] = useState(false);
  const [portEntry, setPortEntry] = useState<any>(null);
  const [editPort, setEditPort] = useState("");
  const [portSaving, setPortSaving] = useState(false);
  const savePort = async () => {
    if (!/^\d+$/.test(editPort) || Number(editPort) < 1 || Number(editPort) > 65535) return toast.error(t("port.range"));
    setPortSaving(true);
    try {
      const response = await updateInboundPort(portEntry.id, Number(editPort));
      if (response.code === 0) { toast.success(t("port.updated")); setPortEntry(null); loadAll(); }
      else toast.error(response.msg || t("port.failed"));
    } catch { toast.error(t("port.failed")); }
    finally { setPortSaving(false); }
  };

  const [oneClickOpen, setOneClickOpen] = useState(false);
  const [oneClickNodeId, setOneClickNodeId] = useState<number | null>(null);
  const [oneClickPort, setOneClickPort] = useState("443");
  const [oneClickSni, setOneClickSni] = useState<string>(DEFAULT_SNI);
  const [oneClickLoading, setOneClickLoading] = useState(false);

  // 机器卡「分配用户」:把整台机器的协议分给车友(只分配,链接去「用户管理」拿)
  const [pushing, setPushing] = useState<number | null>(null);

  const loadAll = async () => {
    try {
      const [ib, nd] = await Promise.all([
        getInboundList(),
        getNodeList(),
      ]);
      if (ib.code === 0) setInbounds(ib.data || []);
      if (nd.code === 0) setNodes(nd.data || []);

    } catch (e) {
      toast.error(t("md1d044826a45"));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const protoLabel = (p: string) =>
    (({ vless: "VLESS-Reality", trojan: "Trojan-Reality", vmess: "VMess", shadowsocks: "Shadowsocks-2022", hysteria2: "Hysteria2", tuic: "TUIC", anytls: "AnyTLS" } as any)[p] || p);
  const isReality = (p: string) => p === "vless" || p === "trojan";

  const handleCreate = async () => {
    if (!createForm.nodeId) return toast.error(t("m8e5fd7759166"));
    if (isReality(createForm.protocol) && !createForm.sni) return toast.error(t("mb49080a2f3b9"));
    const listenPort = parseProtocolPort(createForm.listenPort);
    if (listenPort === null) return toast.error(t("port.range"));
    setCreateLoading(true);
    try {
      // 界面上「VMess + WebSocket」是一个独立选项,但后端没有 vmess-ws 这个协议 ——
      // 传输层是 vmess 的修饰,不是另一种协议。所以在这儿拆开:protocol=vmess + transport=ws。
      const isWs = createForm.protocol === "vmess-ws";
      const payload: any = {
        nodeId: createForm.nodeId,
        protocol: isWs ? "vmess" : createForm.protocol,
        remark: createForm.remark,
      };
      if (listenPort !== undefined) payload.listenPort = listenPort;
      if (isWs) {
        payload.transport = "ws";
        payload.wsPath = createForm.wsPath || "";   // 留空由后端随机生成
        payload.wsHost = createForm.wsHost || "";
      }
      if (isReality(createForm.protocol)) {
        payload.sni = cleanSni(createForm.sni);
        payload.dest = createForm.dest;
      }
      const res = await createInbound(payload);
      if (res.code === 0) {
        toast.success(t("m2fcabc033c6c"));
        setCreateOpen(false);
        loadAll();
      } else {
        toast.error(res.msg || t("m7e6a71efbf63"));
      }
    } catch (e) {
      toast.error(t("m7e6a71efbf63"));
    }
    setCreateLoading(false);
  };

  const handleOneClick = async () => {
    if (!oneClickNodeId) return toast.error(t("m8e5fd7759166"));
    if (!/^\d+$/.test(oneClickPort) || Number(oneClickPort) < 1 || Number(oneClickPort) > 65535) return toast.error(t("port.range"));
    setOneClickLoading(true);
    try {
      const res = await oneClickInbound(oneClickNodeId, cleanSni(oneClickSni), Number(oneClickPort));
      // 半成功(「已入库,但下发配置失败」「中断…已成功 3 个」)也要关弹窗:
      // 协议是真建出来了。以前它走 else 分支报红条、列表不刷新、弹窗还开着,
      // 用户十有八九再点一次 —— 那会重复建、撞端口。
      if (toastResult(res, t("m48bf6677e160"), t("mc3f95a1ea6a5"), toast)) {
        setOneClickOpen(false);
      }
      // 真失败也刷:失败常常是建到一半撞的,列表得回到面板真实的样子,
      // 否则用户是在对着幻影操作。
      loadAll();
    } catch (e) {
      toast.error(t("mc3f95a1ea6a5"));
    }
    setOneClickLoading(false);
  };

  const handlePushConfig = async (nodeId: number, nodeName: string) => {
    setPushing(nodeId);
    const res = await pushNodeConfig(nodeId);
    setPushing(null);
    if (res.code === 0) {
      toast.success(t("mbe226187cf13", {v0: nodeName}));
    } else {
      // 这里的失败几乎都是节点掉线/超时,原样把后端的话给出来最有用
      toast.error(res.msg || t("m2e0d6eb81d4f"));
    }
  };

  const handleClearNode = async (nodeId: number, nodeName: string) => {
    if (!window.confirm(t("m472157e8aec0", {v0: nodeName}))) return;
    const res = await deleteInboundsByNode(nodeId, false);
    if (res.code === 0) {
      toast.success(t("mcc19643236a9"));
      loadAll();
    } else {
      toast.error(res.msg || t("m660fb1b057cd"));
    }
  };

  // 协议管理只管【直连】协议(landingId 为空);中转的协议在「中转」页管
  const machineNodes = nodes.filter((n) => inbounds.some((ib) => ib.nodeId === n.id && !ib.landingId));

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">{t("mcf676c020118")}</h1>
        <div className="flex gap-2">
          <Button
            color="secondary"
            onPress={() => {
              setOneClickNodeId(null);
              setOneClickOpen(true);
            }}
          > {t("md8b589161f06")} </Button>
          <Button
            color="primary"
            variant="flat"
            onPress={() => {
              setCreateForm({ nodeId: null, protocol: "vless", sni: DEFAULT_SNI, dest: "", remark: "", listenPort: "443" });
              setCreateOpen(true);
            }}
          > {t("mb34db09dc3ed")} </Button>
        </div>
      </div>

      {/* 一机一卡:每台机器的全套协议折叠成一条记录,卡上直接分配用户 */}
      <div className="grid gap-3 md:grid-cols-2">
        {machineNodes.map((n) => {
          const nodeInbounds = inbounds.filter((ib) => ib.nodeId === n.id && !ib.landingId);
          const online = n.status === 1;
          const firstIp = n.ip ? String(n.ip).split(",")[0].trim() : (n.serverIp || "");
          return (
            <Card key={n.id}>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold truncate">🖥️ {n.name}</span>
                  <Chip size="sm" variant="flat" color={online ? "success" : "default"}>{online ? t("mb9086662b1df") : t("mbe1b4f3c6c1c")}</Chip>
                  <Chip size="sm" variant="flat" color="primary" className="ml-auto">{nodeInbounds.length} {t("mab2f31f30acf")}</Chip>
                </div>
                {firstIp && <div className="text-xs text-default-500 font-mono">{firstIp}</div>}

                {/* 节点在线 ≠ 协议可用:gost 和 sing-box 是两个服务,sing-box 挂了
                    这里照样显示「在线」,但这台机上所有协议全都连不上。必须单独标出来 —— 
                    不然只会以为是协议参数配错了,往那个方向查很久都查不出来 */}
                {online && n.singboxRunning === false && nodeInbounds.length > 0 && (
                  n.singboxInstalling ? (
                    <div className="rounded-lg border border-default-300 bg-default-100 px-3 py-2 space-y-1">
                      <div className="text-sm font-medium text-default-600">{t("m62062bb8196a")}</div>
                      <div className="text-xs text-default-500"> {t("m447898c1ed75")} </div>
                    </div>
                  ) : n.singboxInstallErr ? (
                    <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 space-y-1">
                      <div className="text-sm font-semibold text-danger">{t("mfb435dfb64d6")}</div>
                      <div className="text-xs text-default-500 break-all"> {t("m93b7dd9e6cc8")}<code className="font-mono">{n.singboxInstallErr}</code>
                      </div>
                      <div className="text-xs text-default-500"> {t("md8aaf01b84e1")} </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 space-y-1">
                      <div className="text-sm font-semibold text-danger">{t("m240b190c259d")}</div>
                      {n.singboxInstalled === false ? (
                        <div className="text-xs text-default-500"> {t("mcdcafddd7faf")}<span className="text-danger font-medium">{t("m23268414b682")}</span> {t("m4d15b36d21e8")} </div>
                      ) : (
                        <div className="text-xs text-default-500"> {t("mdd7f900a118b")} <code className="font-mono bg-default-200 px-1 rounded ml-1">systemctl enable --now sing-box</code>
                          <div className="mt-1"> {t("mc068dc4dc155")} <code className="font-mono">Unit file sing-box.service does not exist</code>{t("m96d75487a64c")} </div>
                        </div>
                      )}
                    </div>
                  )
                )}
                <div className="flex flex-wrap gap-1">
                  {nodeInbounds.map((ib) => (
                    <Chip key={ib.id} size="sm" variant="flat" color="secondary">
                      {protoLabel(ib.protocol)}:{ib.listenPort}
                      <button className="ml-2 underline" onClick={() => { setPortEntry(ib); setEditPort(String(ib.listenPort)); }}>{t("port.edit")}</button>
                    </Chip>
                  ))}
                </div>
                <div className="text-xs text-default-400"> {t("mb953125f8d66")} </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    isLoading={pushing === n.id}
                    onPress={() => handlePushConfig(n.id, n.name)}
                  > {t("m0a7f81fc8309")} </Button>
                  <Button size="sm" color="danger" variant="flat" onPress={() => handleClearNode(n.id, n.name)}> {t("m03ab48a205be")} </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
      {machineNodes.length === 0 && (
        <div className="text-center text-default-400 py-8">{t("m32b8eb32a151")}</div>
      )}

      {/* 「我自己用」结果:直接把订阅链接给出来,不用再去用户管理找 */}
      <Modal isOpen={oneClickOpen} onClose={() => setOneClickOpen(false)}>
        <ModalContent>
          <ModalHeader>{t("md8b589161f06")}</ModalHeader>
          <ModalBody className="space-y-3">
            <div className="text-sm text-default-500"> {t("meb640ccc7ae6")}<b>VLESS-Reality、Trojan-Reality、VMess、Hysteria2、TUIC、AnyTLS</b>{t("mfc58e2f7a5e5")} </div>
            <Select
              label={t("mece969c3f881")}
              placeholder={t("m3cbc3ae760a5")}
              selectedKeys={oneClickNodeId ? [String(oneClickNodeId)] : []}
              onSelectionChange={(k) => setOneClickNodeId(Number(Array.from(k)[0]))}
            >
              {nodes.map((n) => (
                <SelectItem key={n.id}>{n.name}</SelectItem>
              ))}
            </Select>
            <Input label={t("port.label")} type="number" min={1} max={65535} value={oneClickPort} onValueChange={setOneClickPort} />
            {/* Reality 借壳域名:给个常用列表,也允许自己输 */}
            <Autocomplete
              label={t("me2ff9a4822f7")}
              allowsCustomValue
              defaultItems={SNI_PRESETS}
              inputValue={oneClickSni}
              onInputChange={(v) => setOneClickSni(v)}
              onSelectionChange={(k) => { if (k) setOneClickSni(String(k)); }}
              description={t("me059c33ab0fe")}
            >
              {(item: any) => <AutocompleteItem key={item.value} description={item.desc || undefined}>{item.label}</AutocompleteItem>}
            </Autocomplete>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setOneClickOpen(false)}>{t("m2cd0f3be8738")}</Button>
            <Button color="secondary" isLoading={oneClickLoading} onPress={handleOneClick}>{t("m0ad2669c5682")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 单独加一个协议(补充用) */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <ModalContent>
          <ModalHeader>{t("mb34db09dc3ed")}</ModalHeader>
          <ModalBody className="space-y-3">
            <Select
              label={t("mab2f31f30acf")}
              selectedKeys={[createForm.protocol]}
              onSelectionChange={(k) => { const protocol = typeof k === "string" ? k : String(Array.from(k)[0]); setCreateForm({ ...createForm, protocol, listenPort: defaultProtocolPort(protocol) }); }}
              description={
                isReality(createForm.protocol)
                  ? t("m820981096d63")
                  : createForm.protocol === "vmess"
                  ? t("m984a57cb6606")
                  : createForm.protocol === "vmess-ws"
                  ? t("m3fc2f781a221")
                  : ["hysteria2", "tuic", "anytls"].includes(createForm.protocol)
                  ? t("me41ab6a3ca85")
                  : t("m7542b68fc92a")
              }
            >
              <SelectItem key="vless">{t("m274c3351a4e0")}</SelectItem>
              <SelectItem key="trojan">{t("m6a5f11d85689")}</SelectItem>
              <SelectItem key="vmess">{t("m289c5d64486e")}</SelectItem>
              <SelectItem key="vmess-ws">{t("mf76024692662")}</SelectItem>
              <SelectItem key="shadowsocks">Shadowsocks-2022</SelectItem>
              <SelectItem key="hysteria2">{t("m0a1a83b28453")}</SelectItem>
              <SelectItem key="tuic">{t("md75b5ac2c01c")}</SelectItem>
              <SelectItem key="anytls">{t("mf3eb25daeb0d")}</SelectItem>
            </Select>
            <Select
              label={t("mece969c3f881")}
              placeholder={t("m5067180a2685")}
              selectedKeys={createForm.nodeId ? [String(createForm.nodeId)] : []}
              onSelectionChange={(k) => setCreateForm({ ...createForm, nodeId: Number(typeof k === "string" ? k : Array.from(k)[0]) })}
            >
              {nodes.map((n) => (
                <SelectItem key={n.id}>{n.name}</SelectItem>
              ))}
            </Select>
            {createForm.protocol === "vmess-ws" && (
              <>
                <Input
                  label={t("mc55d9ee9da9a")}
                  placeholder={t("m7b7b0e461144")}
                  value={createForm.wsPath || ""}
                  onChange={(e) => setCreateForm({ ...createForm, wsPath: e.target.value })}
                  description={t("mf5158b45aedd")}
                />
                <Input
                  label={t("ma46a138317df")}
                  placeholder={t("m466f69f098f6")}
                  value={createForm.wsHost || ""}
                  onChange={(e) => setCreateForm({ ...createForm, wsHost: e.target.value })}
                  description={t("m74b2eef9195f")}
                />
              </>
            )}
            <Input label={t("port.label")} type="number" min={1} max={65535}
              value={createForm.listenPort} onChange={(event) => setCreateForm({ ...createForm, listenPort: event.target.value })}
              placeholder={t("port.auto")} description={t("port.description")} />
            {isReality(createForm.protocol) && (
              <>
                <Autocomplete
                  label={t("me2ff9a4822f7")}
                  allowsCustomValue
                  defaultItems={SNI_PRESETS}
                  inputValue={createForm.sni}
                  onInputChange={(v) => setCreateForm({ ...createForm, sni: v })}
                  onSelectionChange={(k) => { if (k) setCreateForm({ ...createForm, sni: String(k) }); }}
                  description={t("ma1be46a4561d")}
                >
                  {(item: any) => <AutocompleteItem key={item.value} description={item.desc || undefined}>{item.label}</AutocompleteItem>}
                </Autocomplete>
                <Input
                  label={t("m320ec2496104")}
                  value={createForm.dest}
                  onChange={(e) => setCreateForm({ ...createForm, dest: e.target.value })}
                />
              </>
            )}
            <Input
              label={t("mdaede9881787")}
              value={createForm.remark}
              onChange={(e) => setCreateForm({ ...createForm, remark: e.target.value })}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setCreateOpen(false)}>{t("m2cd0f3be8738")}</Button>
            <Button color="primary" isLoading={createLoading} onPress={handleCreate}>{t("mcde2cd071d25")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    <Modal isOpen={!!portEntry} onClose={() => setPortEntry(null)}>
        <ModalContent><ModalHeader>{t("port.title")}</ModalHeader><ModalBody>
          <Input label={t("port.label")} type="number" min={1} max={65535} value={editPort} onValueChange={setEditPort} />
          <p className="text-sm text-default-500">{t("port.legacy")}</p>
        </ModalBody><ModalFooter><Button onPress={() => setPortEntry(null)}>{t("button.cancel")}</Button><Button color="primary" isLoading={portSaving} onPress={savePort}>{t("button.save")}</Button></ModalFooter></ModalContent>
      </Modal>
      </div>
  );
}
