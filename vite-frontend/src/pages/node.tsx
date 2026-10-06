import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect, useRef } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Switch } from "@heroui/switch";
import { Spinner } from "@heroui/spinner";
import { Alert } from "@heroui/alert";
import { Progress } from "@heroui/progress";
import toast from '@/utils/toast';
import { copyTextToClipboard } from "@/utils/clipboard";
import axios from 'axios';


import {
  createNode,
  getNodeList,
  updateNode,
  deleteNode,
  getNodeInstallCommand,
  updateConfig
} from "@/api";

interface Node {
  id: number;
  name: string;
  ip: string;
  serverIp: string;
  domain?: string;
  /** 该机 sing-box 是否在运行(节点上报);null/undefined = 还没上报过 */
  singboxRunning?: boolean;
  /** 该机装没装 sing-box。undefined = 老节点没上报这个字段,提示里两种情况都要提 */
  singboxInstalled?: boolean;
  /** 正在下载安装 sing-box(刚建完协议那一两分钟)。这时候不该报红 */
  singboxInstalling?: boolean;
  /** 上次安装失败的原因,有值就直接摆出来,省得上机器翻 journalctl */
  singboxInstallErr?: string;
  portSta: number;
  portEnd: number;
  version?: string;
  http?: number; // 0 关 1 开
  tls?: number;  // 0 关 1 开
  socks?: number; // 0 关 1 开
  status: number; // 1: 在线, 0: 离线
  connectionStatus: 'online' | 'offline';
  systemInfo?: {
    cpuUsage: number;
    memoryUsage: number;
    uploadTraffic: number;
    downloadTraffic: number;
    uploadSpeed: number;
    downloadSpeed: number;
    uptime: number;
  } | null;
  copyLoading?: boolean;
}

interface NodeForm {
  id: number | null;
  name: string;
  ipString: string;
  serverIp: string;
  domain: string;
  portSta: number;
  portEnd: number;
  http: number; // 0 关 1 开
  tls: number;  // 0 关 1 开
  socks: number; // 0 关 1 开
}

