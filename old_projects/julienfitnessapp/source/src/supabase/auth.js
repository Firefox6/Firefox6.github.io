import { SUPABASE_CONFIG } from "./config.js";

const SESSION_KEY = "auth:session";
const plugins = () => window.Capacitor?.Plugins ?? {};

async function sessionStorage() {
  const { SecureStorage } = plugins();
  if (SecureStorage) {
    return {
      async get() { const { value } = await SecureStorage.get({ key: SESSION_KEY }); return value; },
      async set(value) { await SecureStorage.set({ key: SESSION_KEY, value }); },
      async remove() { await SecureStorage.remove({ key: SESSION_KEY }); }
    };
  }
  return {
    async get() { return localStorage.getItem(SESSION_KEY); },
    async set(value) { localStorage.setItem(SESSION_KEY, value); },
    async remove() { localStorage.removeItem(SESSION_KEY); }
  };
}

function assertConfigured() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.publishableKey) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
}

export const authService = {
  async restoreSession() {
    const store = await sessionStorage();
    const raw = await store.get();
    return raw ? JSON.parse(raw) : null;
  },
  async signInWithPassword(email, password) {
    assertConfigured();
    const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_CONFIG.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error_code || payload.error || "AUTH_FAILED");
    await (await sessionStorage()).set(JSON.stringify(payload));
    return payload;
  },
  async signOut() {
    const session = await this.restoreSession();
    if (session?.access_token && SUPABASE_CONFIG.url) {
      await fetch(`${SUPABASE_CONFIG.url}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_CONFIG.publishableKey, Authorization: `Bearer ${session.access_token}` }
      }).catch(() => {});
    }
    await (await sessionStorage()).remove();
  }
};
