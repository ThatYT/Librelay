import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { 
  Table, 
  TableHeader, 
  TableColumn, 
  TableBody, 
  TableRow, 
  TableCell 
} from "@heroui/table";
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter,
  useDisclosure 
} from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { RadioGroup, Radio } from "@heroui/radio";
import { DatePicker } from "@heroui/date-picker";
import { Spinner } from "@heroui/spinner";
import { Progress } from "@heroui/progress";

import toast from '@/utils/toast';
import { 
  User, 
  UserForm, 
  UserTunnel, 
  UserTunnelForm, 
  Tunnel, 
  SpeedLimit, 
  Pagination as PaginationType 
} from '@/types';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getTunnelList,
  assignUserTunnel,
  getUserTunnelList,
  removeUserTunnel,
  updateUserTunnel,
  getSpeedLimitList,
  resetUserFlow,
  getUserLines,
  setLineStatus,
  deleteLine,
  updateLine
} from '@/api';
import { copyTextToClipboard } from '@/utils/clipboard';
import { SubQrToggle } from '@/components/sub-qr';
import { SearchIcon, EditIcon, DeleteIcon, UserIcon, SettingsIcon } from '@/components/icons';
import { parseDate } from "@internationalized/date";


// 工具函数
const formatFlow = (value: number, unit: string = 'bytes'): string => {
  if (unit === 'gb') {
    return `${value} GB`;
  } else {
    if (value === 0) return '0 B';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

const getExpireStatus = (expTime: number) => {
  const now = Date.now();
  if (expTime < now) {
    return { color: 'danger' as const, text: t("m2fe0e3339ac4") };
  }
  const diffDays = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    return { color: 'warning' as const, text: t("ma326822b646d", {v0: diffDays}) };
  }
  return { color: 'success' as const, text: t("m296de0e31f8c") };
};

// 获取用户状态（根据status字段）
const getUserStatus = (user: User) => {
  if (user.status === 1) {
    return { color: 'success' as const, text: t("m296de0e31f8c") };
  } else {
    return { color: 'danger' as const, text: t("m7df5c456c765") };
  }
};

const calculateUserTotalUsedFlow = (user: User): number => {
  return (user.inFlow || 0) + (user.outFlow || 0);
};

const calculateTunnelUsedFlow = (tunnel: UserTunnel): number => {
  const inFlow = tunnel.inFlow || 0;
  const outFlow = tunnel.outFlow || 0;
  
  // 后端已按计费类型处理流量，前端直接使用入站+出站总和
  return inFlow + outFlow;
};

export default function UserPage() {
  useTranslation();
  // 状态管理
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pagination, setPagination] = useState<PaginationType>({
    current: 1,
    size: 10,
    total: 0
  });

  // 用户表单相关状态
  const { isOpen: isUserModalOpen, onOpen: onUserModalOpen, onClose: onUserModalClose } = useDisclosure();
  const [isEdit, setIsEdit] = useState(false);
  // 用户表单只管「人」(账号/密码/状态)。
  // 套餐参数(限速、流量、到期、重置日)一律在「分配用户」时按线路填 —— 那才是卖出去的东西。
  // 这里的 flow/num 对协议和中转都不生效(流量按线路算、转发数量分配路径根本不查),
  // 留着只是给老的端口/隧道转发业务用,所以给足量默认值、表单里不再让人操心。
  const [userForm, setUserForm] = useState<UserForm>({
    user: '',
    pwd: '',
    status: 1,
    flow: 99999,
    num: 99999,
    expTime: null,
    flowResetTime: 1
  });
  const [userFormLoading, setUserFormLoading] = useState(false);

  // 隧道权限管理相关状态
  const { isOpen: isTunnelModalOpen, onOpen: onTunnelModalOpen, onClose: onTunnelModalClose } = useDisclosure();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userTunnels, setUserTunnels] = useState<UserTunnel[]>([]);
  const [tunnelListLoading, setTunnelListLoading] = useState(false);  
  
  // 分配新隧道权限相关状态
  const [tunnelForm, setTunnelForm] = useState<UserTunnelForm>({
    tunnelId: null,
    flow: 100,
    num: 10,
    expTime: null,
    flowResetTime: 0,
    speedId: null
  });
  const [assignLoading, setAssignLoading] = useState(false);

  // 编辑隧道权限相关状态
  const { isOpen: isEditTunnelModalOpen, onOpen: onEditTunnelModalOpen, onClose: onEditTunnelModalClose } = useDisclosure();
  const [editTunnelForm, setEditTunnelForm] = useState<UserTunnel | null>(null);
  const [editTunnelLoading, setEditTunnelLoading] = useState(false);

  // 删除确认相关状态
  const { isOpen: isDeleteModalOpen, onOpen: onDeleteModalOpen, onClose: onDeleteModalClose } = useDisclosure();
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // 删除隧道权限确认相关状态
  const { isOpen: isDeleteTunnelModalOpen, onOpen: onDeleteTunnelModalOpen, onClose: onDeleteTunnelModalClose } = useDisclosure();
  const [tunnelToDelete, setTunnelToDelete] = useState<UserTunnel | null>(null);

  // 重置流量确认相关状态
  const { isOpen: isResetFlowModalOpen, onOpen: onResetFlowModalOpen, onClose: onResetFlowModalClose } = useDisclosure();
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [resetFlowLoading, setResetFlowLoading] = useState(false);

  // 重置隧道流量确认相关状态
  const { isOpen: isResetTunnelFlowModalOpen, onOpen: onResetTunnelFlowModalOpen, onClose: onResetTunnelFlowModalClose } = useDisclosure();

  // 订阅线路模态框(合体面板:车友的每台机器一条订阅,直连/中转各一条)
  const { isOpen: isSubModalOpen, onOpen: onSubModalOpen, onClose: onSubModalClose } = useDisclosure();
  const [subLines, setSubLines] = useState<any[]>([]);
  const [subAllToken, setSubAllToken] = useState<string>('');
  const [subUserName, setSubUserName] = useState<string>('');
  const subUrl = (token: string) => `${window.location.origin}/api/v1/open_api/sub?token=${token}`;
  // Clash / Mihomo 走独立路径:那边吃 YAML,和上面这条 base64 链接列表不通用,
  // 贴错了客户端里是空的。
  const clashUrl = (token: string) => `${window.location.origin}/api/v1/open_api/clash?token=${token}`;

  const handleShowSub = async (user: User) => {
    try {
      const res = await getUserLines(user.id);
      // 后端返回结构从数组改成了 {lines, allSubToken},两种都认(版本不同步也不炸)
      const d: any = res.code === 0 ? res.data : null;
      const lines = Array.isArray(d) ? d : (d?.lines || []);
      setSubAllToken(!Array.isArray(d) && d?.allSubToken ? d.allSubToken : '');
      if (!lines.length) {
        toast.error(t("m08f5856dad30"));
        return;
      }
      setSubUserName(user.user);
      setSubUserId(user.id);
      setSubLines(lines);
      onSubModalOpen();
    } catch (e) {
      toast.error(t("mbd7df7403f36"));
    }
  };
  // 停用/恢复/删除之后重新拉一次,让弹窗里的状态跟着变,不用关掉重开
  const reloadSubLines = async (userId: number) => {
    const res = await getUserLines(userId);
    const d: any = res.code === 0 ? res.data : null;
    setSubLines(Array.isArray(d) ? d : (d?.lines || []));
  };
  const [subUserId, setSubUserId] = useState<number | null>(null);

  const [tunnelToReset, setTunnelToReset] = useState<UserTunnel | null>(null);
  const [resetTunnelFlowLoading, setResetTunnelFlowLoading] = useState(false);

  // 其他数据
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [speedLimits, setSpeedLimits] = useState<SpeedLimit[]>([]);

  // 生命周期
  useEffect(() => {
    loadUsers();
    loadTunnels();
    loadSpeedLimits();
  }, [pagination.current, pagination.size, searchKeyword]);

  // 数据加载函数
  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getAllUsers({
        current: pagination.current,
        size: pagination.size,
        keyword: searchKeyword
      });
      
      if (response.code === 0) {
        const data = response.data || {};
        setUsers(data || []);
      } else {
        toast.error(response.msg || t("m27ad52857906"));
      }
    } catch (error) {
      toast.error(t("m27ad52857906"));
    } finally {
      setLoading(false);
    }
  };

  const loadTunnels = async () => {
    try {
      const response = await getTunnelList();
      if (response.code === 0) {
        setTunnels(response.data || []);
      }
    } catch (error) {
      console.error(t("m8e2d2dfe2399"), error);
    }
  };

  const loadSpeedLimits = async () => {
    try {
      const response = await getSpeedLimitList();
      if (response.code === 0) {
        setSpeedLimits(response.data || []);
      }
    } catch (error) {
      console.error(t("m9565b9954105"), error);
    }
  };

  const loadUserTunnels = async (userId: number) => {
    setTunnelListLoading(true);
    try {
      const response = await getUserTunnelList({ userId });
      if (response.code === 0) {
        setUserTunnels(response.data || []);
      } else {
        toast.error(response.msg || t("m2919ea10d217"));
      }
    } catch (error) {
      toast.error(t("m2919ea10d217"));
    } finally {
      setTunnelListLoading(false);
    }
  };

  // 用户管理操作
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    loadUsers();
  };

  const handleAdd = () => {
    setIsEdit(false);
    setUserForm({
      user: '',
      pwd: '',
      status: 1,
      flow: 100,
      num: 10,
      expTime: null,
      flowResetTime: 0
    });
    onUserModalOpen();
  };

  const handleEdit = (user: User) => {
    setIsEdit(true);
    setUserForm({
      id: user.id,
      name: user.name,
      user: user.user,
      pwd: '',
      status: user.status,
      flow: user.flow,
      num: user.num,
      expTime: user.expTime ? new Date(user.expTime) : null,
      flowResetTime: user.flowResetTime ?? 0
    });
    onUserModalOpen();
  };

  const handleDelete = (user: User) => {
    setUserToDelete(user);
    onDeleteModalOpen();
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      const response = await deleteUser(userToDelete.id);
      if (response.code === 0) {
        toast.success(t("m5223f91b9670"));
        loadUsers();
        onDeleteModalClose();
        setUserToDelete(null);
      } else {
        toast.error(response.msg || t("mc228558cf257"));
      }
    } catch (error) {
      toast.error(t("mc228558cf257"));
    }
  };

  const handleSubmitUser = async () => {
    if (!userForm.user || (!userForm.pwd && !isEdit)) {
      toast.error(t("m47c728a9f3ef"));
      return;
    }

    setUserFormLoading(true);
    try {
      const submitData: any = {
        ...userForm,
        // 到期留空 = 永不过期。后端约定用 0 表示,别传 null(DTO 上是 @NotNull)
        expTime: userForm.expTime ? userForm.expTime.getTime() : 0
      };

      if (isEdit && !submitData.pwd) {
        delete submitData.pwd;
      }

      const response = isEdit ? await updateUser(submitData) : await createUser(submitData);
      
      if (response.code === 0) {
        toast.success(isEdit ? t("m7c0d2664869c") : t("m1ab62884f4ee"));
        onUserModalClose();
        loadUsers();
      } else {
        toast.error(response.msg || (isEdit ? t("mec99e5c45d64") : t("m7e6a71efbf63")));
      }
    } catch (error) {
      toast.error(isEdit ? t("mec99e5c45d64") : t("m7e6a71efbf63"));
    } finally {
      setUserFormLoading(false);
    }
  };

  // 隧道权限管理操作
  const handleManageTunnels = (user: User) => {
    setCurrentUser(user);
    setTunnelForm({
      tunnelId: null,
      flow: 100,
      num: 10,
      expTime: null,
      flowResetTime: 0,
      speedId: null
    });
    onTunnelModalOpen();
    loadUserTunnels(user.id);
  };

  const handleAssignTunnel = async () => {
    if (!tunnelForm.tunnelId || !currentUser) {
      toast.error(t("m47c728a9f3ef"));
      return;
    }

    setAssignLoading(true);
    try {
      const response = await assignUserTunnel({
        userId: currentUser.id,
        tunnelId: tunnelForm.tunnelId,
        flow: tunnelForm.flow,
        num: tunnelForm.num,
        // 留空 = 永久,用 0 表示(DTO 上是 @NotNull,不能传 null)
        expTime: tunnelForm.expTime ? tunnelForm.expTime.getTime() : 0,
        flowResetTime: tunnelForm.flowResetTime,
        speedId: tunnelForm.speedId
      });

      if (response.code === 0) {
        toast.success(t("mc5ebe5c0c2f7"));
        setTunnelForm({
          tunnelId: null,
          flow: 100,
          num: 10,
          expTime: null,
          flowResetTime: 0,
          speedId: null
        });
        loadUserTunnels(currentUser.id);
      } else {
        toast.error(response.msg || t("mdfb321848f1c"));
      }
    } catch (error) {
      toast.error(t("mdfb321848f1c"));
    } finally {
      setAssignLoading(false);
    }
  };

  const handleEditTunnel = (userTunnel: UserTunnel) => {
    setEditTunnelForm({
      ...userTunnel,
      expTime: userTunnel.expTime
    });
    onEditTunnelModalOpen();
  };

  const handleUpdateTunnel = async () => {
    if (!editTunnelForm) return;

    setEditTunnelLoading(true);
    try {
      const response = await updateUserTunnel({
        id: editTunnelForm.id,
        flow: editTunnelForm.flow,
        num: editTunnelForm.num,
        expTime: editTunnelForm.expTime,
        flowResetTime: editTunnelForm.flowResetTime,
        speedId: editTunnelForm.speedId,
        status: editTunnelForm.status
      });

      if (response.code === 0) {
        toast.success(t("m7c0d2664869c"));
        onEditTunnelModalClose();
        if (currentUser) {
          loadUserTunnels(currentUser.id);
        }
      } else {
        toast.error(response.msg || t("mec99e5c45d64"));
      }
    } catch (error) {
      toast.error(t("mec99e5c45d64"));
    } finally {
      setEditTunnelLoading(false);
    }
  };

  const handleRemoveTunnel = (userTunnel: UserTunnel) => {
    setTunnelToDelete(userTunnel);
    onDeleteTunnelModalOpen();
  };

  const handleConfirmRemoveTunnel = async () => {
    if (!tunnelToDelete) return;

    try {
      const response = await removeUserTunnel({ id: tunnelToDelete.id });
      if (response.code === 0) {
        toast.success(t("m5223f91b9670"));
        if (currentUser) {
          loadUserTunnels(currentUser.id);
        }
        onDeleteTunnelModalClose();
        setTunnelToDelete(null);
      } else {
        toast.error(response.msg || t("mc228558cf257"));
      }
    } catch (error) {
      toast.error(t("mc228558cf257"));
    }
  };

  // 重置流量相关函数
  const handleResetFlow = (user: User) => {
    setUserToReset(user);
    onResetFlowModalOpen();
  };

  const handleConfirmResetFlow = async () => {
    if (!userToReset) return;

    setResetFlowLoading(true);
    try {
      const response = await resetUserFlow({ 
        id: userToReset.id, 
        type: 1 // 1表示重置用户流量
      });
      
      if (response.code === 0) {
        toast.success(t("mbbd3d1a1fd12"));
        onResetFlowModalClose();
        setUserToReset(null);
        loadUsers(); // 重新加载用户列表
      } else {
        toast.error(response.msg || t("m4230b353344a"));
      }
    } catch (error) {
      toast.error(t("m4230b353344a"));
    } finally {
      setResetFlowLoading(false);
    }
  };

  // 隧道流量重置相关函数
  const handleResetTunnelFlow = (userTunnel: UserTunnel) => {
    setTunnelToReset(userTunnel);
    onResetTunnelFlowModalOpen();
  };

  const handleConfirmResetTunnelFlow = async () => {
    if (!tunnelToReset) return;

    setResetTunnelFlowLoading(true);
    try {
      const response = await resetUserFlow({ 
        id: tunnelToReset.id, 
        type: 2 // 2表示重置隧道流量
      });
      
      if (response.code === 0) {
        toast.success(t("m9de444e21108"));
        onResetTunnelFlowModalClose();
        setTunnelToReset(null);
        if (currentUser) {
          loadUserTunnels(currentUser.id); // 重新加载隧道权限列表
        }
      } else {
        toast.error(response.msg || t("m4230b353344a"));
      }
    } catch (error) {
      toast.error(t("m4230b353344a"));
    } finally {
      setResetTunnelFlowLoading(false);
    }
  };

  // 过滤数据
  const availableTunnels = tunnels.filter(
    tunnel => !userTunnels.some(ut => ut.tunnelId === tunnel.id)
  );

  const availableSpeedLimits = speedLimits.filter(
    speedLimit => speedLimit.tunnelId === tunnelForm.tunnelId
  );

  const editAvailableSpeedLimits = speedLimits.filter(
    speedLimit => speedLimit.tunnelId === editTunnelForm?.tunnelId
  );

  return (
    
      <div className="px-3 lg:px-6 py-8">
      {/* 页面头部 */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <Input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder={t("m52b14e4191ea")}
              startContent={<SearchIcon className="w-4 h-4 text-default-400" />}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
              classNames={{
                base: "bg-default-100",
                input: "bg-transparent",
                inputWrapper: "bg-default-100 border-2 border-default-200 hover:border-default-300 focus-within:border-primary data-[hover=true]:border-default-300"
              }}
            />
            <Button
              onClick={handleSearch}
              variant="solid"
              color="primary"
              isIconOnly
              className="min-h-10 w-10"
            >
              <SearchIcon className="w-4 h-4" />
            </Button>
          </div>
          
          <Button
              variant="flat"
              color="primary"
              onPress={handleAdd}
             
            > {t("m0006d696d8e1")} </Button>
        </div>
      </div>

      {/* 用户列表 */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <span className="text-default-600">{t("m7545b3950397")}</span>
          </div>
        </div>
      ) : users.length === 0 ? (
        <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
          <CardBody className="text-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center">
                <UserIcon className="w-8 h-8 text-default-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{t("m53d758976705")}</h3>
                <p className="text-default-500 text-sm mt-1">{t("mc2aa6a3e83e4")}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {users.map((user) => {
            const userStatus = getUserStatus(user);
            const expStatus = user.expTime ? getExpireStatus(user.expTime) : null;
            const usedFlow = calculateUserTotalUsedFlow(user);
            const flowPercent = user.flow > 0 ? Math.min((usedFlow / (user.flow * 1024 * 1024 * 1024)) * 100, 100) : 0;
            
            return (
              <Card 
                key={user.id} 
                className="shadow-sm border border-divider hover:shadow-md transition-shadow duration-200"
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start w-full">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate text-sm">
                        {user.name || user.user}
                      </h3>
                      <p className="text-xs text-default-500 truncate">@{user.user}</p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      <Chip 
                        color={userStatus.color} 
                        variant="flat" 
                        size="sm"
                        className="text-xs"
                      >
                        {userStatus.text}
                      </Chip>
                    </div>
                  </div>
                </CardHeader>

                <CardBody className="pt-0 pb-3">
                  <div className="space-y-2">
                    {/* 流量信息 */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">{t("mc79978d039ab")}</span>
                        <span className="font-medium text-xs">{formatFlow(user.flow, 'gb')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">{t("m9845c165151d")}</span>
                        <span className="font-medium text-xs text-danger">{formatFlow(usedFlow)}</span>
                      </div>
                      <Progress 
                        size="sm" 
                        value={flowPercent}
                        color={flowPercent > 90 ? 'danger' : flowPercent > 70 ? 'warning' : 'success'}
                        className="mt-1"
                        aria-label={t("mcf0709fbcc91", {v0: flowPercent.toFixed(1)})}
                      />
                    </div>

                    {/* 其他信息 */}
                    <div className="space-y-1.5 pt-2 border-t border-divider">
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">{t("m5ce44f1d307c")}</span>
                        <span className="font-medium text-xs">{user.num}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">{t("mddbf5e74cf57")}</span>
                        <span className="text-xs">{user.flowResetTime === 0 ? t("m09cb21113af0") : t("m43f6165be04b", {v0: user.flowResetTime})}</span>
                      </div>
                      {/* 用 > 0 而不是直接判真:expTime=0 是「永久」,`0 &&` 会把 0 渲染出来 */}
                      {!!user.expTime && user.expTime > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-default-600">{t("ma8e5f1716600")}</span>
                          <div className="text-right">
                            {expStatus && expStatus.color === 'success' ? (
                              <div className="text-xs">{formatDate(user.expTime)}</div>
                            ) : (
                              <Chip 
                                color={expStatus?.color || 'default'} 
                                variant="flat" 
                                size="sm"
                                className="text-xs"
                              >
                                {expStatus?.text || t("mec0d9bdb00a4")}
                              </Chip>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 mt-3">
                    {/* 第一行：编辑和重置 */}
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        onPress={() => handleEdit(user)}
                        className="flex-1 min-h-8"
                        startContent={<EditIcon className="w-3 h-3" />}
                      > {t("m051836569928")} </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="warning"
                        onPress={() => handleResetFlow(user)}
                        className="flex-1 min-h-8"
                        startContent={
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                          </svg>
                        }
                      > {t("mcb5d682bac3d")} </Button>
                    </div>
                    
                    {/* 第二行：权限和删除 */}
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="flat"
                        color="success"
                        onPress={() => handleManageTunnels(user)}
                        className="flex-1 min-h-8"
                        startContent={<SettingsIcon className="w-3 h-3" />}
                      > {t("m978cbca6265d")} </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        onPress={() => handleDelete(user)}
                        className="flex-1 min-h-8"
                        startContent={<DeleteIcon className="w-3 h-3" />}
                      > {t("m2f9daa828907")} </Button>
                    </div>

                    {/* 第三行:订阅链接(合体面板:该车友所有协议的订阅) */}
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="flat"
                        color="secondary"
                        onPress={() => handleShowSub(user)}
                        className="flex-1 min-h-8"
                      > {t("m56a2f779aedd")} </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}


      {/* 用户表单模态框 */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={onUserModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
      >
        <ModalContent>
          <ModalHeader>
            {isEdit ? t("mfff6a05a26bc") : t("mebabc83b6830")}
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t("m1a3f0617d6de")}
                value={userForm.user}
                onChange={(e) => setUserForm(prev => ({ ...prev, user: e.target.value }))}
                isRequired
              />
              <Input
                label={t("ma621ab606db2")}
                type="password"
                value={userForm.pwd}
                onChange={(e) => setUserForm(prev => ({ ...prev, pwd: e.target.value }))}
                placeholder={isEdit ? t("m5346863ac0f8") : t("m728a7b601c56")}
                isRequired={!isEdit}
              />
              <DatePicker
                label={t("mc818061f9c49")}
                value={userForm.expTime ? parseDate(userForm.expTime.toISOString().split('T')[0]) as any : null}
                onChange={(date) => {
                  if (date) {
                    const jsDate = new Date(date.year, date.month - 1, date.day, 23, 59, 59);
                    setUserForm(prev => ({ ...prev, expTime: jsDate }));
                  } else {
                    setUserForm(prev => ({ ...prev, expTime: null }));
                  }
                }}
                showMonthAndYearPickers
                className="cursor-pointer"
                description={t("mc09242d3ca3a")}
              />
            </div>

            <div className="text-xs text-default-500 mt-2"> {t("m4d9e0c9f6ee4")} </div>

            {/* 老的端口/隧道转发业务才用得上的账号级配额,默认折叠,别干扰卖订阅的主流程 */}
            <details className="mt-2">
              <summary className="text-xs text-default-500 cursor-pointer select-none"> {t("m29565f97e850")} </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <Input
                  label={t("mfa2a5242a715")}
                  type="number"
                  value={userForm.flow.toString()}
                  onChange={(e) => {
                    const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                    setUserForm(prev => ({ ...prev, flow: value }));
                  }}
                  min="1"
                  max="99999"
                  description={t("m382af3b610bb")}
                />
                <Input
                  label={t("m5ce44f1d307c")}
                  type="number"
                  value={userForm.num.toString()}
                  onChange={(e) => {
                    const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                    setUserForm(prev => ({ ...prev, num: value }));
                  }}
                  min="1"
                  max="99999"
                  description={t("m35d54ade2300")}
                />
                <Select
                  label={t("mab5fa4fb2901")}
                  description={t("me6d7f16631ff")}
                  selectedKeys={[userForm.flowResetTime.toString()]}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;
                    setUserForm(prev => ({ ...prev, flowResetTime: Number(value) }));
                  }}
                >
                  <>
                    <SelectItem key="0" textValue={t("m09cb21113af0")}>{t("m09cb21113af0")}</SelectItem>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <SelectItem key={day.toString()} textValue={t("m2ba4797e14d3", {v0: day})}> {t("m68b21af949de")}{day}{t("mdfc2a4ecfc26")} </SelectItem>
                    ))}
                  </>
                </Select>
              </div>
            </details>
            
            <RadioGroup
              label={t("m6320b4a8722a")}
              value={userForm.status.toString()}
              onValueChange={(value: string) => setUserForm(prev => ({ ...prev, status: Number(value) }))}
              orientation="horizontal"
            >
              <Radio value="1">{t("m296de0e31f8c")}</Radio>
              <Radio value="0">{t("m7df5c456c765")}</Radio>
            </RadioGroup>
          </ModalBody>
          <ModalFooter>
            <Button onPress={onUserModalClose}> {t("m2cd0f3be8738")} </Button>
            <Button
              color="primary"
              onPress={handleSubmitUser}
              isLoading={userFormLoading}
            > {t("mfac2a67ad878")} </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 隧道权限管理模态框 */}
      <Modal
        isOpen={isTunnelModalOpen}
        onClose={onTunnelModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
        isDismissable={false}
        classNames={{
          base: "max-w-[95vw] sm:max-w-4xl"
        }}
      >
        <ModalContent>
          <ModalHeader> {t("m0d0e1a86b3aa")} {currentUser?.user} {t("m6a4ff8cc5dd3")} </ModalHeader>
          <ModalBody>
            <div className="space-y-6">
              {/* 分配新权限部分 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">{t("mc80fe3177154")}</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label={t("macfb8f32676c")}
                      selectedKeys={tunnelForm.tunnelId ? [tunnelForm.tunnelId.toString()] : []}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as string;
                        setTunnelForm(prev => ({ ...prev, tunnelId: Number(value) || null, speedId: null }));
                      }}
                    >
                      {availableTunnels.map(tunnel => (
                        <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>
                          {tunnel.name}
                        </SelectItem>
                      ))}
                    </Select>
                    
                    <Select
                      label={t("m798157fd4601")}
                      selectedKeys={tunnelForm.speedId ? [tunnelForm.speedId.toString()] : ["null"]}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as string;
                        setTunnelForm(prev => ({ ...prev, speedId: value === "null" ? null : Number(value) }));
                      }}
                      isDisabled={!tunnelForm.tunnelId}
                    >
                      {[
                        <SelectItem key="null" textValue={t("me264d2c9faaf")}>{t("me264d2c9faaf")}</SelectItem>,
                        ...availableSpeedLimits.map(speedLimit => (
                          <SelectItem key={speedLimit.id.toString()} textValue={speedLimit.name}>
                            {speedLimit.name}
                          </SelectItem>
                        ))
                      ]}
                    </Select>
                    
                    <Input
                      label={t("mfa2a5242a715")}
                      type="number"
                      value={tunnelForm.flow.toString()}
                      onChange={(e) => {
                        const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                        setTunnelForm(prev => ({ ...prev, flow: value }));
                      }}
                      min="1"
                      max="99999"
                    />
                    
                    <Input
                      label={t("m5ce44f1d307c")}
                      type="number"
                      value={tunnelForm.num.toString()}
                      onChange={(e) => {
                        const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                        setTunnelForm(prev => ({ ...prev, num: value }));
                      }}
                      min="1"
                      max="99999"
                    />
                    
                    <Select
                      label={t("mab5fa4fb2901")}
                      selectedKeys={[tunnelForm.flowResetTime.toString()]}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as string;
                        setTunnelForm(prev => ({ ...prev, flowResetTime: Number(value) }));
                      }}
                    >
                      <>
                        <SelectItem key="0" textValue={t("m09cb21113af0")}> {t("m09cb21113af0")} </SelectItem>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <SelectItem key={day.toString()} textValue={t("m2ba4797e14d3", {v0: day})}> {t("m68b21af949de")}{day}{t("mdfc2a4ecfc26")} </SelectItem>
                      ))}
                      </>
                    </Select>
                    
                    <DatePicker
                      label={t("m5192466fec83")}
                      value={tunnelForm.expTime ? parseDate(tunnelForm.expTime.toISOString().split('T')[0]) as any : null}
                      onChange={(date) => {
                        if (date) {
                          const jsDate = new Date(date.year, date.month - 1, date.day, 23, 59, 59);
                          setTunnelForm(prev => ({ ...prev, expTime: jsDate }));
                        } else {
                          setTunnelForm(prev => ({ ...prev, expTime: null }));
                        }
                      }}
                      showMonthAndYearPickers
                      className="cursor-pointer"
                    />
                  </div>
                  
                  <Button
                    color="primary"
                    onPress={handleAssignTunnel}
                    isLoading={assignLoading}
                  > {t("me277fec502f4")} </Button>
                </div>
              </div>

              {/* 已有权限部分 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">{t("m3d5bb52359a1")}</h3>
                <Table
                  aria-label={t("m4a6ae5c2b77f")}
                  classNames={{
                    wrapper: "shadow-none",
                    th: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
                  }}
                >
                  <TableHeader>
                    <TableColumn>{t("mb679939ed787")}</TableColumn>
                    <TableColumn>{t("mff3790a87c0a")}</TableColumn>
                    <TableColumn>{t("m5ce44f1d307c")}</TableColumn>
                    <TableColumn>{t("m6320b4a8722a")}</TableColumn>
                    <TableColumn>{t("m798157fd4601")}</TableColumn>
                    <TableColumn>{t("mf90638383727")}</TableColumn>
                    <TableColumn>{t("m9ca4b75d0326")}</TableColumn>
                    <TableColumn>{t("med31fbb483ee")}</TableColumn>
                  </TableHeader>
                  <TableBody
                    items={userTunnels}
                    isLoading={tunnelListLoading}
                    loadingContent={<Spinner />}
                    emptyContent={t("m1515985eaa3d")}
                  >
                    {(userTunnel) => (
                      <TableRow key={userTunnel.id}>
                        <TableCell>{userTunnel.tunnelName}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-small">
                              <span className="text-gray-600">{t("m975119cd6962")}</span>
                              <span className="font-medium">{formatFlow(userTunnel.flow, 'gb')}</span>
                            </div>
                            <div className="flex justify-between text-small">
                              <span className="text-gray-600">{t("m7fbac733cbe4")}</span>
                              <span className="font-medium text-danger">
                                {formatFlow(calculateTunnelUsedFlow(userTunnel))}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{userTunnel.num}</TableCell>
                        <TableCell>
                          <Chip
                            color={userTunnel.status === 1 ? 'success' : 'danger'}
                            size="sm"
                            variant="flat"
                          >
                            {userTunnel.status === 1 ? t("m296de0e31f8c") : t("m7df5c456c765")}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <Chip
                            color={userTunnel.speedLimitName ? 'warning' : 'success'}
                            size="sm"
                            variant="flat"
                          >
                            {userTunnel.speedLimitName || t("me264d2c9faaf")}
                          </Chip>
                        </TableCell>
                        <TableCell>{userTunnel.flowResetTime === 0 ? t("m09cb21113af0") : t("m43f6165be04b", {v0: userTunnel.flowResetTime})}</TableCell>
                        <TableCell>{formatDate(userTunnel.expTime)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              isIconOnly
                              onClick={() => handleEditTunnel(userTunnel)}
                            >
                              <EditIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              color="warning"
                              isIconOnly
                              onClick={() => handleResetTunnelFlow(userTunnel)}
                              title={t("m9d2297f8b467")}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                              </svg>
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              isIconOnly
                              onClick={() => handleRemoveTunnel(userTunnel)}
                            >
                              <DeleteIcon className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button onPress={onTunnelModalClose}> {t("m3fd47edce45b")} </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 编辑隧道权限模态框 */}
      <Modal
        isOpen={isEditTunnelModalOpen}
        onClose={onEditTunnelModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
        isDismissable={false}
      >
        <ModalContent>
          <ModalHeader> {t("m1943c5e9ba36")} {editTunnelForm?.tunnelName}
          </ModalHeader>
          <ModalBody>
            {editTunnelForm && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label={t("mfa2a5242a715")}
                    type="number"
                    value={editTunnelForm.flow.toString()}
                    onChange={(e) => {
                      const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                      setEditTunnelForm(prev => prev ? { ...prev, flow: value } : null);
                    }}
                    min="1"
                    max="99999"
                  />
                  
                  <Input
                    label={t("m5ce44f1d307c")}
                    type="number"
                    value={editTunnelForm.num.toString()}
                    onChange={(e) => {
                      const value = Math.min(Math.max(Number(e.target.value) || 0, 1), 99999);
                      setEditTunnelForm(prev => prev ? { ...prev, num: value } : null);
                    }}
                    min="1"
                    max="99999"
                  />
                  
                  <Select
                    label={t("m798157fd4601")}
                    selectedKeys={editTunnelForm.speedId ? [editTunnelForm.speedId.toString()] : ['null']}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      setEditTunnelForm(prev => prev ? { ...prev, speedId: value === 'null' ? null : Number(value) } : null);
                    }}
                  >
                    {[
                      <SelectItem key="null" textValue={t("me264d2c9faaf")}>{t("me264d2c9faaf")}</SelectItem>,
                      ...editAvailableSpeedLimits.map(speedLimit => (
                        <SelectItem key={speedLimit.id.toString()} textValue={speedLimit.name}>
                          {speedLimit.name}
                        </SelectItem>
                      ))
                    ]}
                  </Select>
                  
                  <Select
                    label={t("mab5fa4fb2901")}
                    selectedKeys={[editTunnelForm.flowResetTime.toString()]}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      setEditTunnelForm(prev => prev ? { ...prev, flowResetTime: Number(value) } : null);
                    }}
                  >
                    <>
                      <SelectItem key="0" textValue={t("m09cb21113af0")}> {t("m09cb21113af0")} </SelectItem>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <SelectItem key={day.toString()} textValue={t("m2ba4797e14d3", {v0: day})}> {t("m68b21af949de")}{day}{t("mdfc2a4ecfc26")} </SelectItem>
                    ))}
                    </>
                  </Select>
                  
                  <DatePicker
                    label={t("m5192466fec83")}
                    value={editTunnelForm.expTime ? parseDate(new Date(editTunnelForm.expTime).toISOString().split('T')[0]) as any : null}
                    onChange={(date) => {
                      if (date) {
                        const jsDate = new Date(date.year, date.month - 1, date.day, 23, 59, 59);
                        setEditTunnelForm(prev => prev ? { ...prev, expTime: jsDate.getTime() } : null);
                      } else {
                        // 清空 = 永久(0)。之前这里给的是 Date.now(),等于一清空权限立刻过期,行为反了
                        setEditTunnelForm(prev => prev ? { ...prev, expTime: 0 } : null);
                      }
                    }}
                    showMonthAndYearPickers
                    className="cursor-pointer"
                  />
                </div>
                
                <RadioGroup
                  label={t("m6320b4a8722a")}
                  value={editTunnelForm.status.toString()}
                  onValueChange={(value: string) => setEditTunnelForm(prev => prev ? { ...prev, status: Number(value) } : null)}
                  orientation="horizontal"
                >
                  <Radio value="1">{t("m296de0e31f8c")}</Radio>
                  <Radio value="0">{t("m7df5c456c765")}</Radio>
                </RadioGroup>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onPress={onEditTunnelModalClose}> {t("m2cd0f3be8738")} </Button>
            <Button
              color="primary"
              onPress={handleUpdateTunnel}
              isLoading={editTunnelLoading}
            > {t("mfac2a67ad878")} </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认对话框 */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={onDeleteModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1"> {t("mceae8cfecd1b")} </ModalHeader>
          <ModalBody>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-danger-100 rounded-full flex items-center justify-center">
                <DeleteIcon className="w-6 h-6 text-danger" />
              </div>
              <div className="flex-1">
                <p className="text-foreground"> {t("m11f307ecd4e1")} <span className="font-semibold text-danger">"{userToDelete?.user}"</span> {t("m9d45d8943988")} </p>
                <p className="text-small text-default-500 mt-1"> {t("mae292a64ef1f")} </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="light" 
              onPress={onDeleteModalClose}
            > {t("m2cd0f3be8738")} </Button>
            <Button 
              color="danger" 
              onPress={handleConfirmDelete}
            > {t("ma3ea3c17b401")} </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除隧道权限确认对话框 */}
      <Modal
        isOpen={isDeleteTunnelModalOpen}
        onClose={onDeleteTunnelModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1"> {t("m845b45de33a7")} </ModalHeader>
          <ModalBody>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-danger-100 rounded-full flex items-center justify-center">
                <DeleteIcon className="w-6 h-6 text-danger" />
              </div>
              <div className="flex-1">
                <p className="text-foreground"> {t("m11f307ecd4e1")} <span className="font-semibold">{currentUser?.user}</span> {t("m9dc5de93a87e")} <span className="font-semibold text-danger">"{tunnelToDelete?.tunnelName}"</span> {t("me90c268d8aa9")} </p>
                <p className="text-small text-default-500 mt-1"> {t("m8114af8376f0")} </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="light" 
              onPress={onDeleteTunnelModalClose}
            > {t("m2cd0f3be8738")} </Button>
            <Button 
              color="danger" 
              onPress={handleConfirmRemoveTunnel}
            > {t("ma3ea3c17b401")} </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 重置流量确认对话框 */}
      <Modal
        isOpen={isResetFlowModalOpen}
        onClose={onResetFlowModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1"> {t("m1f29df3babd4")} </ModalHeader>
          <ModalBody>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-warning-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-foreground"> {t("mb903ed640fbb")} <span className="font-semibold text-warning">"{userToReset?.user}"</span> {t("md0bfb193f1f2")} </p>
                <p className="text-small text-default-500 mt-1"> {t("m1e6f9a5d6510")} </p>
                <div className="mt-2 p-2 bg-warning-50 dark:bg-warning-100/10 rounded text-xs">
                  <div className="text-warning-700 dark:text-warning-300"> {t("md51a7fd0f624")} </div>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between">
                      <span>{t("m0b6c2f353b04")}</span>
                      <span className="font-mono">{userToReset ? formatFlow(userToReset.inFlow || 0) : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("m49132ee73d23")}</span>
                      <span className="font-mono">{userToReset ? formatFlow(userToReset.outFlow || 0) : '-'}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>{t("md4da4de326b4")}</span>
                      <span className="font-mono text-warning-700 dark:text-warning-300">
                        {userToReset ? formatFlow(calculateUserTotalUsedFlow(userToReset)) : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="light" 
              onPress={onResetFlowModalClose}
            > {t("m2cd0f3be8738")} </Button>
            <Button 
              color="warning" 
              onPress={handleConfirmResetFlow}
              isLoading={resetFlowLoading}
            > {t("m96f2cb4f04d3")} </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 重置隧道流量确认对话框 */}
      <Modal
        isOpen={isResetTunnelFlowModalOpen}
        onClose={onResetTunnelFlowModalClose}
        size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1"> {t("m21bda86ba2f2")} </ModalHeader>
          <ModalBody>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-warning-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-foreground"> {t("mb903ed640fbb")} <span className="font-semibold">{currentUser?.user}</span> {t("m9dc5de93a87e")} <span className="font-semibold text-warning">"{tunnelToReset?.tunnelName}"</span> {t("md0bfb193f1f2")} </p>
                <p className="text-small text-default-500 mt-1"> {t("m1f2cfef01ba0")} </p>
                <div className="mt-2 p-2 bg-warning-50 dark:bg-warning-100/10 rounded text-xs">
                  <div className="text-warning-700 dark:text-warning-300"> {t("md51a7fd0f624")} </div>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between">
                      <span>{t("m0b6c2f353b04")}</span>
                      <span className="font-mono">{tunnelToReset ? formatFlow(tunnelToReset.inFlow || 0) : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("m49132ee73d23")}</span>
                      <span className="font-mono">{tunnelToReset ? formatFlow(tunnelToReset.outFlow || 0) : '-'}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>{t("md4da4de326b4")}</span>
                      <span className="font-mono text-warning-700 dark:text-warning-300">
                        {tunnelToReset ? formatFlow(calculateTunnelUsedFlow(tunnelToReset)) : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="light" 
              onPress={onResetTunnelFlowModalClose}
            > {t("m2cd0f3be8738")} </Button>
            <Button 
              color="warning" 
              onPress={handleConfirmResetTunnelFlow}
              isLoading={resetTunnelFlowLoading}
            > {t("m96f2cb4f04d3")} </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 订阅线路(合体面板:车友的每台机器一条订阅,直连/中转各一条) */}
      <Modal isOpen={isSubModalOpen} onClose={onSubModalClose} size="2xl" backdrop="blur" placement="center">
        <ModalContent>
          <ModalHeader>🔗 {subUserName} {t("m717e62231ccc")}{subLines.length})</ModalHeader>
          <ModalBody className="space-y-3">
            <div className="text-small text-default-500"> {t("m804a837fa7b4")} </div>

            {subAllToken && subLines.length > 1 && (
              <div className="border border-primary/40 bg-primary/5 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Chip size="sm" color="primary" variant="flat">{t("m385a5053e4c5")}</Chip>
                  <span className="text-sm">{t("m17b2a340819a")}</span>
                  <Chip size="sm" variant="flat">
                    {subLines.reduce((n: number, l: any) => n + (l.protocolCount || 0), 0)} {t("mab2f31f30acf")} </Chip>
                </div>
                <Input
                  readOnly
                  size="sm"
                  value={subUrl(subAllToken)}
                  onClick={(e: any) => { if (e.target?.select) e.target.select(); }}
                />
                <div className="flex gap-2 items-start">
                  <Button
                    size="sm"
                    color="primary"
                    onPress={async () => {
                      (await copyTextToClipboard(subUrl(subAllToken)))
                        ? toast.success(t("md9075977a22d"))
                        : toast.error(t("md9c9f3be73c7"));
                    }}
                  > {t("meff3012bf5ac")} </Button>
                  <SubQrToggle url={subUrl(subAllToken)} />
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={async () => {
                      (await copyTextToClipboard(clashUrl(subAllToken)))
                        ? toast.success(t("m235f4fde5715"))
                        : toast.error(t("m753d8bb0da99"));
                    }}
                  > {t("ma99acde2dd41")} </Button>
                </div>
                <div className="text-tiny text-default-400"> {t("m50aa6846d00c")} </div>
              </div>
            )}
            {subLines.map((ln: any, idx: number) => {
              const url = subUrl(ln.subToken);
              const isRelay = ln.type === 'relay';
              return (
                <div key={idx} className="border border-default-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Chip size="sm" variant="flat" color={isRelay ? 'warning' : 'primary'}>
                      {isRelay ? t("m7e92caa8ec8c", {v0: ln.landingName ? '→' + ln.landingName : ''}) : t("m01d28f2c903a")}
                    </Chip>
                    <span className="font-medium truncate">{ln.nodeName}</span>
                    <Chip size="sm" variant="flat">{ln.protocolCount} {t("mab2f31f30acf")}</Chip>
                    {ln.lineStatus === 0 && (
                      <Chip size="sm" variant="flat" color="danger">{t("ma8c3698b5b8c")}</Chip>
                    )}
                  </div>
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
                          ? toast.success(t("m0139dc2a2677"))
                          : toast.error(t("md9c9f3be73c7"));
                      }}
                    > {t("meff3012bf5ac")} </Button>
                    <SubQrToggle url={url} />
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={async () => {
                        (await copyTextToClipboard(clashUrl(ln.subToken)))
                          ? toast.success(t("m235f4fde5715"))
                          : toast.error(t("m753d8bb0da99"));
                      }}
                    > {t("md5889087ef18")} </Button>
                    <div className="flex-1" />
                    {/* 收回这条线路的入口。停用是可逆的:UUID 和端口都留着,
                        恢复之后对方手上的订阅原样能用;删除会把端口也释放掉,
                        以后要再给他用就得重新分配、重新发链接。 */}
                    {/* 续费:改额度/到期,不动 UUID 和端口 —— 车友不用重导订阅。
                        这一页的线路行本身就在弹窗里,再套一层 Modal 很别扭,
                        所以沿用这个文件已有的 confirm/prompt 风格。
                        要连限速一起改,用客户端「车友」页那个完整表单。 */}
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={async () => {
                        if (subUserId == null) return;
                        const curFlow = ln.quotaGb ?? 0;
                        const fRaw = prompt(t("m2bbcd3729b93", {v0: ln.nodeName}), String(curFlow));
                        if (fRaw === null) return;
                        const flow = Number(fRaw);
                        if (!(flow >= 0)) { toast.error(t("mfb26c23a5691")); return; }
                        const leftDays = ln.lineExpTime ? Math.max(0, Math.ceil((ln.lineExpTime - Date.now()) / 86400000)) : 0;
                        const dRaw = prompt(t("m649c116182d1"), String(leftDays));
                        if (dRaw === null) return;
                        const days = Number(dRaw);
                        if (!(days >= 0)) { toast.error(t("md15f691a6741")); return; }
                        const res = await updateLine(subUserId, ln.nodeId, ln.landingId ?? null, {
                          flow, expTime: days > 0 ? Date.now() + days * 86400000 : 0,
                        });
                        if (res.code === 0) {
                          // 后端会顺带判断改完还该不该停,如实转述 —— 别让人以为续了就一定活了
                          const d: any = res.data || {};
                          if (d.status === 0) toast.error(t("mefe1a47532f0", {v0: d.reason || '未达到恢复条件'}));
                          else toast.success(d.resumed ? t("md98a7932d9d4") : t("m58ccc33720f8"));
                          await reloadSubLines(subUserId);
                        } else {
                          toast.error(res.msg || t("m251c5eb150c3"));
                        }
                      }}
                    > {t("m5f663f70a3f0")} </Button>
                    <Button
                      size="sm"
                      variant="flat"
                      color={ln.lineStatus === 0 ? 'success' : 'warning'}
                      onPress={async () => {
                        if (subUserId == null) return;
                        const to = ln.lineStatus === 0 ? 1 : 0;
                        if (to === 0 && !confirm(t("ma6b2083ddee3", {v0: ln.nodeName}))) return;
                        const res = await setLineStatus(subUserId, ln.nodeId, ln.landingId ?? null, to);
                        if (res.code === 0) {
                          toast.success(to === 0 ? t("m624d4fac2317") : t("m28f40792270d"));
                          await reloadSubLines(subUserId);
                        } else {
                          toast.error(res.msg || t("m0c3b4cf7aa25"));
                        }
                      }}
                    >
                      {ln.lineStatus === 0 ? t("me0534b8a4e46") : t("m4e6fd0e28c55")}
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={async () => {
                        if (subUserId == null) return;
                        if (!confirm(t("m674ec9cb198a", {v0: ln.nodeName, v1: ln.protocolCount}))) return;
                        const res = await deleteLine(subUserId, ln.nodeId, ln.landingId ?? null);
                        if (res.code === 0) {
                          toast.success(t("m40dbe1145b15"));
                          await reloadSubLines(subUserId);
                        } else {
                          toast.error(res.msg || t("mc228558cf257"));
                        }
                      }}
                    > {t("m2f9daa828907")} </Button>
                  </div>
                </div>
              );
            })}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onSubModalClose}>{t("m3fd47edce45b")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      </div>

  );
}
