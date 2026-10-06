import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/select";
import toast from '@/utils/toast';
import { updateConfigs } from '@/api';
import { SettingsIcon } from '@/components/icons';

import { isAdmin } from '@/utils/auth';
import { getCachedConfigs, clearConfigCache, updateSiteConfig } from '@/config/site';

// 简单的保存图标组件
const SaveIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17,21 17,13 7,13 7,21" />
    <polyline points="7,3 7,8 15,8" />
  </svg>
);

interface ConfigItem {
  key: string;
  label: string;
  placeholder?: string;
  description?: string;
  type: 'input' | 'switch' | 'select';
  options?: { label: string; value: string; description?: string }[];
  dependsOn?: string; // 依赖的配置项key
  dependsValue?: string; // 依赖的配置项值
}

// 网站配置项定义
const CONFIG_ITEMS: ConfigItem[] = [
  {
    key: 'ip',
    get label() { return t("mc9dc5f2cb409"); },
    get placeholder() { return t("mdccaacef689c"); },
    get description() { return t("m67b36ffcd2a8"); },
    type: 'input'
  },
  {
    key: 'app_name',
    get label() { return t("me4569e38b854"); },
    get placeholder() { return t("m54481c3bc581"); },
    get description() { return t("me289e9c45567"); },
    type: 'input'
  },
  {
    key: 'captcha_enabled',
    get label() { return t("me490fa85ce8e"); },
    get description() { return t("m82189d5ae861"); },
    type: 'switch'
  },
  {
    key: 'captcha_type',
    get label() { return t("m7c4c99dd3407"); },
    get description() { return t("m95a8f22f754e"); },
    type: 'select',
    dependsOn: 'captcha_enabled',
    dependsValue: 'true',
    options: [
      { 
        get label() { return t("m6dc87ca3b101"); },
        value: 'RANDOM', 
        get description() { return t("m6097227993b1"); }
      },
      { 
        get label() { return t("mbab844fbc50d"); },
        value: 'SLIDER', 
        get description() { return t("m8f70232ffdf1"); }
      },
      { 
        get label() { return t("mc022693f8c7e"); },
        value: 'WORD_IMAGE_CLICK', 
        get description() { return t("m961a299ef254"); }
      },
      { 
        get label() { return t("m44d2ed4e795b"); },
        value: 'ROTATE', 
        get description() { return t("m453050df9af0"); }
      },
      { 
        get label() { return t("m46f39eb6726e"); },
        value: 'CONCAT', 
        get description() { return t("m9616a2989f5d"); }
      }
    ]
  }
];

// 初始化时从缓存读取配置，避免闪烁
const getInitialConfigs = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  
  const configKeys = ['app_name', 'captcha_enabled', 'captcha_type', 'ip'];
  const initialConfigs: Record<string, string> = {};
  
  try {
    configKeys.forEach(key => {
      const cachedValue = localStorage.getItem('vite_config_' + key);
      if (cachedValue) {
        initialConfigs[key] = cachedValue;
      }
    });
  } catch (error) {
  }
  
  return initialConfigs;
};

