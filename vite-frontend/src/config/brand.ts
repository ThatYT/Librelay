/** Keep custom panel names while upgrading the original default branding. */
export const APP_NAME = "Librelay";
export const panelName = (value: string | null | undefined): string =>
  !value || value === "TMS" ? APP_NAME : value;
