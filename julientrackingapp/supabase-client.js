// Public project configuration. Never place a secret or service-role key in
// this PWA; the publishable key identifies the project, not the user.
const SUPABASE_URL = "https://fvaaccshuxkvvythbuon.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6o48cRdF1WYiWadauC3kXw_Y2NCS5i7";

let clientPromise = null;

export function isSupabaseConfigured() {
  return (
    /^https:\/\/.+\.supabase\.co$/i.test(SUPABASE_URL)
    && !SUPABASE_URL.includes("YOUR_PROJECT_REF")
    && Boolean(SUPABASE_PUBLISHABLE_KEY)
    && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE")
  );
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Die Supabase-Projektkonfiguration fehlt noch.");
  }

  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }));
  }

  return clientPromise;
}
