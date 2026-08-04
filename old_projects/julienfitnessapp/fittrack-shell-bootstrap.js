// This file is copied automatically into every signed web bundle.
// It lets the Android shell activate the version only after the page loaded.
const FALLBACK_RELEASE = { webVersion: "1.0.0", bridgeVersion: 1 };

async function markFitTrackReady() {
  const shell = window.Capacitor?.Plugins?.AppShell;
  if (!shell || !window.Capacitor?.isNativePlatform?.()) return;
  try {
    const release = await fetch("./release-info.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : FALLBACK_RELEASE))
      .catch(() => FALLBACK_RELEASE);
    await shell.markWebAppReady(release);
  } catch (error) {
    console.error("FitTrack shell handshake failed", error);
  }
}

if (document.readyState === "complete") markFitTrackReady();
else window.addEventListener("load", markFitTrackReady, { once: true });
