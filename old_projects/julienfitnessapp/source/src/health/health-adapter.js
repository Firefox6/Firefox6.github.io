const browserReason = "browser";
const plugins = () => window.Capacitor?.Plugins ?? {};
const currentRange = (days = 35) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const format = (date) => date.toISOString().slice(0, 10);
  return { startDate: format(start), endDate: format(end), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich" };
};

async function read(plugin, method, range) {
  if (typeof plugin?.[method] !== "function") throw new Error("RECORD_READER_NOT_AVAILABLE");
  return plugin[method](range);
}

async function readOptional(plugin, method, range) {
  try { return { value: await read(plugin, method, range), error: null }; }
  catch (error) { return { value: null, error: error?.code || error?.message || "HEALTH_SYNC_FAILED" }; }
}

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
  async synchronize({ days = 35 } = {}) {
    const status = await this.getStatus();
    if (!status.available) return { updated: false, status };
    const { HealthConnect } = plugins();
    const range = currentRange(Math.min(Math.max(days, 7), 366));
    try {
      const [dailyRead, sleepRead, recoveryRead, workoutsRead, weightRead] = await Promise.all([
        readOptional(HealthConnect, "getDailyData", range),
        readOptional(HealthConnect, "getSleepSessions", range),
        readOptional(HealthConnect, "getRecoveryMeasurements", range),
        readOptional(HealthConnect, "getWorkouts", range),
        readOptional(HealthConnect, "getWeightRecords", range)
      ]);
      const reads = [dailyRead, sleepRead, recoveryRead, workoutsRead, weightRead];
      if (!reads.some((item) => item.value)) return { updated: false, status, reason: reads.find((item) => item.error)?.error || "HEALTH_SYNC_FAILED" };
      return {
        updated: true,
        status,
        range,
        daily: dailyRead.value || { days: [], missingGroups: ["activity"] },
        sleep: sleepRead.value || { sessions: [], missingGroups: ["sleep"] },
        recovery: recoveryRead.value || { hrvRmssd: [], restingHeartRate: [], missingGroups: ["recovery"] },
        workoutData: workoutsRead.value || { workouts: [], missingGroups: ["workouts"] },
        weight: weightRead.value || { records: [], missingGroups: ["weight"] },
        partialErrors: reads.flatMap((item) => item.error ? [item.error] : [])
      };
    } catch (error) {
      return { updated: false, status, reason: error?.code || error?.message || "HEALTH_SYNC_FAILED" };
    }
  },
  async getDailyData(_range) {
    const { HealthConnect } = plugins();
    return read(HealthConnect, "getDailyData", _range);
  },
  async getSleepSessions(_range) {
    const { HealthConnect } = plugins();
    return read(HealthConnect, "getSleepSessions", _range);
  },
  async getWorkouts(_range) {
    const { HealthConnect } = plugins();
    return read(HealthConnect, "getWorkouts", _range);
  }
};
