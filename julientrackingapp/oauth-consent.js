import { getSupabaseClient } from "./supabase-client.js";

const status = document.querySelector("#consent-status");
const detailsPanel = document.querySelector("#consent-details");
const loginPanel = document.querySelector("#login-panel");
const clientName = document.querySelector("#oauth-client-name");
const clientLogo = document.querySelector("#oauth-client-logo");
const scopes = document.querySelector("#oauth-scopes");
const approveButton = document.querySelector("#oauth-approve");
const denyButton = document.querySelector("#oauth-deny");
const loginForm = document.querySelector("#login-form");

const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
let client;

if (!authorizationId) {
  showStatus("Die OAuth-Anfrage ist unvollständig. Bitte starte die Verbindung nochmals in ChatGPT.", true);
} else {
  initialize().catch((error) => showStatus(error.message || "Die Zustimmung konnte nicht geladen werden.", true));
}

async function initialize() {
  client = await getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session?.user) {
    showStatus("Bitte melde dich an, um die Verbindung zu bestätigen.");
    loginPanel.hidden = false;
    return;
  }

  const details = await authorizationDetails();
  if (!("authorization_id" in details)) {
    window.location.replace(details.redirect_url);
    return;
  }

  renderDetails(details);
  showStatus(`Angemeldet als ${sessionData.session.user.email || "FitTrack-Konto"}.`);
  detailsPanel.hidden = false;
}

async function authorizationDetails() {
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) throw error;
  return data || {};
}

function renderDetails(details) {
  const app = details.client || {};
  clientName.textContent = app.client_name || app.name || "Unbekannte App";
  if (typeof app.logo_uri === "string" && /^https:\/\//i.test(app.logo_uri)) {
    clientLogo.src = app.logo_uri;
    clientLogo.hidden = false;
  }
  const requestedScopes = String(details.scope || "openid profile email").split(/\s+/).filter(Boolean);
  scopes.replaceChildren(...requestedScopes.map((scope) => {
    const item = document.createElement("li");
    item.textContent = scopeLabel(scope);
    return item;
  }));
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value;
  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await initialize();
  } catch (error) {
    showStatus(error.message || "Anmeldung fehlgeschlagen.", true);
  } finally {
    button.disabled = false;
  }
});

approveButton.addEventListener("click", async () => {
  await decide("approveAuthorization", approveButton, "Zugriff wird erlaubt …");
});

denyButton.addEventListener("click", async () => {
  await decide("denyAuthorization", denyButton, "Zugriff wird abgelehnt …");
});

async function decide(method, button, message) {
  button.disabled = true;
  showStatus(message);
  try {
    const { data, error } = await client.auth.oauth[method](authorizationId);
    if (error) throw error;
    if (!data?.redirect_url) throw new Error("Supabase hat keine Rückkehradresse geliefert.");
    window.location.replace(data.redirect_url);
  } catch (error) {
    button.disabled = false;
    showStatus(error.message || "Die Entscheidung konnte nicht gespeichert werden.", true);
  }
}

function scopeLabel(scope) {
  return ({ openid: "Anmeldung bestätigen", profile: "Profil des angemeldeten Kontos", email: "E-Mail-Adresse des angemeldeten Kontos" })[scope] || scope;
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("form-error", isError);
}
