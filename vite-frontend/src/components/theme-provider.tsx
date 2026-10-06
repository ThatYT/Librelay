import React, { useEffect } from 'react';
import { applySkin, savedSkin } from '@/config/skins';

interface ThemeProviderProps {
  children: React.ReactNode;
}

// Apply the persisted neutral Light/Dark theme.
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  useEffect(() => {
    applySkin(savedSkin().id);
  }, []);

  return <>{children}</>;
};
