import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { useState, useEffect } from 'react';
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { useNavigate } from 'react-router-dom';
import toast from '@/utils/toast';
import { reinitializeBaseURL } from '@/api/network';
import { 
  getPanelAddresses, 
  savePanelAddress, 
  setCurrentPanelAddress, 
  deletePanelAddress, 
  validatePanelAddress,
} from '@/utils/panel';

interface PanelAddress {
  name: string;
  address: string;   
  inx: boolean;
}


export const SettingsPage = () => {
  useTranslation();
  const navigate = useNavigate();
  const [panelAddresses, setPanelAddresses] = useState<PanelAddress[]>([]);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');


  const setPanelAddressesFunc = (newAddress: PanelAddress[]) => {
    setPanelAddresses(newAddress); 
  }

  // 加载面板地址列表
  const loadPanelAddresses = async () => {
    (window as any).setPanelAddresses = setPanelAddressesFunc
    getPanelAddresses();
  };

  // 添加新面板地址
  const addPanelAddress = async () => {
    if (!newName.trim() || !newAddress.trim()) {
      toast.error(t("mc73c996345f5"));
      return;
    }

    // 验证地址格式
    if (!validatePanelAddress(newAddress.trim())) {
      toast.error(t("m230bc2cabf6f"));
      return;
    }
    (window as any).setPanelAddresses = setPanelAddressesFunc
    savePanelAddress(newName.trim(), newAddress.trim());
    setNewName('');
    setNewAddress('');
    toast.success(t("mee1a3c93ab01"));
  };

  // 设置当前面板地址
  const setCurrentPanel = async (name: string) => {
    (window as any).setPanelAddresses = setPanelAddressesFunc
    setCurrentPanelAddress(name);
    reinitializeBaseURL();
  };

  // 删除面板地址
  const handleDeletePanelAddress = async (name: string) => {
    (window as any).setPanelAddresses = setPanelAddressesFunc
    deletePanelAddress(name);
    reinitializeBaseURL();
    toast.success(t("m5223f91b9670"));
  };

  // 页面加载时获取数据
  useEffect(() => {
    loadPanelAddresses();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* 顶部导航 */}
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              isIconOnly
              variant="light"
              onClick={() => navigate(-1)}
              className="text-gray-600 dark:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t("m92312a8331ec")}</h1>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* 添加新地址 */}
          <Card className="border border-gray-200 dark:border-gray-700">
            <CardBody className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t("m2ae71130ed25")}</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={t("md44e9b3d3b31")}
                    placeholder={t("m798efed72936")}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <Input
                    label={t("m37aac5b4e639")}
                    placeholder="http://192.168.1.100:3000"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                </div>
                <Button color="primary" onClick={addPanelAddress}> {t("m7a8a11ead507")} </Button>
              </div>
            </CardBody>
          </Card>

          {/* 地址列表 */}
          <Card className="border border-gray-200 dark:border-gray-700">
            <CardBody className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t("m45ccf62588f4")}</h2>
              {panelAddresses.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t("m8c8eaa3270d2")}</p>
              ) : (
                <div className="space-y-3">
                  {panelAddresses.map((panel, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{panel.name}</span>
                            {panel.inx && (
                              <span className="px-2 py-1 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 text-xs rounded"> {t("mcb62ebd689ee")} </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{panel.address}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!panel.inx && (
                            <Button
                              size="sm"
                              color="primary"
                              variant="flat"
                              onClick={() => setCurrentPanel(panel.name)}
                            > {t("m21c86745003a")} </Button>
                          )}
                          <Button
                            size="sm"
                            color="danger"
                            variant="light"
                            onClick={() => handleDeletePanelAddress(panel.name)}
                          > {t("m2f9daa828907")} </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};
