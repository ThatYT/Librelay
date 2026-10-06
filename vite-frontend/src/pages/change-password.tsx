import { useTranslation } from "react-i18next";
import { t } from "@/i18n";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from '@/utils/toast';

import { title } from "@/components/primitives";
import { updatePassword } from "@/api";
import DefaultLayout from "@/layouts/default";
import { safeLogout } from "@/utils/logout";

interface PasswordForm {
  newUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ChangePasswordPage() {
  useTranslation();
  const [form, setForm] = useState<PasswordForm>({
    newUsername: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<PasswordForm>>({});
  const navigate = useNavigate();

  const validateForm = (): boolean => {
    const newErrors: Partial<PasswordForm> = {};

    if (!form.newUsername.trim()) {
      newErrors.newUsername = t("m12fdbbcc066a");
    } else if (form.newUsername.length < 3) {
      newErrors.newUsername = t("md0931223450f");
    } else if (form.newUsername.length > 20) {
      newErrors.newUsername = t("m2a2d69600058");
    }

    if (!form.currentPassword.trim()) {
      newErrors.currentPassword = t("mf1790d3384d0");
    }

    if (!form.newPassword.trim()) {
      newErrors.newPassword = t("mba3c8c79cda3");
    } else if (form.newPassword.length < 6) {
      newErrors.newPassword = t("m305e75f814f9");
    } else if (form.newPassword.length > 20) {
      newErrors.newPassword = t("m08613c003267");
    }

    if (!form.confirmPassword.trim()) {
      newErrors.confirmPassword = t("m322ded8bb2cc");
    } else if (form.confirmPassword !== form.newPassword) {
      newErrors.confirmPassword = t("mcf385c568f54");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof PasswordForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await updatePassword(form);
      
      if (response.code === 0) {
        toast.success(response.msg || t("m0193059b6d37"));
        
        // 使用 toast 确认对话框的替代方案
        setTimeout(() => {
          toast.success(t("m23ec13ba85a8"));
          setTimeout(() => {
            logout();
          }, 1000);
        }, 1000);
      } else {
        toast.error(response.msg || t("mbcd609719a75"));
      }
    } catch (error) {
      console.error(t("m5dd4dcf2ad31"), error);
      toast.error(t("mebdd051866e1"));
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    safeLogout();
    navigate('/');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit();
    }
  };

  return (
    <DefaultLayout>
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10 min-h-[calc(100dvh-200px)]">
        <div className="w-full max-w-lg">
          <Card className="w-full">
            <CardHeader className="pb-0 pt-6 px-6 flex-col items-center">
              <div className="w-12 h-12 bg-warning-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-warning-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              
              <h1 className={title({ size: "sm" })}>{t("m81f380dc9a42")}</h1>
              <p className="text-small text-default-500 mt-2 text-center">{t("m4c6d2bf1e213")}</p>
            </CardHeader>
            
            <CardBody className="px-6 py-6">
              <div className="flex flex-col gap-4">
                <Input
                  label={t("m0ccf18acc1c8")}
                  placeholder={t("me12c044dc03e")}
                  value={form.newUsername}
                  onChange={(e) => handleInputChange('newUsername', e.target.value)}
                  onKeyDown={handleKeyPress}
                  variant="bordered"
                  isDisabled={loading}
                  isInvalid={!!errors.newUsername}
                  errorMessage={errors.newUsername}
                />
                
                <Input
                  label={t("ma114cfb687e6")}
                  placeholder={t("mf1790d3384d0")}
                  type="password"
                  value={form.currentPassword}
                  onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                  onKeyDown={handleKeyPress}
                  variant="bordered"
                  isDisabled={loading}
                  isInvalid={!!errors.currentPassword}
                  errorMessage={errors.currentPassword}
                />
                
                <Input
                  label={t("m515e9c7cf7b2")}
                  placeholder={t("medef5df61d32")}
                  type="password"
                  value={form.newPassword}
                  onChange={(e) => handleInputChange('newPassword', e.target.value)}
                  onKeyDown={handleKeyPress}
                  variant="bordered"
                  isDisabled={loading}
                  isInvalid={!!errors.newPassword}
                  errorMessage={errors.newPassword}
                />
                
                <Input
                  label={t("m6fde05a916c6")}
                  placeholder={t("m322ded8bb2cc")}
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  onKeyDown={handleKeyPress}
                  variant="bordered"
                  isDisabled={loading}
                  isInvalid={!!errors.confirmPassword}
                  errorMessage={errors.confirmPassword}
                />
                
                <Button
                  color="warning"
                  size="lg"
                  onClick={handleSubmit}
                  isLoading={loading}
                  disabled={loading}
                  className="mt-2"
                >
                  {loading ? t("me91c0876ead6") : t("ma6587d5b4a9d")}
                </Button>
                
                <div className="bg-warning-50 border border-warning-200 text-warning-700 px-3 py-2 rounded-lg text-sm text-center"> {t("mcfb3218f0b33")} </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>
    </DefaultLayout>
  );
}
