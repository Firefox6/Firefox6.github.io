const getPlugins = () => window.Capacitor?.Plugins ?? {};

export const platformAdapter = {
  isNative() {
    return window.Capacitor?.isNativePlatform?.() === true;
  },
  async getShellInformation() {
    const { AppShell } = getPlugins();
    if (!AppShell) return { platform: "browser", shellVersion: null, bridgeVersion: null };
    try { return await AppShell.getInformation(); }
    catch (error) { return { platform: "android", error: error?.code || "SHELL_UNAVAILABLE" }; }
  },
  async getCapabilities() {
    const { AppShell } = getPlugins();
    if (!AppShell) return { healthConnect: false, secureStorage: false, webAssetUpdates: false };
    try { return await AppShell.getCapabilities(); }
    catch { return { healthConnect: false, secureStorage: false, webAssetUpdates: false }; }
  },
  async getUpdateState() {
    const { AppShell } = getPlugins();
    if (!AppShell) return null;
    try { return await AppShell.getUpdateState(); } catch { return null; }
  }
};
