import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Alert } from "@heroui/alert";
import toast from '@/utils/toast';


import { 
  createTunnel, 
  getTunnelList, 
  updateTunnel, 
  deleteTunnel,
  getNodeList,
  diagnoseTunnel
} from "@/api";

interface Tunnel {
  id: number;
  name: string;
  type: number; // 1: 端口转发, 2: 隧道转发
  inNodeId: number;
  outNodeId?: number;
  inIp: string;
  outIp?: string;
  protocol?: string;
  tcpListenAddr: string;
  udpListenAddr: string;
  interfaceName?: string;
  flow: number; // 1: 单向, 2: 双向
  trafficRatio: number;
  status: number;
  createdTime: string;
  /** 搭协议时自动建的隧道(每台机一条,用来挂协议的 gost 转发),默认不显示 */
  protocolManaged?: boolean;
}

interface Node {
  id: number;
  name: string;
  status: number; // 1: 在线, 0: 离线
}

interface TunnelForm {
  id?: number;
  name: string;
  type: number;
  inNodeId: number | null;
  outNodeId?: number | null;
  protocol: string;
  tcpListenAddr: string;
  udpListenAddr: string;
  interfaceName?: string;
  flow: number;
  trafficRatio: number;
  status: number;
}

interface DiagnosisResult {
  tunnelName: string;
  tunnelType: string;
  timestamp: number;
  results: Array<{
    success: boolean;
    description: string;
    nodeName: string;
    nodeId: string;
    targetIp: string;
    targetPort?: number;
    message?: string;
    averageTime?: number;
    packetLoss?: number;
  }>;
}