export default function NodePage() {
  useTranslation();
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [protocolDisabled, setProtocolDisabled] = useState(false);
  const [protocolDisabledReason, setProtocolDisabledReason] = useState('');
  const [form, setForm] = useState<NodeForm>({
    id: null,
    name: '',
    ipString: '',
    serverIp: '',
    domain: '',
    portSta: 1000,
    portEnd: 65535,
    http: 0,
    tls: 0,
    socks: 0
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // 安装命令相关状态
  const [installCommandModal, setInstallCommandModal] = useState(false);
  const [installCommand, setInstallCommand] = useState('');
  const [currentNodeName, setCurrentNodeName] = useState('');
  
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    loadNodes();
    initWebSocket();
    
    return () => {
      closeWebSocket();
    };
  }, []);

  // 加载转发机列表
  const loadNodes = async () => {
    setLoading(true);
    try {
      const res = await getNodeList();
      if (res.code === 0) {
        setNodeList(res.data.map((node: any) => ({
          ...node,
          connectionStatus: node.status === 1 ? 'online' : 'offline',
          systemInfo: null,
          copyLoading: false
        })));
      } else {
        toast.error(res.msg || t("ma5d155c725bb"));
      }
    } catch (error) {
      toast.error(t("mfa8326d4a0e5"));
    } finally {
      setLoading(false);
    }
  };

  // 初始化WebSocket连接
  const initWebSocket = () => {
    if (websocketRef.current && 
        (websocketRef.current.readyState === WebSocket.OPEN || 
         websocketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    
    if (websocketRef.current) {
      closeWebSocket();
    }
    
    // 构建WebSocket URL，使用axios的baseURL
    const baseUrl = axios.defaults.baseURL || (import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : '/api/v1/');
    const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/$/, '') + `/system-info?type=0&secret=${localStorage.getItem('token')}`;
    
    try {
      websocketRef.current = new WebSocket(wsUrl);
      
      websocketRef.current.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };
      
      websocketRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          // 解析失败时不输出错误信息
        }
      };
      
      websocketRef.current.onerror = () => {
        // WebSocket错误时不输出错误信息
      };
      
      websocketRef.current.onclose = () => {
        websocketRef.current = null;
        attemptReconnect();
      };
    } catch (error) {
      attemptReconnect();
    }
  };

  // 处理WebSocket消息
  const handleWebSocketMessage = (data: any) => {
    const { id, type, data: messageData } = data;
    
    if (type === 'status') {
      setNodeList(prev => prev.map(node => {
        if (node.id == id) {
          return {
            ...node,
            connectionStatus: messageData === 1 ? 'online' : 'offline',
            systemInfo: messageData === 0 ? null : node.systemInfo
          };
        }
        return node;
      }));
    } else if (type === 'info') {
      setNodeList(prev => prev.map(node => {
        if (node.id == id) {
          try {
            let systemInfo;
            if (typeof messageData === 'string') {
              systemInfo = JSON.parse(messageData);
            } else {
              systemInfo = messageData;
            }
            
            const currentUpload = parseInt(systemInfo.bytes_transmitted) || 0;
            const currentDownload = parseInt(systemInfo.bytes_received) || 0;
            const currentUptime = parseInt(systemInfo.uptime) || 0;
            
            let uploadSpeed = 0;
            let downloadSpeed = 0;
            
            if (node.systemInfo && node.systemInfo.uptime) {
              const timeDiff = currentUptime - node.systemInfo.uptime;
              
              if (timeDiff > 0 && timeDiff <= 10) {
                const lastUpload = node.systemInfo.uploadTraffic || 0;
                const lastDownload = node.systemInfo.downloadTraffic || 0;
                
                const uploadDiff = currentUpload - lastUpload;
                const downloadDiff = currentDownload - lastDownload;
                
                const uploadReset = currentUpload < lastUpload;
                const downloadReset = currentDownload < lastDownload;
                
                if (!uploadReset && uploadDiff >= 0) {
                  uploadSpeed = uploadDiff / timeDiff;
                }
                
                if (!downloadReset && downloadDiff >= 0) {
                  downloadSpeed = downloadDiff / timeDiff;
                }
              }
            }
            
            return {
              ...node,
              connectionStatus: 'online',
              // 节点在系统信息里顺带上报 sing-box 状态,这里实时更新
              singboxRunning: typeof systemInfo.singbox_running === 'boolean'
                ? systemInfo.singbox_running
                : node.singboxRunning,
              systemInfo: {
                cpuUsage: parseFloat(systemInfo.cpu_usage) || 0,
                memoryUsage: parseFloat(systemInfo.memory_usage) || 0,
                uploadTraffic: currentUpload,
                downloadTraffic: currentDownload,
                uploadSpeed: uploadSpeed,
                downloadSpeed: downloadSpeed,
                uptime: currentUptime
              }
            };
          } catch (error) {
            return node;
          }
        }
        return node;
      }));
    }
  };

  // 尝试重新连接
  const attemptReconnect = () => {
    if (reconnectAttemptsRef.current < maxReconnectAttempts) {
      reconnectAttemptsRef.current++;
      
      reconnectTimerRef.current = setTimeout(() => {
        initWebSocket();
      }, 3000 * reconnectAttemptsRef.current);
    }
  };

  // 关闭WebSocket连接
  const closeWebSocket = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    reconnectAttemptsRef.current = 0;
    
    if (websocketRef.current) {
      websocketRef.current.onopen = null;
      websocketRef.current.onmessage = null;
      websocketRef.current.onerror = null;
      websocketRef.current.onclose = null;
      
      if (websocketRef.current.readyState === WebSocket.OPEN || 
          websocketRef.current.readyState === WebSocket.CONNECTING) {
        websocketRef.current.close();
      }
      
      websocketRef.current = null;
    }
    
    setNodeList(prev => prev.map(node => ({
      ...node,
      connectionStatus: 'offline',
      systemInfo: null
    })));
  };


  
  // 格式化速度
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '0 B/s';
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化开机时间
  const formatUptime = (seconds: number): string => {
    if (seconds === 0) return '-';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return t("mca22ecc965dc", {v0: days, v1: hours});
    } else if (hours > 0) {
      return t("mf2dcbb87991e", {v0: hours, v1: minutes});
    } else {
      return t("mb18708c343cb", {v0: minutes});
    }
  };

  // 格式化流量
  const formatTraffic = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 获取进度条颜色
  const getProgressColor = (value: number, offline = false): "default" | "primary" | "secondary" | "success" | "warning" | "danger" => {
    if (offline) return "default";
    if (value <= 50) return "success";
    if (value <= 80) return "warning";
    return "danger";
  };

  // 验证IP地址格式
  const validateIp = (ip: string): boolean => {
    if (!ip || !ip.trim()) return false;
    
    const trimmedIp = ip.trim();
    
    // IPv4格式验证
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6格式验证
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    
    if (ipv4Regex.test(trimmedIp) || ipv6Regex.test(trimmedIp) || trimmedIp === 'localhost') {
      return true;
    }
    
    // 验证域名格式
    if (/^\d+$/.test(trimmedIp)) return false;
    
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)+$/;
    const singleLabelDomain = /^[a-zA-Z][a-zA-Z0-9\-]{0,62}$/;
    
    return domainRegex.test(trimmedIp) || singleLabelDomain.test(trimmedIp);
  };

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!form.name.trim()) {
      newErrors.name = t("m276934a07b1a");
    } else if (form.name.trim().length < 2) {
      newErrors.name = t("m1357cb916693");
    } else if (form.name.trim().length > 50) {
      newErrors.name = t("m50281516b0ae");
    }
    
    if (!form.ipString.trim()) {
      newErrors.ipString = t("me079e13fbd8b");
    } else {
      const ips = form.ipString.split('\n').map(ip => ip.trim()).filter(ip => ip);
      if (ips.length === 0) {
        newErrors.ipString = t("mafe8427c9afd");
      } else {
        for (let i = 0; i < ips.length; i++) {
          if (!validateIp(ips[i])) {
            newErrors.ipString = t("mb69e798e02cf", {v0: i + 1, v1: ips[i]});
            break;
          }
        }
      }
    }
    
    if (!form.serverIp.trim()) {
      newErrors.serverIp = t("mc8cf0c7fea3d");
    } else if (!validateIp(form.serverIp.trim())) {
      newErrors.serverIp = t("m665a61f994cd");
    }

    // 连接域名是可选的:留空表示用 IP,填了才校验格式(且必须是域名,填 IP 没意义)
    const domain = form.domain.trim();
    if (domain) {
      if (/^[\d.]+$/.test(domain) || domain.includes(':') || domain.includes('/')) {
        newErrors.domain = t("m668c560e6f22");
      } else if (!validateIp(domain)) {
        newErrors.domain = t("m51eef18ee867");
      }
    }

    if (!form.portSta || form.portSta < 1 || form.portSta > 65535) {
      newErrors.portSta = t("m621ff983ca35");
    }
    
    if (!form.portEnd || form.portEnd < 1 || form.portEnd > 65535) {
      newErrors.portEnd = t("m621ff983ca35");
    } else if (form.portEnd < form.portSta) {
      newErrors.portEnd = t("mb2170aa02732");
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 新增转发机
  const handleAdd = () => {
    setDialogTitle(t("mfbd9d2bc95bb"));
    setIsEdit(false);
    setDialogVisible(true);
    resetForm();
    setProtocolDisabled(true);
    setProtocolDisabledReason(t("mcf6be1f3fd48"));
  };

  // 编辑转发机
  const handleEdit = (node: Node) => {
    setDialogTitle(t("m815c47206c77"));
    setIsEdit(true);
    setForm({
      id: node.id,
      name: node.name,
      ipString: node.ip ? node.ip.split(',').map(ip => ip.trim()).join('\n') : '',
      serverIp: node.serverIp || '',
      domain: node.domain || '',
      portSta: node.portSta,
      portEnd: node.portEnd,
      http: typeof node.http === 'number' ? node.http : 1,
      tls: typeof node.tls === 'number' ? node.tls : 1,
      socks: typeof node.socks === 'number' ? node.socks : 1
    });
    const offline = node.connectionStatus !== 'online';
    setProtocolDisabled(offline);
    setProtocolDisabledReason(offline ? t("mcf6be1f3fd48") : '');
    setDialogVisible(true);
  };

  // 删除转发机
  const handleDelete = (node: Node) => {
    setNodeToDelete(node);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!nodeToDelete) return;
    
    setDeleteLoading(true);
    try {
      const res = await deleteNode(nodeToDelete.id);
      if (res.code === 0) {
        toast.success(t("m5223f91b9670"));
        setNodeList(prev => prev.filter(n => n.id !== nodeToDelete.id));
        setDeleteModalOpen(false);
        setNodeToDelete(null);
      } else {
        toast.error(res.msg || t("mc228558cf257"));
      }
    } catch (error) {
      toast.error(t("mfa8326d4a0e5"));
    } finally {
      setDeleteLoading(false);
    }
  };

  // 兼容 http(非安全上下文)的复制:见 @/utils/clipboard
  const copyText = (text: string): Promise<boolean> => copyTextToClipboard(text);

  // 复制安装命令
  const handleCopyInstallCommand = async (node: Node) => {
    setNodeList(prev => prev.map(n => 
      n.id === node.id ? { ...n, copyLoading: true } : n
    ));
    
    try {
      let res = await getNodeInstallCommand(node.id);
      // 面板地址(网站配置的 ip)没设时,自动用当前访问域名 + 后端默认口 6365 填好再重试,
      // 免得用户手配或手打命令(手打易带 http:// 导致节点离线)
      if (res.code !== 0 && String(res.msg || "").includes("ip")) {
        await updateConfig("ip", `${window.location.hostname}:6365`);
        res = await getNodeInstallCommand(node.id);
      }
      if (res.code === 0 && res.data) {
        if (await copyText(res.data)) {
          toast.success(t("m209486f0c93e"));
        } else {
          // 复制失败，显示安装命令模态框让用户手动选择
          setInstallCommand(res.data);
          setCurrentNodeName(node.name);
          setInstallCommandModal(true);
        }
      } else {
        toast.error(res.msg || t("m40f46e631d28"));
      }
    } catch (error) {
      toast.error(t("m40f46e631d28"));
    } finally {
      setNodeList(prev => prev.map(n => 
        n.id === node.id ? { ...n, copyLoading: false } : n
      ));
    }
  };

  // 手动复制安装命令
  const handleManualCopy = async () => {
    if (await copyText(installCommand)) {
      toast.success(t("m209486f0c93e"));
      setInstallCommandModal(false);
    } else {
      toast.error(t("mc883084221db"));
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitLoading(true);
    
    try {
      const ipString = form.ipString
        .split('\n')
        .map(ip => ip.trim())
        .filter(ip => ip)
        .join(',');
        
      const submitData = {
        ...form,
        ip: ipString
      };
      delete (submitData as any).ipString;
      
      const apiCall = isEdit ? updateNode : createNode;
      const data = isEdit ? submitData : { 
        name: form.name, 
        ip: ipString,
        serverIp: form.serverIp,
        domain: form.domain.trim(),
        portSta: form.portSta,
        portEnd: form.portEnd,
        http: form.http,
        tls: form.tls,
        socks: form.socks
      };
      
      const res = await apiCall(data);
      if (res.code === 0) {
        toast.success(isEdit ? t("m7c0d2664869c") : t("m1ab62884f4ee"));
        setDialogVisible(false);
        
        if (isEdit) {
          setNodeList(prev => prev.map(n => 
            n.id === form.id ? {
              ...n,
              name: form.name,
              ip: ipString,
              serverIp: form.serverIp,
              domain: form.domain.trim(),
              portSta: form.portSta,
              portEnd: form.portEnd,
              http: form.http,
              tls: form.tls,
              socks: form.socks
            } : n
          ));
        } else {
          loadNodes();
        }
      } else {
        toast.error(res.msg || (isEdit ? t("mec99e5c45d64") : t("m7e6a71efbf63")));
      }
    } catch (error) {
      toast.error(t("mfa8326d4a0e5"));
    } finally {
      setSubmitLoading(false);
    }
  };

  // 重置表单
  const resetForm = () => {
    setForm({
      id: null,
      name: '',
      ipString: '',
      serverIp: '',
      domain: '',
      portSta: 1000,
      portEnd: 65535,
      http: 0,
      tls: 0,
      socks: 0
    });
    setErrors({});
  };

  return (
    
      <div className="px-3 lg:px-6 py-8">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
        </div>

        <Button
              size="sm"
              variant="flat"
              color="primary"
              onPress={handleAdd}
             
            > {t("m0006d696d8e1")} </Button>
     
        </div>

        {/* 转发机列表 */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <span className="text-default-600">{t("m7545b3950397")}</span>
            </div>
          </div>
        ) : nodeList.length === 0 ? (
          <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
            <CardBody className="text-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12l4-4m-4 4l4 4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{t("m4d59230b4cda")}</h3>
                  <p className="text-default-500 text-sm mt-1">{t("mc66263e89563")}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {nodeList.map((node) => (
              <Card 
                key={node.id} 
                className="shadow-sm border border-divider hover:shadow-md transition-shadow duration-200"
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start w-full">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate text-sm">{node.name}</h3>
                      <p className="text-xs text-default-500 truncate">{node.serverIp}</p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      <Chip 
                        color={node.connectionStatus === 'online' ? 'success' : 'danger'} 
                        variant="flat" 
                        size="sm"
                        className="text-xs"
                      >
                        {node.connectionStatus === 'online' ? t("mb9086662b1df") : t("mbe1b4f3c6c1c")}
                      </Chip>
                    </div>
                  </div>
                </CardHeader>

                <CardBody className="pt-0 pb-3">
                  {/* 「在线」只代表 gost 活着。sing-box 是另一个服务,它挂了这里照样绿,
                      但那台机上的协议全都用不了 —— 必须单独标出来 */}
                  {node.connectionStatus === 'online' && node.singboxRunning === false && (
                    node.singboxInstalling ? (
                      <div className="mb-3 rounded-lg border border-default-300 bg-default-100 px-2.5 py-2">
                        <div className="text-xs font-medium text-default-600">{t("m26dbc4e9118c")}</div>
                        <div className="text-[11px] text-default-500 mt-0.5 leading-relaxed"> {t("m633889620782")} </div>
                      </div>
                    ) : (
                      <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-2">
                        <div className="text-xs font-semibold text-danger">
                          ⚠️ sing-box {node.singboxInstallErr ? t("ma8581cc00ff3") : t("m62cdc8713bcf")}
                        </div>
                        <div className="text-[11px] text-default-500 mt-0.5 leading-relaxed">
                          {node.singboxInstallErr ? (
                            <>{t("m9e3ab9890e5f")}<code className="font-mono break-all">{node.singboxInstallErr}</code> {t("mc6e83e690924")}</>
                          ) : node.singboxInstalled === false ? (
                            <>{t("mdfce9cc3fa7d")}<span className="text-danger">{t("m8446052e25b9")}</span>{t("m361c02d58aeb")}</>
                          ) : (
                            <>{t("m44e3695ade6d")} <code className="font-mono">systemctl enable --now sing-box</code> {t("mb70c4d95637d")}</>
                          )}
                        </div>
                      </div>
                    )
                  )}
                  {/* 基础信息 */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center text-sm min-w-0">
                      <span className="text-default-600 flex-shrink-0">{t("m719a991b7f07")}</span>
                      <div className="text-right text-xs min-w-0 flex-1 ml-2">
                        {node.ip ? (
                          node.ip.split(',').length > 1 ? (
                            <span className="font-mono truncate block" title={node.ip.split(',')[0].trim()}>
                              {node.ip.split(',')[0].trim()} +{node.ip.split(',').length - 1}{t("m3a116815bc9d")} </span>
                          ) : (
                            <span className="font-mono truncate block" title={node.ip.trim()}>
                              {node.ip.trim()}
                            </span>
                          )
                        ) : '-'}
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">{t("me71ac32b544b")}</span>
                      <span className="text-xs">{node.portSta}-{node.portEnd}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">{t("m5f76b2bf82dd")}</span>
                      <span className="text-xs">{node.version || t("m4d8c1c5b4283")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">{t("m2a703dd5acd8")}</span>
                      <span className="text-xs">
                        {node.connectionStatus === 'online' && node.systemInfo 
                          ? formatUptime(node.systemInfo.uptime)
                          : '-'
                        }
                      </span>
                    </div>
                  </div>

                  {/* 系统监控 */}
                  <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>CPU</span>
                          <span className="font-mono">
                            {node.connectionStatus === 'online' && node.systemInfo 
                              ? `${node.systemInfo.cpuUsage.toFixed(1)}%` 
                              : '-'
                            }
                          </span>
                        </div>
                        <Progress
                          value={node.connectionStatus === 'online' && node.systemInfo ? node.systemInfo.cpuUsage : 0}
                          color={getProgressColor(
                            node.connectionStatus === 'online' && node.systemInfo ? node.systemInfo.cpuUsage : 0,
                            node.connectionStatus !== 'online'
                          )}
                          size="sm"
                          aria-label={t("m4b849ef8677c")}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>{t("m7d8f8c37ec78")}</span>
                          <span className="font-mono">
                            {node.connectionStatus === 'online' && node.systemInfo 
                              ? `${node.systemInfo.memoryUsage.toFixed(1)}%` 
                              : '-'
                            }
                          </span>
                        </div>
                        <Progress
                          value={node.connectionStatus === 'online' && node.systemInfo ? node.systemInfo.memoryUsage : 0}
                          color={getProgressColor(
                            node.connectionStatus === 'online' && node.systemInfo ? node.systemInfo.memoryUsage : 0,
                            node.connectionStatus !== 'online'
                          )}
                          size="sm"
                          aria-label={t("mace212ad8fd3")}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 bg-default-50 dark:bg-default-100 rounded">
                        <div className="text-default-600 mb-0.5">{t("m9e07e3c0532d")}</div>
                        <div className="font-mono">
                          {node.connectionStatus === 'online' && node.systemInfo 
                            ? formatSpeed(node.systemInfo.uploadSpeed) 
                            : '-'
                          }
                        </div>
                      </div>
                      <div className="text-center p-2 bg-default-50 dark:bg-default-100 rounded">
                        <div className="text-default-600 mb-0.5">{t("m4673a2306165")}</div>
                        <div className="font-mono">
                          {node.connectionStatus === 'online' && node.systemInfo 
                            ? formatSpeed(node.systemInfo.downloadSpeed) 
                            : '-'
                          }
                        </div>
                      </div>
                    </div>

                    {/* 流量统计 */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 bg-primary-50 dark:bg-primary-100/20 rounded border border-primary-200 dark:border-primary-300/20">
                        <div className="text-primary-600 dark:text-primary-400 mb-0.5">{t("m890e0c70baf6")}</div>
                        <div className="font-mono text-primary-700 dark:text-primary-300">
                          {node.connectionStatus === 'online' && node.systemInfo 
                            ? formatTraffic(node.systemInfo.uploadTraffic) 
                            : '-'
                          }
                        </div>
                      </div>
                      <div className="text-center p-2 bg-success-50 dark:bg-success-100/20 rounded border border-success-200 dark:border-success-300/20">
                        <div className="text-success-600 dark:text-success-400 mb-0.5">{t("m22bb5eb6a911")}</div>
                        <div className="font-mono text-success-700 dark:text-success-300">
                          {node.connectionStatus === 'online' && node.systemInfo 
                            ? formatTraffic(node.systemInfo.downloadTraffic) 
                            : '-'
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="flat"
                        color="success"
                        onPress={() => handleCopyInstallCommand(node)}
                        isLoading={node.copyLoading}
                        className="flex-1 min-h-8"
                      > {t("mbdf7d59b3dc2")} </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        onPress={() => handleEdit(node)}
                        className="flex-1 min-h-8"
                      > {t("m051836569928")} </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        onPress={() => handleDelete(node)}
                        className="flex-1 min-h-8"
                      > {t("m2f9daa828907")} </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* 新增/编辑转发机对话框 */}
        <Modal 
          isOpen={dialogVisible} 
          onClose={() => setDialogVisible(false)}
          size="2xl"
          scrollBehavior="outside"
          backdrop="blur"
          placement="center"
        >
          <ModalContent>
            <ModalHeader>{dialogTitle}</ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Input
                  label={t("m752e5decc425")}
                  placeholder={t("m276934a07b1a")}
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  isInvalid={!!errors.name}
                  errorMessage={errors.name}
                  variant="bordered"
                />

                <Input
                  label={t("m5562218a9a7b")}
                  placeholder={t("ma50d62ce2b4a")}
                  value={form.serverIp}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    serverIp: e.target.value,
                    // 入口IP 默认自动跟随服务器IP;用户手动改过入口IP后就不再覆盖
                    ipString: (!prev.ipString || prev.ipString === prev.serverIp) ? e.target.value : prev.ipString,
                  }))}
                  isInvalid={!!errors.serverIp}
                  errorMessage={errors.serverIp}
                  variant="bordered"
                />

                <Input
                  label={t("m95ee4eccac94")}
                  placeholder={t("m4e7ce1f18a8a")}
                  value={form.domain}
                  onChange={(e) => setForm(prev => ({ ...prev, domain: e.target.value }))}
                  isInvalid={!!errors.domain}
                  errorMessage={errors.domain}
                  variant="bordered"
                  description={t("mb051deb1adc9")}
                />

                <Textarea
                  label={t("m719a991b7f07")}
                  placeholder={t("meee5162634e6")}
                  value={form.ipString}
                  onChange={(e) => setForm(prev => ({ ...prev, ipString: e.target.value }))}
                  isInvalid={!!errors.ipString}
                  errorMessage={errors.ipString}
                  variant="bordered"
                  minRows={3}
                  maxRows={5}
                  description={t("m99f2968bb3db")}
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={t("m48457146631e")}
                    type="number"
                    placeholder="1000"
                    value={form.portSta.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, portSta: parseInt(e.target.value) || 1000 }))}
                    isInvalid={!!errors.portSta}
                    errorMessage={errors.portSta}
                    variant="bordered"
                    min={1}
                    max={65535}
                  />

                  <Input
                    label={t("mee67a40bbf68")}
                    type="number"
                    placeholder="65535"
                    value={form.portEnd.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, portEnd: parseInt(e.target.value) || 65535 }))}
                    isInvalid={!!errors.portEnd}
                    errorMessage={errors.portEnd}
                    variant="bordered"
                    min={1}
                    max={65535}
                  />
                </div>

                {/* 屏蔽协议 */}
                <div className="mt-1">
                  <div className="text-sm font-medium text-default-700">{t("mec21dc2300dd")}</div>
                  <div className="text-xs text-default-500 mb-2">{t("m903800a419f0")}</div>
                  {protocolDisabled && (
                    <Alert
                      color="warning"
                      variant="flat"
                      description={protocolDisabledReason || t("me646d3137c6b")}
                      className="mb-2"
                    />
                  )}
                  <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 bg-default-50 dark:bg-default-100 p-3 rounded-md border border-default-200 dark:border-default-100/30 ${protocolDisabled ? 'opacity-70' : ''}`}>
                    {/* HTTP tile */}
                    <div className="px-3 py-3 rounded-lg bg-white dark:bg-default-50 border border-default-200 dark:border-default-100/30 hover:border-primary-200 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-default-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>
                        <div className="text-sm font-medium text-default-700">HTTP</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-default-500">{t("m8a04c283a0b9")}</div>
                        <Switch
                          size="sm"
                          isSelected={form.http === 1}
                          isDisabled={protocolDisabled}
                          onValueChange={(v) => setForm(prev => ({ ...prev, http: v ? 1 : 0 }))}
                        />
                      </div>
                      <div className="mt-1 text-xs text-default-400">{form.http === 1 ? t("m8a4ef3e48e4e") : t("m6744b4c6a9aa")}</div>
                    </div>

                    {/* TLS tile */}
                    <div className="px-3 py-3 rounded-lg bg-white dark:bg-default-50 border border-default-200 dark:border-default-100/30 hover:border-primary-200 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-default-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10V7a6 6 0 1 1 12 0v3"/><rect x="4" y="10" width="16" height="10" rx="2"/></svg>
                        <div className="text-sm font-medium text-default-700">TLS</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-default-500">{t("m8a04c283a0b9")}</div>
                        <Switch
                          size="sm"
                          isSelected={form.tls === 1}
                          isDisabled={protocolDisabled}
                          onValueChange={(v) => setForm(prev => ({ ...prev, tls: v ? 1 : 0 }))}
                        />
                      </div>
                      <div className="mt-1 text-xs text-default-400">{form.tls === 1 ? t("m8a4ef3e48e4e") : t("m6744b4c6a9aa")}</div>
                    </div>

                    {/* SOCKS tile */}
                    <div className="px-3 py-3 rounded-lg bg-white dark:bg-default-50 border border-default-200 dark:border-default-100/30 hover:border-primary-200 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-default-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <div className="text-sm font-medium text-default-700">SOCKS</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-default-500">{t("m8a04c283a0b9")}</div>
                        <Switch
                          size="sm"
                          isSelected={form.socks === 1}
                          isDisabled={protocolDisabled}
                          onValueChange={(v) => setForm(prev => ({ ...prev, socks: v ? 1 : 0 }))}
                        />
                      </div>
                      <div className="mt-1 text-xs text-default-400">{form.socks === 1 ? t("m8a4ef3e48e4e") : t("m6744b4c6a9aa")}</div>
                    </div>
                  </div>
                </div>



                <Alert
                        color="danger"
                        variant="flat"
                        description={t("m8a9090f61890")}
                        className="mt-3"
                      />
                
                <Alert
                        color="primary"
                        variant="flat"
                        description={t("md6f1f2b8378c")}
                        className="mt-4"
                      />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="flat"
                onPress={() => setDialogVisible(false)}
              > {t("m2cd0f3be8738")} </Button>
              <Button
                color="primary"
                onPress={handleSubmit}
                isLoading={submitLoading}
              >
                {submitLoading ? t("m2fb1db2875cb") : t("mfac2a67ad878")}
              </Button>
            </ModalFooter>
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
                  <p>{t("m087d2951dabe")} <strong>"{nodeToDelete?.name}"</strong> {t("m9d45d8943988")}</p>
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

        {/* 安装命令模态框 */}
        <Modal 
          isOpen={installCommandModal} 
          onClose={() => setInstallCommandModal(false)}
          size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
        >
          <ModalContent>
            <ModalHeader>{t("mb246d375d6c2")} {currentNodeName}</ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <p className="text-sm text-default-600"> {t("m4127bd39d2e6")} </p>
                <div className="relative">
                  <Textarea
                    value={installCommand}
                    readOnly
                    variant="bordered"
                    minRows={6}
                    maxRows={10}
                    className="font-mono text-sm"
                    classNames={{
                      input: "font-mono text-sm"
                    }}
                  />
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    className="absolute top-2 right-2"
                    onPress={handleManualCopy}
                  > {t("m63d90d977348")} </Button>
                </div>
                <div className="text-xs text-default-500"> {t("m1d6ae70041b8")} </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="flat"
                onPress={() => setInstallCommandModal(false)}
              > {t("m3fd47edce45b")} </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    
  );
}
