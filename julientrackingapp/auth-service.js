import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

let authSubscription = null;
let authState = {
  status: "unauthenticated",
  user: null,
  error: null,
};

export async function initializeAuth(onChange) {
  if (!isSupabaseConfigured()) {
    authState = {
      status: "unavailable",
      user: null,
      error: "Die Cloud-Verbindung ist noch nicht eingerichtet.",
    };
    await onChange?.(authState, { type: "initial" });
    return authState;
  }

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    authState = stateFromSession(data.session);
    await onChange?.(authState, { type: "initial" });

    if (!authSubscription) {
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        authState = stateFromSession(session);
        Promise.resolve(onChange?.(authState, { type: event })).catch(() => {
          // The consumer presents cloud errors in the app UI; an auth listener
          // must never create an unhandled rejected promise.
        });
      });
      authSubscription = listener.subscription;
    }
  } catch (error) {
    authState = {
      status: "error",
      user: null,
      error: authErrorMessage(error),
    };
    await onChange?.(authState, { type: "initial" });
  }

  return authState;
}

export function getAuthState() {
  return authState;
}

export async function loginWithPassword(email, password) {
  if (!email || !password) throw new Error("Bitte E-Mail und Passwort eingeben.");
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorMessage(error));
  authState = stateFromSession(data.session);
  return authState;
}

export async function logout() {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error(authErrorMessage(error));
  authState = { status: "unauthenticated", user: null, error: null };
  return authState;
}

export async function getCurrentUser() {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(authErrorMessage(error));
  return data.user || null;
}

export async function testCloudConnection() {
  const client = await getSupabaseClient();
  const results = await Promise.all([
    client.from("weight_measurements").select("id", { head: true, count: "exact" }).limit(1),
    client.from("app_settings").select("user_id", { head: true, count: "exact" }).limit(1),
    client.from("food_entries").select("id", { head: true, count: "exact" }).limit(1),
    client.from("food_presets").select("id", { head: true, count: "exact" }).limit(1),
    client.from("app_metadata").select("key", { head: true, count: "exact" }).limit(1),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(authErrorMessage(error));
  return true;
}

function stateFromSession(session) {
  return session?.user
    ? { status: "authenticated", user: session.user, error: null }
    : { status: "unauthenticated", user: null, error: null };
}

function authErrorMessage(error) {
  const message = error?.message || "Cloud-Verbindung fehlgeschlagen.";
  if (/invalid login credentials/i.test(message)) return "E-Mail oder Passwort ist nicht korrekt.";
  if (/email not confirmed/i.test(message)) return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  return message;
}
