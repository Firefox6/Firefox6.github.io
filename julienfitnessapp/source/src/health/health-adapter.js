const browserReason = "browser";
const plugins = () => window.Capacitor?.Plugins ?? {};

/** Keeps Capacitor calls at the adapter boundary. Views only receive product states. */
export const healthAdapter = {
  async getStatus() {
    const { HealthConnect } = plugins();
    if (!HealthConnect) return { available: false, grantedGroups: [], reason: browserReason };
    try { return await HealthConnect.getStatus(); }
    catch (error) { return { available: false, grantedGroups: [], reason: error?.code || "HEALTH_CONNECT_UNAVAILABLE" }; }
  },
  async requestPermissions(groups, requestHistoryAccess = false) {
    const { HealthConnect } = plugins();
    if (!HealthConnect) return { grantedGroups: [], historyGranted: false, reason: browserReason };
    try {
      return await HealthConnect.requestPermissions({ groups, requestHistoryAccess, requestBackgroundAccess: false });
    } catch (error) {
      return { grantedGroups: [], historyGranted: false, reason: error?.code || "HEALTH_PERMISSION_INVALID" };
    }
  },
  async openPermissionSettings() {
    const { HealthConnect } = plugins();
    if (!HealthConnect) return { opened: false, reason: browserReason };
    try { await HealthConnect.openPermissionSettings(); return { opened: true }; }
    catch (error) { return { opened: false, reason: error?.code || "HEALTH_CONNECT_UNAVAILABLE" }; }
  },
  async synchronize() {
    const status = await this.getStatus();
    if (!status.available) return { updated: false, status };
    // The supplied bridge currently exposes permissions/status but no record reader.
    return { updated: false, status, reason: "RECORD_READER_NOT_AVAILABLE" };
  },
  async getDailyData(_range) {
    throw new Error("RECORD_READER_NOT_AVAILABLE");
  },
  async getSleepSessions(_range) {
    throw new Error("RECORD_READER_NOT_AVAILABLE");
  },
  async getWorkouts(_range) {
    throw new Error("RECORD_READER_NOT_AVAILABLE");
  }
};