export default function TunnelPage() {
  useTranslation();
  const [loading, setLoading] = useState(true);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  // 搭协议自动建的隧道默认收起来:用户没手工建过,看到它们只会困惑
  const [showProtocolTunnels, setShowProtocolTunnels] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  
  // 模态框状态
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [diagnosisModalOpen, setDiagnosisModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [tunnelToDelete, setTunnelToDelete] = useState<Tunnel | null>(null);
  const [currentDiagnosisTunnel, setCurrentDiagnosisTunnel] = useState<Tunnel | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  
  // 表单状态
  const [form, setForm] = useState<TunnelForm>({
    name: '',
    type: 1,
    inNodeId: null,
    outNodeId: null,
    protocol: 'tls',
    tcpListenAddr: '[::]',
    udpListenAddr: '[::]',
    interfaceName: '',
    flow: 1,
    trafficRatio: 1.0,
    status: 1
  });
  
  // 表单验证错误
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    loadData();
  }, []);

  // 加载所有数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [tunnelsRes, nodesRes] = await Promise.all([
        getTunnelList(),
        getNodeList()
      ]);
      
      if (tunnelsRes.code === 0) {
        setTunnels(tunnelsRes.data || []);
      } else {
        toast.error(tunnelsRes.msg || t("mdc67e7f78f0f"));
      }
      
      if (nodesRes.code === 0) {
        setNodes(nodesRes.data || []);
      } else {
        console.warn(t("m40b9a07192c8"), nodesRes.msg);
      }
    } catch (error) {
      console.error(t("m5a3f28106237"), error);
      toast.error(t("md1abfa54a4ac"));
    } finally {
      setLoading(false);
    }
  };

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (!form.name.trim()) {
      newErrors.name = t("mef9be032cd0a");
    } else if (form.name.length < 2 || form.name.length > 50) {
      newErrors.name = t("m1734269e6af2");
    }
    
    if (!form.inNodeId) {
      newErrors.inNodeId = t("m65503f8f148c");
    }
    
    if (!form.tcpListenAddr.trim()) {
      newErrors.tcpListenAddr = t("md49551d52d71");
    }
    
    if (!form.udpListenAddr.trim()) {
      newErrors.udpListenAddr = t("m124d9115dfd3");
    }
    
    if (form.trafficRatio < 0.0 || form.trafficRatio > 100.0) {
      newErrors.trafficRatio = t("m522752906eda");
    }
    
    // 隧道转发时的验证
    if (form.type === 2) {
      if (!form.outNodeId) {
        newErrors.outNodeId = t("mebdaa22e17f0");
      } else if (form.inNodeId === form.outNodeId) {
        newErrors.outNodeId = t("mf91342a3ddd1");
      }
      
      if (!form.protocol) {
        newErrors.protocol = t("md8fb4cf989a8");
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 新增隧道
  const handleAdd = () => {
    setIsEdit(false);
    setForm({
      name: '',
      type: 1,
      inNodeId: null,
      outNodeId: null,
      protocol: 'tls',
      tcpListenAddr: '[::]',
      udpListenAddr: '[::]',
      interfaceName: '',
      flow: 1,
      trafficRatio: 1.0,
      status: 1
    });
    setErrors({});
    setModalOpen(true);
  };

  // 编辑隧道 - 只能修改部分字段
  const handleEdit = (tunnel: Tunnel) => {
    setIsEdit(true);
    setForm({
      id: tunnel.id,
      name: tunnel.name,
      type: tunnel.type,
      inNodeId: tunnel.inNodeId,
      outNodeId: tunnel.outNodeId || null,
      protocol: tunnel.protocol || 'tls',
      tcpListenAddr: tunnel.tcpListenAddr || '[::]',
      udpListenAddr: tunnel.udpListenAddr || '[::]',
      interfaceName: tunnel.interfaceName || '',
      flow: tunnel.flow,
      trafficRatio: tunnel.trafficRatio,
      status: tunnel.status
    });
    setErrors({});
    setModalOpen(true);
  };

  // 删除隧道
  const handleDelete = (tunnel: Tunnel) => {
    setTunnelToDelete(tunnel);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!tunnelToDelete) return;
    
    setDeleteLoading(true);
    try {
      const response = await deleteTunnel(tunnelToDelete.id);
      if (response.code === 0) {
        toast.success(t("m5223f91b9670"));
        setDeleteModalOpen(false);
        setTunnelToDelete(null);
        loadData();
      } else {
        toast.error(response.msg || t("mc228558cf257"));
      }
    } catch (error) {
      console.error(t("m8b176752f6e2"), error);
      toast.error(t("mc228558cf257"));
    } finally {
      setDeleteLoading(false);
    }
  };

  // 隧道类型改变时的处理
  const handleTypeChange = (type: number) => {
    setForm(prev => ({
      ...prev,
      type,
      outNodeId: type === 1 ? null : prev.outNodeId,
      protocol: type === 1 ? 'tls' : prev.protocol
    }));
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitLoading(true);
    try {
      const data = { ...form };
      
      const response = isEdit 
        ? await updateTunnel(data)
        : await createTunnel(data);
        
      if (response.code === 0) {
        toast.success(isEdit ? t("m7c0d2664869c") : t("m1ab62884f4ee"));
        setModalOpen(false);
        loadData();
      } else {
        toast.error(response.msg || (isEdit ? t("mec99e5c45d64") : t("m7e6a71efbf63")));
      }
    } catch (error) {
      console.error(t("ma2928635ad12"), error);
      toast.error(t("mfa8326d4a0e5"));
    } finally {
      setSubmitLoading(false);
    }
  };

  // 诊断隧道
  const handleDiagnose = async (tunnel: Tunnel) => {
    setCurrentDiagnosisTunnel(tunnel);
    setDiagnosisModalOpen(true);
    setDiagnosisLoading(true);
    setDiagnosisResult(null);

    try {
      const response = await diagnoseTunnel(tunnel.id);
      if (response.code === 0) {
        setDiagnosisResult(response.data);
      } else {
        toast.error(response.msg || t("mfa8bee370bbe"));
        setDiagnosisResult({
          tunnelName: tunnel.name,
          tunnelType: tunnel.type === 1 ? t("mdae851b6621c") : t("mf13895bd3f8a"),
          timestamp: Date.now(),
          results: [{
            success: false,
            description: t("mfa8bee370bbe"),
            nodeName: '-',
            nodeId: '-',
            targetIp: '-',
            targetPort: 443,
            message: response.msg || t("ma40cb8b632dc")
          }]
        });
      }
    } catch (error) {
      console.error(t("ma52da2b03f00"), error);
      toast.error(t("mfa8326d4a0e5"));
      setDiagnosisResult({
        tunnelName: tunnel.name,
        tunnelType: tunnel.type === 1 ? t("mdae851b6621c") : t("mf13895bd3f8a"),
        timestamp: Date.now(),
        results: [{
          success: false,
          description: t("m88c035ff99b6"),
          nodeName: '-',
          nodeId: '-',
          targetIp: '-',
          targetPort: 443,
          message: t("me8564e85fdf9")
        }]
      });
    } finally {
      setDiagnosisLoading(false);
    }
  };

  // 获取显示的IP（处理多IP）
  const getDisplayIp = (ipString?: string): string => {
    if (!ipString) return '-';
    
    const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
    
    if (ips.length === 0) return '-';
    if (ips.length === 1) return ips[0];
    
    return t("md493e3b88a2b", {v0: ips[0], v1: ips.length});
  };

  // 获取转发机名称
  const getNodeName = (nodeId?: number): string => {
    if (!nodeId) return '-';
    const node = nodes.find(n => n.id === nodeId);
    return node ? node.name : t("m295839c12370", {v0: nodeId});
  };

  // 获取状态显示
  const getStatusDisplay = (status: number) => {
    switch (status) {
      case 1:
        return { text: t("mf4f0ead1116b"), color: 'success' };
      case 0:
        return { text: t("m7df5c456c765"), color: 'default' };
      default:
        return { text: t("m4d8c1c5b4283"), color: 'warning' };
    }
  };

  // 获取类型显示
  const getTypeDisplay = (type: number) => {
    switch (type) {
      case 1:
        return { text: t("mdae851b6621c"), color: 'primary' };
      case 2:
        return { text: t("mf13895bd3f8a"), color: 'secondary' };
      default:
        return { text: t("m4d8c1c5b4283"), color: 'default' };
    }
  };

  // 获取流量计算显示
  const getFlowDisplay = (flow: number) => {
    switch (flow) {
      case 1:
        return t("m663a6026f63b");
      case 2:
        return t("m250c656d6264");
      default:
        return t("m4d8c1c5b4283");
    }
  };


  // 获取连接质量
  const getQualityDisplay = (averageTime?: number, packetLoss?: number) => {
    if (averageTime === undefined || packetLoss === undefined) return null;
    
    if (averageTime < 30 && packetLoss === 0) return { text: t("mb2ffb519afdf"), color: 'success' };
    if (averageTime < 50 && packetLoss === 0) return { text: t("m155dabc34ea5"), color: 'success' };
    if (averageTime < 100 && packetLoss < 1) return { text: t("mb196a619de2b"), color: 'primary' };
    if (averageTime < 150 && packetLoss < 2) return { text: t("m7c63cc105958"), color: 'warning' };
    if (averageTime < 200 && packetLoss < 5) return { text: t("m5cd767bee0b2"), color: 'warning' };
    return { text: t("mc1799eaa3c01"), color: 'danger' };
  };

  if (loading) {
    return (
      
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <span className="text-default-600">{t("m7545b3950397")}</span>
          </div>
        </div>

    );
  }

  const protocolTunnelCount = tunnels.filter(t => t.protocolManaged).length;
  const visibleTunnels = showProtocolTunnels ? tunnels : tunnels.filter(t => !t.protocolManaged);

  return (

      <div className="px-3 lg:px-6 py-8">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-6">
        <div className="flex-1 min-w-0">
          {protocolTunnelCount > 0 && (
            <div className="text-xs text-default-500 flex items-center gap-2 flex-wrap">
              <span>
                {showProtocolTunnels
                  ? t("mba668c2453d0", {v0: protocolTunnelCount})
                  : t("ma672889bf90f", {v0: protocolTunnelCount})} {t("m47fbfc6e64a4")} </span>
              <Button
                size="sm"
                variant="light"
                className="h-6 min-w-0 px-2 text-xs"
                onPress={() => setShowProtocolTunnels(!showProtocolTunnels)}
              >
                {showProtocolTunnels ? t("mafd4b783536b") : t("m75381940476f")}
              </Button>
            </div>
          )}
        </div>

        <Button
              size="sm"
              variant="flat"
              color="primary"
              onPress={handleAdd}

            > {t("m0006d696d8e1")} </Button>

        </div>

        {/* 隧道卡片网格 */}
        {visibleTunnels.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {visibleTunnels.map((tunnel) => {
              const statusDisplay = getStatusDisplay(tunnel.status);
              const typeDisplay = getTypeDisplay(tunnel.type);
              
              return (
                <Card key={tunnel.id} className="shadow-sm border border-divider hover:shadow-md transition-shadow duration-200">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start w-full">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate text-sm">{tunnel.name}</h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Chip 
                            color={typeDisplay.color as any} 
                            variant="flat" 
                            size="sm"
                            className="text-xs"
                          >
                            {typeDisplay.text}
                          </Chip>
                          <Chip 
                            color={statusDisplay.color as any} 
                            variant="flat" 
                            size="sm"
                            className="text-xs"
                          >
                            {statusDisplay.text}
                          </Chip>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardBody className="pt-0 pb-3">
                    <div className="space-y-2">
                      {/* 流程展示 */}
                      <div className="space-y-1.5">
                        <div className="p-2 bg-default-50 dark:bg-default-100/50 rounded border border-default-200 dark:border-default-300">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-default-600">{t("m145479d5b0a3")}</span>
                          </div>
                          <code className="text-xs font-mono text-foreground block truncate">
                            {getNodeName(tunnel.inNodeId)}
                          </code>
                          <code className="text-xs font-mono text-default-500 block truncate">
                            {getDisplayIp(tunnel.inIp)}
                          </code>
                        </div>
                        
                        <div className="text-center py-0.5">
                          <svg className="w-3 h-3 text-default-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        </div>
                        
                        <div className="p-2 bg-default-50 dark:bg-default-100/50 rounded border border-default-200 dark:border-default-300">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-default-600">
                              {tunnel.type === 1 ? t("m81d428394da0") : t("m93f3f95828e9")}
                            </span>
                          </div>
                          <code className="text-xs font-mono text-foreground block truncate">
                            {tunnel.type === 1 ? getNodeName(tunnel.inNodeId) : getNodeName(tunnel.outNodeId)}
                          </code>
                          <code className="text-xs font-mono text-default-500 block truncate">
                            {tunnel.type === 1 ? getDisplayIp(tunnel.inIp) : getDisplayIp(tunnel.outIp)}
                          </code>
                        </div>
                      </div>

                      {/* 配置信息 */}
                      <div className="flex justify-between items-center pt-2 border-t border-divider">
                        <div className="text-left">
                          <div className="text-xs font-medium text-foreground">
                            {getFlowDisplay(tunnel.flow)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-medium text-foreground">
                            {tunnel.trafficRatio}x
                          </div>
                        </div>
                      </div>

                    </div>
                    
                    <div className="flex gap-1.5 mt-3">
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        onPress={() => handleEdit(tunnel)}
                        className="flex-1 min-h-8"
                        startContent={
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        }
                      > {t("m051836569928")} </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="warning"
                        onPress={() => handleDiagnose(tunnel)}
                        className="flex-1 min-h-8"
                        startContent={
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        }
                      > {t("m40ff6300f981")} </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        onPress={() => handleDelete(tunnel)}
                        className="flex-1 min-h-8"
                        startContent={
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM12 7a1 1 0 012 0v4a1 1 0 11-2 0V7z" clipRule="evenodd" />
                          </svg>
                        }
                      > {t("m2f9daa828907")} </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : (
          /* 空状态 */
          <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
            <CardBody className="text-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{t("mcbacd090ca30")}</h3>
                  <p className="text-default-500 text-sm mt-1">{t("m522c81d2605e")}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* 新增/编辑模态框 */}
        <Modal 
          isOpen={modalOpen}
          onOpenChange={setModalOpen}
          size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <h2 className="text-xl font-bold">
                    {isEdit ? t("m74e264d0fd40") : t("m40d98c6a2cb7")}
                  </h2>
                  <p className="text-small text-default-500">
                    {isEdit ? t("m3908e06aa9f5") : t("m5c4a3716956d")}
                  </p>
                </ModalHeader>
                <ModalBody>
                  <div className="space-y-4">
                    <Input
                      label={t("mb679939ed787")}
                      placeholder={t("mef9be032cd0a")}
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      isInvalid={!!errors.name}
                      errorMessage={errors.name}
                      variant="bordered"
                    />
                    
                    <Select
                      label={t("mbbc8e77768b6")}
                      placeholder={t("m3f8d78f90d7e")}
                      selectedKeys={[form.type.toString()]}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        if (selectedKey) {
                          handleTypeChange(parseInt(selectedKey));
                        }
                      }}
                      isInvalid={!!errors.type}
                      errorMessage={errors.type}
                      variant="bordered"
                      isDisabled={isEdit}
                    >
                      <SelectItem key="1">{t("mdae851b6621c")}</SelectItem>
                      <SelectItem key="2">{t("mf13895bd3f8a")}</SelectItem>
                    </Select>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Select
                        label={t("md1a186f0f01d")}
                        placeholder={t("m63dd98668bfa")}
                        selectedKeys={[form.flow.toString()]}
                        onSelectionChange={(keys) => {
                          const selectedKey = Array.from(keys)[0] as string;
                          if (selectedKey) {
                            setForm(prev => ({ ...prev, flow: parseInt(selectedKey) }));
                          }
                        }}
                        isInvalid={!!errors.flow}
                        errorMessage={errors.flow}
                        variant="bordered"
                        description={t("m2b479495d0c0")}
                      >
                        {/* 后端是 flow * flowType(1 或 2),不是"只算上传/只算下载",别再写成那样 */}
                        <SelectItem key="1" textValue={t("m663a6026f63b")}>{t("m6589ea58920b")}</SelectItem>
                        <SelectItem key="2" textValue={t("m250c656d6264")}>{t("m6d173e13cded")}</SelectItem>
                      </Select>

                      <Input
                        label={t("mef6bcac63110")}
                        placeholder={t("m614f1e18d16a")}
                        type="number"
                        value={form.trafficRatio.toString()}
                        onChange={(e) => setForm(prev => ({ 
                          ...prev, 
                          trafficRatio: parseFloat(e.target.value) || 0
                        }))}
                        isInvalid={!!errors.trafficRatio}
                        errorMessage={errors.trafficRatio}
                        variant="bordered"
                        description={t("mae19ddacc453")}
                        endContent={
                          <div className="pointer-events-none flex items-center">
                            <span className="text-default-400 text-small">x</span>
                          </div>
                        }
                      />
                    </div>

                    <Divider />
                    <h3 className="text-lg font-semibold">{t("m2810bb351c26")}</h3>

                    <Select
                      label={t("m145479d5b0a3")}
                      placeholder={t("m65503f8f148c")}
                      selectedKeys={form.inNodeId ? [form.inNodeId.toString()] : []}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        if (selectedKey) {
                          setForm(prev => ({ ...prev, inNodeId: parseInt(selectedKey) }));
                        }
                      }}
                      isInvalid={!!errors.inNodeId}
                      errorMessage={errors.inNodeId}
                      variant="bordered"
                      isDisabled={isEdit}
                    >
                      {nodes.map((node) => (
                        <SelectItem 
                          key={node.id}
                          textValue={`${node.name} (${node.status === 1 ? t("mb9086662b1df") : t("mbe1b4f3c6c1c")})`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{node.name}</span>
                            <Chip 
                              color={node.status === 1 ? 'success' : 'danger'} 
                              variant="flat" 
                              size="sm"
                            >
                              {node.status === 1 ? t("mb9086662b1df") : t("mbe1b4f3c6c1c")}
                            </Chip>
                          </div>
                        </SelectItem>
                      ))}
                    </Select>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label={t("m30bc78c01a15")}
                        placeholder={t("md49551d52d71")}
                        value={form.tcpListenAddr}
                        onChange={(e) => setForm(prev => ({ ...prev, tcpListenAddr: e.target.value }))}
                        isInvalid={!!errors.tcpListenAddr}
                        errorMessage={errors.tcpListenAddr}
                        variant="bordered"
                        startContent={
                          <div className="pointer-events-none flex items-center">
                            <span className="text-default-400 text-small">TCP</span>
                          </div>
                        }
                      />

                      <Input
                        label={t("mba1d1c945889")}
                        placeholder={t("m124d9115dfd3")}
                        value={form.udpListenAddr}
                        onChange={(e) => setForm(prev => ({ ...prev, udpListenAddr: e.target.value }))}
                        isInvalid={!!errors.udpListenAddr}
                        errorMessage={errors.udpListenAddr}
                        variant="bordered"
                        startContent={
                          <div className="pointer-events-none flex items-center">
                            <span className="text-default-400 text-small">UDP</span>
                          </div>
                        }
                      />
                    </div>

                    {/* 隧道转发时显示出口网卡配置 */}
                    {form.type === 2 && (
                      <Input
                        label={t("md4af1117db04")}
                        placeholder={t("mdca162b8a535")}
                        value={form.interfaceName}
                        onChange={(e) => setForm(prev => ({ ...prev, interfaceName: e.target.value }))}
                        isInvalid={!!errors.interfaceName}
                        errorMessage={errors.interfaceName}
                        variant="bordered"
                      />
                    )}

                    {/* 隧道转发时显示出口配置 */}
                    {form.type === 2 && (
                      <>
                        <Divider />
                        <h3 className="text-lg font-semibold">{t("mf07b688e9d7f")}</h3>

                        <Select
                          label={t("madda8cd0c302")}
                          placeholder={t("md8fb4cf989a8")}
                          selectedKeys={[form.protocol]}
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string;
                            if (selectedKey) {
                              setForm(prev => ({ ...prev, protocol: selectedKey }));
                            }
                          }}
                          isInvalid={!!errors.protocol}
                          errorMessage={errors.protocol}
                          variant="bordered"
                        >
                          <SelectItem key="tls">TLS</SelectItem>
                          <SelectItem key="wss">WSS</SelectItem>
                          <SelectItem key="tcp">TCP</SelectItem>
                          <SelectItem key="mtls">MTLS</SelectItem>
                          <SelectItem key="mwss">MWSS</SelectItem>
                          <SelectItem key="mtcp">MTCP</SelectItem>
                        </Select>

                        <Select
                          label={t("m93f3f95828e9")}
                          placeholder={t("mebdaa22e17f0")}
                          selectedKeys={form.outNodeId ? [form.outNodeId.toString()] : []}
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string;
                            if (selectedKey) {
                              setForm(prev => ({ ...prev, outNodeId: parseInt(selectedKey) }));
                            }
                          }}
                          isInvalid={!!errors.outNodeId}
                          errorMessage={errors.outNodeId}
                          variant="bordered"
                          isDisabled={isEdit}
                        >
                          {nodes.map((node) => (
                            <SelectItem 
                              key={node.id}
                              textValue={`${node.name} (${node.status === 1 ? t("mb9086662b1df") : t("mbe1b4f3c6c1c")})`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{node.name}</span>
                                <div className="flex items-center gap-2">
                                  <Chip 
                                    color={node.status === 1 ? 'success' : 'danger'} 
                                    variant="flat" 
                                    size="sm"
                                  >
                                    {node.status === 1 ? t("mb9086662b1df") : t("mbe1b4f3c6c1c")}
                                  </Chip>
                                  {form.inNodeId === node.id && (
                                    <Chip color="warning" variant="flat" size="sm"> {t("m8faf9f6730a8")} </Chip>
                                  )}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </Select>
                      </>
                    )}

                    <Alert
                        color="primary"
                        variant="flat"
                        title={t("m055a8f4b87d2")}
                        description={t("m0309fb8225d6")}
                        className="mt-4"
                      />
                      <Alert
                        color="primary"
                        variant="flat"
                        title={t("md4af1117db04")}
                        description={t("meccbb14d0d2f")}
                        className="mt-4"
                      />
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}> {t("m2cd0f3be8738")} </Button>
                  <Button 
                    color="primary" 
                    onPress={handleSubmit}
                    isLoading={submitLoading}
                  >
                    {submitLoading ? (isEdit ? t("ma2ef83d5a3e4") : t("m687d8f3ba99e")) : (isEdit ? t("m3055a035f0eb") : t("mcde2cd071d25"))}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 删除确认模态框 */}
        <Modal 
          isOpen={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <h2 className="text-xl font-bold">{t("ma3ea3c17b401")}</h2>
                </ModalHeader>
                <ModalBody>
                  <p>{t("m4ac86a967b95")} <strong>"{tunnelToDelete?.name}"</strong> {t("m9d45d8943988")}</p>
                  <p className="text-small text-default-500">{t("m85338c54047d")}</p>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}> {t("m2cd0f3be8738")} </Button>
                  <Button 
                    color="danger" 
                    onPress={confirmDelete}
                    isLoading={deleteLoading}
                  >
                    {deleteLoading ? t("m4669785ade95") : t("ma3ea3c17b401")}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 诊断结果模态框 */}
        <Modal 
          isOpen={diagnosisModalOpen}
          onOpenChange={setDiagnosisModalOpen}
          size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <h2 className="text-xl font-bold">{t("m5ed0a2c15fa9")}</h2>
                  {currentDiagnosisTunnel && (
                    <div className="flex items-center gap-2">
                      <span className="text-small text-default-500">{currentDiagnosisTunnel.name}</span>
                      <Chip 
                        color={currentDiagnosisTunnel.type === 1 ? 'primary' : 'secondary'} 
                        variant="flat" 
                        size="sm"
                      >
                        {currentDiagnosisTunnel.type === 1 ? t("mdae851b6621c") : t("mf13895bd3f8a")}
                      </Chip>
                    </div>
                  )}
                </ModalHeader>
                <ModalBody>
                  {diagnosisLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="flex items-center gap-3">
                        <Spinner size="sm" />
                        <span className="text-default-600">{t("mab6cbb6f75b8")}</span>
                      </div>
                    </div>
                  ) : diagnosisResult ? (
                    <div className="space-y-4">
                      {diagnosisResult.results.map((result, index) => {
                        const quality = getQualityDisplay(result.averageTime, result.packetLoss);
                        
                        return (
                          <Card key={index} className={`shadow-sm border ${result.success ? 'border-success' : 'border-danger'}`}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    result.success ? 'bg-success text-white' : 'bg-danger text-white'
                                  }`}>
                                    {result.success ? '✓' : '✗'}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold">{result.description}</h4>
                                    <p className="text-small text-default-500">{result.nodeName}</p>
                                  </div>
                                </div>
                                <Chip 
                                  color={result.success ? 'success' : 'danger'} 
                                  variant="flat"
                                >
                                  {result.success ? t("m053461ce86d2") : t("m28384d7afd2e")}
                                </Chip>
                              </div>
                            </CardHeader>
                            <CardBody className="pt-0">
                              {result.success ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-primary">{result.averageTime?.toFixed(0)}</div>
                                      <div className="text-small text-default-500">{t("m4fcff8e0955a")}</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-warning">{result.packetLoss?.toFixed(1)}</div>
                                      <div className="text-small text-default-500">{t("m0583a4dc458b")}</div>
                                    </div>
                                    <div className="text-center">
                                      {quality && (
                                        <>
                                          <Chip color={quality.color as any} variant="flat" size="lg">
                                            {quality.text}
                                          </Chip>
                                          <div className="text-small text-default-500 mt-1">{t("ma69bbeb739a8")}</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-small text-default-500"> {t("m35c40d2223f1")} <code className="font-mono">{result.targetIp}{result.targetPort ? ':' + result.targetPort : ''}</code>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-small text-default-500"> {t("m35c40d2223f1")} <code className="font-mono">{result.targetIp}{result.targetPort ? ':' + result.targetPort : ''}</code>
                                  </div>
                                  <Alert
                                    color="danger"
                                    variant="flat"
                                    title={t("m4e4e753b5040")}
                                    description={result.message}
                                  />
                                </div>
                              )}
                            </CardBody>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">{t("mf63d8bb16d70")}</h3>
                    </div>
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}> {t("m3fd47edce45b")} </Button>
                  {currentDiagnosisTunnel && (
                    <Button 
                      color="primary" 
                      onPress={() => handleDiagnose(currentDiagnosisTunnel)}
                      isLoading={diagnosisLoading}
                    > {t("m471cada84e37")} </Button>
                  )}
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </div>
    
  );
}
