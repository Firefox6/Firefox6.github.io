import { getSupabaseClient } from "./supabase-client.js";

const DEFAULT_STATUS = Object.freeze({
  connected: false,
  status: "disconnected",
  pending: 0,
  processing: 0,
  failed: 0,
  synced: 0,
});

let mutationSyncTimer = null;

export async function getGoogleHealthStatus() {
  return invoke("google-health-status", {});
}

export async function startGoogleHealthConnection() {
  const returnUrl = new URL(window.location.href);
  returnUrl.searchParams.delete("google_health");
  returnUrl.hash = "";
  const result = await invoke("google-health-oauth-start", {
    timezone: resolvedTimezone(),
    return_url: returnUrl.toString(),
  });
  if (!result?.authorization_url) throw new Error("Google-Autorisierungslink fehlt.");
  window.location.assign(result.authorization_url);
}

export async function syncGoogleHealthNow({ retryFailed = false } = {}) {
  return invoke("google-health-sync-now", { retry_failed: retryFailed });
}

export async function disconnectGoogleHealth({ deleteGoogleData = false } = {}) {
  return invoke("google-health-disconnect", { delete_google_data: deleteGoogleData });
}

export function queueGoogleHealthSync() {
  clearTimeout(mutationSyncTimer);
  mutationSyncTimer = setTimeout(() => {
    mutationSyncTimer = null;
    syncGoogleHealthNow().catch(() => {
      // Database triggers have already persisted the outbox job. The scheduled
      // worker will retry it even when this best-effort immediate call fails.
    });
  }, 500);
}

export function consumeGoogleHealthReturnStatus() {
  const url = new URL(window.location.href);
  const status = url.searchParams.get("google_health");
  if (!status) return null;
  url.searchParams.delete("google_health");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  return status;
}

export function emptyGoogleHealthStatus() {
  return { ...DEFAULT_STATUS };
}

async function invoke(functionName, body) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke(functionName, { body });
  if (error) {
    let message = error.message || "Google-Health-Anfrage fehlgeschlagen.";
    try {
      const responseBody = await error.context?.json?.();
      if (responseBody?.error) message = responseBody.error;
    } catch {
      // The generic message remains useful if the response was not JSON.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function resolvedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich";
  } catch {
    return "Europe/Zurich";
  }
}