export default function ConfigPage() {
  useTranslation();
  const navigate = useNavigate();
  const initialConfigs = getInitialConfigs();
  const [configs, setConfigs] = useState<Record<string, string>>(initialConfigs);
  const [loading, setLoading] = useState(Object.keys(initialConfigs).length === 0); // 如果有缓存数据，不显示loading
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfigs, setOriginalConfigs] = useState<Record<string, string>>(initialConfigs);

  // 权限检查
  useEffect(() => {
    if (!isAdmin()) {
      toast.error(t("ma7c41f1105ef"));
      navigate('/dashboard', { replace: true });
      return;
    }
  }, [navigate]);

  // 加载配置数据（优先从缓存）
  const loadConfigs = async (currentConfigs?: Record<string, string>) => {
    const configsToCompare = currentConfigs || configs;
    const hasInitialData = Object.keys(configsToCompare).length > 0;
    
    // 如果已有缓存数据，不显示loading，静默更新
    if (!hasInitialData) {
      setLoading(true);
    }
    
    try {
      const configData = await getCachedConfigs();
      
      // 只有在数据有变化时才更新
      const hasDataChanged = JSON.stringify(configData) !== JSON.stringify(configsToCompare);
      if (hasDataChanged) {
        setConfigs(configData);
        setOriginalConfigs({ ...configData });
        setHasChanges(false);
      } else {
      }
    } catch (error) {
      // 只有在没有缓存数据时才显示错误
      if (!hasInitialData) {
        toast.error(t("m6b7651e280e3"));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 延迟加载，避免阻塞初始渲染
    const timer = setTimeout(() => {
      loadConfigs(initialConfigs);
    }, 100);

    return () => clearTimeout(timer);
  }, []); // 只在组件挂载时执行一次

  // 处理配置项变更
  const handleConfigChange = (key: string, value: string) => {
    let newConfigs = { ...configs, [key]: value };
    
    // 特殊处理：启用验证码时，如果验证码类型未设置，默认为随机
    if (key === 'captcha_enabled' && value === 'true') {
      if (!newConfigs.captcha_type) {
        newConfigs.captcha_type = 'RANDOM';
      }
    }
    
    setConfigs(newConfigs);
    
    // 检查是否有变更
    const hasChangesNow = Object.keys(newConfigs).some(
      k => newConfigs[k] !== originalConfigs[k]
    ) || Object.keys(originalConfigs).some(
      k => originalConfigs[k] !== newConfigs[k]
    );
    setHasChanges(hasChangesNow);
  };

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await updateConfigs(configs);
      if (response.code === 0) {
        toast.success(t("m9bf71a347b49"));
        
        // 清除所有配置缓存，强制下次重新获取
        clearConfigCache();
        
        // 获取变更的配置项
        const changedKeys = Object.keys(configs).filter(
          key => configs[key] !== originalConfigs[key]
        );
        
        setOriginalConfigs({ ...configs });
        setHasChanges(false);
        
        // 如果应用名称发生变化，立即更新网站配置
        if (changedKeys.includes('app_name')) {
          await updateSiteConfig();
        }
        
        // 触发配置更新事件，通知其他组件
        window.dispatchEvent(new CustomEvent('configUpdated', { 
          detail: { changedKeys } 
        }));
      } else {
        toast.error(t("meb777ddb828a") + response.msg);
      }
    } catch (error) {
      toast.error(t("m7f7164b67cee"));
    } finally {
      setSaving(false);
    }
  };



  // 检查配置项是否应该显示（依赖检查）
  const shouldShowItem = (item: ConfigItem): boolean => {
    if (!item.dependsOn || !item.dependsValue) {
      return true;
    }
    return configs[item.dependsOn] === item.dependsValue;
  };

  // 渲染不同类型的配置项
  const renderConfigItem = (item: ConfigItem) => {
    const isChanged = hasChanges && configs[item.key] !== originalConfigs[item.key];
    
    switch (item.type) {
      case 'input':
        return (
          <Input
            value={configs[item.key] || ''}
            onChange={(e) => handleConfigChange(item.key, e.target.value)}
            placeholder={item.placeholder}
            variant="bordered"
            size="md"
            classNames={{
              input: "text-sm",
              inputWrapper: isChanged 
                ? "border-warning-300 data-[hover=true]:border-warning-400" 
                : ""
            }}
          />
        );

      case 'switch':
        return (
          <Switch
            isSelected={configs[item.key] === 'true'}
            onValueChange={(checked) => handleConfigChange(item.key, checked ? 'true' : 'false')}
            color="primary"
            size="md"
            classNames={{
              wrapper: isChanged ? "border-warning-300" : ""
            }}
          >
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {configs[item.key] === 'true' ? t("mdfb802238b38") : t("mbc5a87a757a5")}
            </span>
          </Switch>
        );

      case 'select':
        return (
          <Select
            selectedKeys={configs[item.key] ? [configs[item.key]] : []}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              if (selectedKey) {
                handleConfigChange(item.key, selectedKey);
              }
            }}
            placeholder={t("me6f1e025ff46")}
            variant="bordered"
            size="md"
            classNames={{
              trigger: isChanged 
                ? "border-warning-300 data-[hover=true]:border-warning-400" 
                : ""
            }}
          >
            {item.options?.map((option) => (
              <SelectItem 
                key={option.value}
                description={option.description}
              >
                {option.label}
              </SelectItem>
            )) || []}
          </Select>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner size="lg" label={t("me91619c7f703")} />
        </div>
      
    );
  }

  return (
    
      <div className="p-6 max-w-4xl mx-auto">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t("m0910d1f1e847")}</h1>
            <p className="text-gray-600 dark:text-gray-400"> {t("me73e963637dc")} </p>
          </div>
        </div>

        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center w-full">
              <div>
                <h2 className="text-xl font-semibold">{t("mf3f905f2853a")}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400"> {t("mb9f830b9af27")} </p>
              </div>
              <div className="flex gap-2">

                <Button
                  color="primary"
                  startContent={<SaveIcon className="w-4 h-4" />}
                  onClick={handleSave}
                  isLoading={saving}
                  disabled={!hasChanges}
                >
                  {saving ? t("m917b1c1f18d0") : t("m6e584e3d5ce6")}
                </Button>
              </div>
            </div>
          </CardHeader>

          <Divider />

          <CardBody className="space-y-6 pt-6">
            {CONFIG_ITEMS.map((item, index) => {
              // 检查配置项是否应该显示
              if (!shouldShowItem(item)) {
                return null;
              }

              // 计算是否是最后一个显示的项目（用于决定是否显示分隔线）
              const remainingItems = CONFIG_ITEMS.slice(index + 1).filter(shouldShowItem);
              const isLastItem = remainingItems.length === 0;

              return (
                <div key={item.key} className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {item.label}
                    </label>
                    {item.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.description}
                      </p>
                    )}
                  </div>
                  
                  {/* 渲染配置项 */}
                  {renderConfigItem(item)}
                  
                  {/* 分隔线 */}
                  {!isLastItem && (
                    <Divider className="mt-6" />
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>

        {/* 操作提示 */}
        {hasChanges && (
          <Card className="mt-4 bg-warning-50 dark:bg-warning-900/20 border-warning-200 dark:border-warning-800">
            <CardBody className="py-3">
              <div className="flex items-center gap-2 text-warning-700 dark:text-warning-300">
                <div className="w-2 h-2 bg-warning-500 rounded-full animate-pulse" />
                <span className="text-sm"> {t("m7bf7d54ce664")} </span>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    
  );
}
